import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { createWorkspacesApp } from "../workspaces/routes.js"
import type { Session } from "../workspaces/session.js"
import {
  createMemoryWorkspaceStore,
  type Project,
  type Workspace,
} from "../workspaces/store.js"
import { createGitHubItemApp } from "./item-routes.js"
import type { GitHubWebhookPayload } from "./job.js"
import type { RemoteGitHubIssue, RemotePullRequest } from "./provider.js"
import { createGitHubApp } from "./routes.js"
import {
  createMemoryGitHubStore,
  type ExternalLink,
  type GitHubRepository,
  type LinkedIssueRef,
  type RemoteRepository,
} from "./store.js"
import {
  createGitHubViewApp,
  type PullRequestListResponse,
} from "./view-routes.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [viewer.id]: viewer,
  [outsider.id]: outsider,
}

const FIXED = "2026-10-10T12:00:00.000Z"

const webRepository: RemoteRepository = {
  githubId: "101",
  fullName: "acme/web",
  owner: "acme",
  name: "web",
  private: false,
  archived: false,
  issuesEnabled: true,
  defaultBranch: "main",
  pushedAt: "2026-10-01T10:00:00.000Z",
}

const remotePullRequest: RemotePullRequest = {
  number: 12,
  title: "Add the GitHub View",
  draft: false,
  authorLogin: "octocat",
  authorAvatarUrl: null,
  url: "https://github.com/acme/web/pull/12",
  sourceBranch: "feature/github-view",
  targetBranch: "main",
  checksState: "success",
  reviewDecision: "approved",
  commentCount: 2,
  bodyExcerpt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T11:00:00.000Z",
}

const remoteIssue: RemoteGitHubIssue = {
  number: 42,
  title: "Crash on login",
  authorLogin: "hubot",
  authorAvatarUrl: null,
  url: "https://github.com/acme/web/issues/42",
  labels: [],
  assignees: [],
  commentCount: 0,
  bodyExcerpt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
}

interface LinkResponse {
  link: ExternalLink
  issue: { id: string; identifier: string; title: string }
  linkedIssues: LinkedIssueRef[]
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

function jsonHeaders(userId?: string): Record<string, string> {
  return { "content-type": "application/json", ...auth(userId) }
}

async function setup() {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore({
    projectWorkspaceId: async (projectId) =>
      (await workspaces.getProject(projectId))?.workspaceId ?? null,
    getIssue: async (issueId) => {
      const issue = await workspaces.getIssue(issueId)
      return issue ? { identifier: issue.identifier, title: issue.title } : null
    },
  })

  // Acme is the view's workspace; the owner can write there.
  const workspace: Workspace = await workspaces.createWorkspace(
    owner.id,
    "Acme"
  )
  const project: Project = await workspaces.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  await workspaces.addProjectViewer(project.id, viewer.id)

  // Beta belongs to someone else; the Acme owner only holds a Viewer grant,
  // which is exactly the "write on the view project only" case.
  const otherWorkspace = await workspaces.createWorkspace(outsider.id, "Beta")
  const otherProject = await workspaces.createProject(otherWorkspace.id, {
    name: "Mobile",
    key: "MOB",
  })
  await workspaces.addProjectViewer(otherProject.id, owner.id)

  const connection = await github.upsertConnection({
    workspaceId: workspace.id,
    connectorUserId: owner.id,
    connectorAccountId: "ba-account-1",
    login: "octocat",
    scopes: ["repo"],
    encryptedAccessToken: "encrypted:token-1",
    at: FIXED,
  })
  await github.replaceAllowlist(connection.id, [webRepository], FIXED)
  const [repository] = await github.listAllowlist(connection.id)
  if (!repository) throw new Error("fixture repository missing")
  await github.replaceProjectRepositories(
    project.id,
    [repository.id],
    owner.id,
    FIXED
  )
  await github.upsertPullRequests(repository.id, [remotePullRequest], FIXED)
  await github.upsertGitHubIssues(repository.id, [remoteIssue], FIXED)
  const issueSnapshot = await github.getGitHubIssue(repository.id, 42)
  if (!issueSnapshot) throw new Error("fixture GitHub Issue missing")

  const getSession = async (req: Request) => {
    const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
    const user = match ? users[match[1]] : undefined
    return user ? { user } : null
  }

  const app = new Hono()
  app.route("/", createWorkspacesApp({ store: workspaces, getSession }))
  app.route("/", createGitHubItemApp({ workspaces, github, getSession }))
  app.route(
    "/",
    createGitHubApp({
      workspaces,
      github,
      getSession,
      enqueue: async (job: GitHubWebhookPayload) => {
        void job
      },
    })
  )
  app.route(
    "/",
    createGitHubViewApp({
      workspaces,
      github,
      getSession,
      enqueueSync: async () => {},
    })
  )

  return {
    app,
    workspaces,
    github,
    workspace,
    project,
    otherProject,
    repository: repository as GitHubRepository,
    issueSnapshot,
  }
}

async function link(
  app: Hono,
  project: Project,
  body: unknown,
  userId: string = owner.id
) {
  const res = await app.request(
    `/api/projects/${project.id}/github/items/link`,
    {
      method: "POST",
      headers: jsonHeaders(userId),
      body: JSON.stringify(body),
    }
  )
  return { res, body: (await res.json()) as LinkResponse }
}

async function pullRequestChips(app: Hono, project: Project) {
  const res = await app.request(
    `/api/projects/${project.id}/github/pull-requests`,
    { headers: auth(owner.id) }
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as PullRequestListResponse
  return body.items.find((item) => item.number === 12)?.linkedIssues ?? []
}

describe("github item link", () => {
  test("links a Pull Request to an Issue, adds the chip, and records the event", async () => {
    const { app, workspaces, project, repository } = await setup()
    const target = await workspaces.getIssue("WEB-2")
    if (!target) throw new Error("seeded issue missing")

    const { res, body } = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-2",
    })

    expect(res.status).toBe(201)
    expect(body.link).toMatchObject({
      id: expect.any(String),
      issueId: target.id,
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/12",
      title: "Add the GitHub View",
      state: "open",
    })
    expect(body.issue).toEqual({
      id: target.id,
      identifier: "WEB-2",
      title: target.title,
    })
    expect(body.linkedIssues).toEqual([
      {
        linkId: body.link.id,
        issueId: target.id,
        identifier: "WEB-2",
        title: target.title,
      },
    ])
    expect(await pullRequestChips(app, project)).toEqual(body.linkedIssues)

    const events = await workspaces.listActivity(target.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actorType: "user",
      actorId: owner.id,
      type: "github.linked",
      summary: "Linked from acme/web #12",
      payload: {
        kind: "pr",
        number: 12,
        url: "https://github.com/acme/web/pull/12",
        repository: "acme/web",
      },
    })
  })

  test("links a GitHub Issue snapshot as kind issue", async () => {
    const { app, project, repository } = await setup()

    const { res, body } = await link(app, project, {
      kind: "issue",
      repositoryId: repository.id,
      number: 42,
      issue: "WEB-1",
    })

    expect(res.status).toBe(201)
    expect(body.link).toMatchObject({
      kind: "issue",
      url: "https://github.com/acme/web/issues/42",
      title: "Crash on login",
      state: "open",
    })
    expect(body.linkedIssues[0]?.identifier).toBe("WEB-1")
  })

  test("re-linking the same Issue and URL is a 200 with the existing link", async () => {
    const { app, workspaces, project, repository } = await setup()
    const target = await workspaces.getIssue("WEB-2")
    if (!target) throw new Error("seeded issue missing")
    const input = {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-2",
    }

    const first = await link(app, project, input)
    const second = await link(app, project, input)

    expect(first.res.status).toBe(201)
    expect(second.res.status).toBe(200)
    expect(second.body.link.id).toBe(first.body.link.id)
    expect(second.body.linkedIssues).toEqual(first.body.linkedIssues)
    expect(await workspaces.listActivity(target.id)).toHaveLength(1)
  })

  test("targeting an Issue in another project requires write access there", async () => {
    const { app, project, repository } = await setup()

    const { res } = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "MOB-1",
    })

    expect(res.status).toBe(403)
  })

  test("a Viewer cannot link", async () => {
    const { app, project, repository } = await setup()

    const { res } = await link(
      app,
      project,
      {
        kind: "pr",
        repositoryId: repository.id,
        number: 12,
        issue: "WEB-1",
      },
      viewer.id
    )

    expect(res.status).toBe(403)
  })

  test("unknown repositories, items, and Issues are 404", async () => {
    const { app, project, repository } = await setup()

    const unknownRepository = await link(app, project, {
      kind: "pr",
      repositoryId: crypto.randomUUID(),
      number: 12,
      issue: "WEB-1",
    })
    expect(unknownRepository.res.status).toBe(404)

    const unknownNumber = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 999,
      issue: "WEB-1",
    })
    expect(unknownNumber.res.status).toBe(404)

    const unknownIssue = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-999",
    })
    expect(unknownIssue.res.status).toBe(404)
  })

  test("malformed bodies are rejected", async () => {
    const { app, project, repository } = await setup()
    const bodies: unknown[] = [
      {},
      {
        kind: "branch",
        repositoryId: repository.id,
        number: 12,
        issue: "WEB-1",
      },
      { kind: "pr", repositoryId: "", number: 12, issue: "WEB-1" },
      { kind: "pr", repositoryId: repository.id, number: 0, issue: "WEB-1" },
      { kind: "pr", repositoryId: repository.id, number: 1.5, issue: "WEB-1" },
      { kind: "pr", repositoryId: repository.id, number: 12, issue: "" },
    ]

    for (const body of bodies) {
      const { res } = await link(app, project, body)
      expect(res.status).toBe(400)
    }

    const invalidJson = await app.request(
      `/api/projects/${project.id}/github/items/link`,
      {
        method: "POST",
        headers: jsonHeaders(owner.id),
        body: "{",
      }
    )
    expect(invalidJson.status).toBe(400)
  })

  test("unauthenticated requests are 401", async () => {
    const { app, project, repository } = await setup()

    const res = await app.request(
      `/api/projects/${project.id}/github/items/link`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "pr",
          repositoryId: repository.id,
          number: 12,
          issue: "WEB-1",
        }),
      }
    )
    expect(res.status).toBe(401)
  })
})

describe("pasted GitHub issue URLs", () => {
  test("the existing External Link form classifies /issues/N as kind issue", async () => {
    const { app } = await setup()

    const res = await app.request("/api/issues/WEB-1/external-links", {
      method: "POST",
      headers: jsonHeaders(owner.id),
      body: JSON.stringify({ url: "https://github.com/acme/web/issues/42" }),
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      provider: "github",
      kind: "issue",
      url: "https://github.com/acme/web/issues/42",
    })
  })
})

describe("github item unlink", () => {
  test("removes the External Link and the chip without touching the item", async () => {
    const { app, workspaces, project, repository } = await setup()
    const target = await workspaces.getIssue("WEB-2")
    if (!target) throw new Error("seeded issue missing")
    const created = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-2",
    })

    const res = await app.request(
      `/api/issues/WEB-2/external-links/${created.body.link.id}`,
      { method: "DELETE", headers: auth(owner.id) }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
    const list = await app.request("/api/issues/WEB-2/external-links", {
      headers: auth(owner.id),
    })
    expect(await list.json()).toEqual([])
    expect(await pullRequestChips(app, project)).toEqual([])
    // The GitHub Item snapshot is untouched: the row is still listed.
    const prList = await app.request(
      `/api/projects/${project.id}/github/pull-requests`,
      { headers: auth(owner.id) }
    )
    const rows = (await prList.json()) as PullRequestListResponse
    expect(rows.items.map((item) => item.number)).toEqual([12])
  })

  test("unlinking another Issue's link is 404", async () => {
    const { app, workspaces, project, repository } = await setup()
    const first = await workspaces.getIssue("WEB-1")
    const second = await workspaces.getIssue("WEB-2")
    if (!first || !second) throw new Error("seeded issues missing")
    const created = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-1",
    })

    const res = await app.request(
      `/api/issues/WEB-2/external-links/${created.body.link.id}`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(res.status).toBe(404)
    expect(await workspaces.listActivity(first.id)).toHaveLength(1)
    expect(
      (
        await app.request("/api/issues/WEB-1/external-links", {
          headers: auth(owner.id),
        })
      ).status
    ).toBe(200)
  })

  test("a repeated unlink is an idempotent 200", async () => {
    const { app, project, repository } = await setup()
    const created = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-2",
    })
    const path = `/api/issues/WEB-2/external-links/${created.body.link.id}`

    const first = await app.request(path, {
      method: "DELETE",
      headers: auth(owner.id),
    })
    const second = await app.request(path, {
      method: "DELETE",
      headers: auth(owner.id),
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ deleted: true })
  })

  test("Viewers and unknown Issues cannot unlink", async () => {
    const { app, project, repository } = await setup()
    const created = await link(app, project, {
      kind: "pr",
      repositoryId: repository.id,
      number: 12,
      issue: "WEB-2",
    })
    const path = `/api/issues/WEB-2/external-links/${created.body.link.id}`

    const denied = await app.request(path, {
      method: "DELETE",
      headers: auth(viewer.id),
    })
    expect(denied.status).toBe(403)

    const unauthorized = await app.request(path, { method: "DELETE" })
    expect(unauthorized.status).toBe(401)

    const missing = await app.request(
      `/api/issues/WEB-999/external-links/${created.body.link.id}`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(missing.status).toBe(404)
  })
})
