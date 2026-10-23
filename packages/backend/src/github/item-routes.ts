/**
 * Link/unlink GitHub Items and Issues (#52). Linking is a human action, so
 * the Activity Event carries the acting user; the External Link kind stays
 * `pr`/`issue`. Unlinking removes only the External Link — the snapshot is
 * untouched. Cross-project links require write access on both projects.
 */
import { type Context, Hono } from "hono"
import { z } from "zod"
import { githubActivityDraft } from "../workspaces/activity.js"
import { writableProject } from "../workspaces/permissions.js"
import type { GetSession } from "../workspaces/session.js"
import type { Issue, Project, WorkspaceStore } from "../workspaces/store.js"
import type {
  ExternalLink,
  ExternalLinkState,
  GitHubIssueSnapshot,
  GitHubStore,
  LinkedIssueRef,
} from "./store.js"

export type GitHubItemKind = "pr" | "issue"

const linkBody = z.object({
  kind: z.enum(["pr", "issue"]),
  repositoryId: z.string().trim().min(1),
  number: z.number().int().positive(),
  issue: z.string().trim().min(1),
})

export interface GitHubItemLinkResponse {
  link: ExternalLink
  issue: { id: string; identifier: string; title: string }
  /** Chips for the linked GitHub Item's URL, newest link first. */
  linkedIssues: LinkedIssueRef[]
}

export interface GitHubItemDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
  getSession: GetSession
}

/**
 * #50 adds GitHub Issue snapshots to `GitHubStore`. Reading the lookup
 * optionally keeps this app additive against either store generation: once
 * the Issues slice lands, `kind: "issue"` resolves snapshots without a change
 * here; before it lands the same request answers 404 like any unknown item.
 */
interface GitHubIssueSnapshotLookup {
  getGitHubIssue?(
    repositoryId: string,
    number: number
  ): Promise<GitHubIssueSnapshot | null>
}

interface ItemSnapshot {
  url: string
  title: string
  state: ExternalLinkState
}

async function findItem(
  github: GitHubStore,
  kind: GitHubItemKind,
  repositoryId: string,
  number: number
): Promise<ItemSnapshot | null> {
  if (kind === "pr") {
    const pullRequest = await github.getPullRequest(repositoryId, number)
    return pullRequest
      ? {
          url: pullRequest.url,
          title: pullRequest.title,
          state: pullRequest.state,
        }
      : null
  }
  const lookup = (github as GitHubStore & GitHubIssueSnapshotLookup)
    .getGitHubIssue
  if (!lookup) return null
  const issue = await lookup.call(github, repositoryId, number)
  return issue
    ? { url: issue.url, title: issue.title, state: issue.state }
    : null
}

function issueSummary(issue: Issue): GitHubItemLinkResponse["issue"] {
  return { id: issue.id, identifier: issue.identifier, title: issue.title }
}

export function createGitHubItemApp({
  workspaces,
  github,
  getSession,
}: GitHubItemDeps) {
  const app = new Hono()

  async function writableProjectFor(
    c: Context,
    projectId: string,
    userId: string
  ): Promise<Project | Response> {
    const project = await writableProject(workspaces, projectId, userId)
    if (project) return project
    const exists = await workspaces.getProject(projectId)
    return c.json(
      { error: exists ? "Forbidden" : "Not found" },
      exists ? 403 : 404
    )
  }

  function isResponse(value: Project | Response): value is Response {
    return value instanceof Response
  }

  async function chips(url: string): Promise<LinkedIssueRef[]> {
    const refs = await github.listLinkedIssueRefs([url])
    return refs[url] ?? []
  }

  app.post("/api/projects/:id/github/items/link", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await writableProjectFor(
      c,
      c.req.param("id"),
      session.user.id
    )
    if (isResponse(project)) return project

    const parsed = linkBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "Invalid link" }, 400)
    const { kind, repositoryId, number, issue: identifier } = parsed.data

    const repositories = await github.listProjectRepositories(project.id)
    const repository = repositories.find((row) => row.id === repositoryId)
    if (!repository) return c.json({ error: "Not found" }, 404)

    const item = await findItem(github, kind, repository.id, number)
    if (!item) return c.json({ error: "Not found" }, 404)

    const target = await workspaces.getIssue(identifier)
    if (!target) return c.json({ error: "Not found" }, 404)
    // Writing the External Link on the target Issue needs write access on its
    // project, even when it differs from the GitHub View's project.
    const targetProject = await writableProject(
      workspaces,
      target.projectId,
      session.user.id
    )
    if (!targetProject) return c.json({ error: "Forbidden" }, 403)

    const existing = (await github.findExternalLinksByUrl(item.url)).find(
      (link) => link.issueId === target.id
    )
    if (existing) {
      return c.json(
        {
          link: existing,
          issue: issueSummary(target),
          linkedIssues: await chips(item.url),
        },
        200
      )
    }

    const link = await github.createExternalLink(target.id, {
      provider: "github",
      kind,
      url: item.url,
      title: item.title,
      state: item.state,
    })
    const draft = githubActivityDraft(
      "linked",
      `Linked from ${repository.fullName} #${number}`
    )
    await workspaces.appendActivity(target.id, {
      actor: { type: "user", id: session.user.id },
      ...draft,
      payload: {
        kind,
        number,
        url: item.url,
        repository: repository.fullName,
      },
    })

    const body: GitHubItemLinkResponse = {
      link,
      issue: issueSummary(target),
      linkedIssues: await chips(item.url),
    }
    return c.json(body, 201)
  })

  app.delete("/api/issues/:key/external-links/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const issue = await workspaces.getIssue(c.req.param("key"))
    if (!issue) return c.json({ error: "Not found" }, 404)
    const project = await writableProjectFor(
      c,
      issue.projectId,
      session.user.id
    )
    if (isResponse(project)) return project

    const link = await github.getExternalLink(c.req.param("id"))
    // A link that belongs to another Issue is indistinguishable from a
    // missing one; a missing link is already the desired end state.
    if (link && link.issueId !== issue.id) {
      return c.json({ error: "Not found" }, 404)
    }
    if (link) await github.deleteExternalLink(link.id)
    return c.json({ deleted: true }, 200)
  })

  return app
}
