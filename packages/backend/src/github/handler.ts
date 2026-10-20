/**
 * Webhook job handler (T6 – External Links). Processes one typed
 * `github-webhook` queue job: resolves KEY-N references from the PR branch
 * and body against the installed workspace, upserts External Links with the
 * cached PR title/state, and appends a `github.*` Activity Event. Merge is
 * badge-only: the handler never moves Issue Status.
 */
import { githubActivityDraft } from "../workspaces/activity.js"
import type { WorkspaceStore } from "../workspaces/store.js"
import { extractIssueRefs } from "./parse.js"
import type { ExternalLinkState, GitHubStore } from "./store.js"

export type PullRequestAction = "opened" | "synchronize" | "closed"

export interface PullRequestEvent {
  deliveryId: string
  action: PullRequestAction
  repoFullName: string
  branch: string
  body: string
  url: string
  title: string
  number: number
  merged: boolean
}

export interface PullRequestResult {
  skipped: boolean
  linked: string[]
}

export interface PushCommit {
  sha: string
  message: string
  url: string
}

export interface PushEvent {
  deliveryId: string
  repoFullName: string
  commits: PushCommit[]
}

export interface HandlerDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
}

function stateFor(event: PullRequestEvent): ExternalLinkState {
  if (event.action === "closed") return event.merged ? "merged" : "closed"
  return "open"
}

function timelineKind(
  event: PullRequestEvent,
  created: boolean,
  state: ExternalLinkState,
  previous: ExternalLinkState | null
): string | null {
  if (created) return "link.opened"
  if (state !== previous) {
    if (state === "merged") return "link.merged"
    if (state === "closed") return "link.closed"
    return "link.reopened"
  }
  if (event.action === "synchronize") return null
  return null
}

export async function handlePullRequestEvent(
  { workspaces, github }: HandlerDeps,
  event: PullRequestEvent
): Promise<PullRequestResult> {
  if (await github.hasProcessedDelivery(event.deliveryId)) {
    return { skipped: true, linked: [] }
  }
  await github.markDeliveryProcessed(event.deliveryId)

  const install = await github.findInstallByRepo(event.repoFullName)
  if (!install) return { skipped: false, linked: [] }

  // The spec parser line covers "branch name and PR body" extraction for PR
  // events; the PR title joins the extractor input as a superset because
  // titles routinely carry the KEY-N when the body does not.
  const refs = extractIssueRefs(`${event.branch} ${event.title} ${event.body}`)
  const state = stateFor(event)
  const linked: string[] = []

  for (const ref of refs) {
    const issue = await workspaces.getIssue(ref)
    if (!issue) continue
    const project = await workspaces.getProject(issue.projectId)
    if (!project || project.workspaceId !== install.workspaceId) continue

    const existing = (await github.listExternalLinks(issue.id)).find(
      (link) => link.url === event.url
    )
    const created = !existing
    if (created) {
      // kind=pr is correct here: the event IS a pull_request delivery, so the
      // auto-created External Link is the PR itself. branch/commit kinds stay
      // on the manual-paste path (T6 parseExternalUrl) plus the push path
      // below, which is the only genuine event source for commit links.
      await github.createExternalLink(issue.id, {
        provider: "github",
        kind: "pr",
        url: event.url,
        title: event.title,
        state,
      })
    } else if (existing.title !== event.title || existing.state !== state) {
      await github.updateExternalLink(existing.id, {
        title: event.title,
        state,
      })
    }
    const kind = timelineKind(event, created, state, existing?.state ?? null)
    if (kind) {
      await workspaces.appendActivity(issue.id, {
        actor: { type: "github", id: null },
        ...githubActivityDraft(
          kind,
          `PR #${event.number} ${event.action}${event.merged ? " (merged)" : ""}`
        ),
      })
    }
    linked.push(ref)
  }

  return { skipped: false, linked }
}

/**
 * Push-event auto-link (T6 follow-up to story 23 "auto-link when branch/PR
 * text contains WEB-123"). Creates kind=commit External Links for pushed
 * commits whose message contains KEY-N. Mirrors the PR path's T6 patterns:
 * delivery-id idempotency first, install scoping by repo, URL dedupe so
 * redelivery never duplicates, and badge-only behavior (commits carry no
 * open/merged state and never move Issue Status).
 */
export async function handlePushEvent(
  { workspaces, github }: HandlerDeps,
  event: PushEvent
): Promise<PullRequestResult> {
  if (await github.hasProcessedDelivery(event.deliveryId)) {
    return { skipped: true, linked: [] }
  }
  await github.markDeliveryProcessed(event.deliveryId)

  const install = await github.findInstallByRepo(event.repoFullName)
  if (!install) return { skipped: false, linked: [] }

  const linked: string[] = []

  for (const commit of event.commits) {
    const refs = extractIssueRefs(commit.message)
    for (const ref of refs) {
      const issue = await workspaces.getIssue(ref)
      if (!issue) continue
      const project = await workspaces.getProject(issue.projectId)
      if (!project || project.workspaceId !== install.workspaceId) continue

      const existing = (await github.listExternalLinks(issue.id)).find(
        (link) => link.url === commit.url
      )
      if (!existing) {
        const title = commit.message.split("\n")[0].trim().slice(0, 120)
        await github.createExternalLink(issue.id, {
          provider: "github",
          kind: "commit",
          url: commit.url,
          title: title === "" ? commit.sha : title,
          state: null,
        })
        await workspaces.appendActivity(issue.id, {
          actor: { type: "github", id: null },
          ...githubActivityDraft(
            "link.opened",
            `Commit ${commit.sha.slice(0, 7)} pushed`
          ),
        })
      }
      if (!linked.includes(ref)) linked.push(ref)
    }
  }

  return { skipped: false, linked }
}
