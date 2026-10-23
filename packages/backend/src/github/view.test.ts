import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { Session } from "../workspaces/session.js"
import {
  createMemoryWorkspaceStore,
  type Project,
} from "../workspaces/store.js"
import { createFakeProvider } from "./fake-provider.js"
import type { RemotePullRequest } from "./provider.js"
import {
  createMemoryGitHubStore,
  type PullRequestSnapshot,
  type RemoteRepository,
} from "./store.js"
import { type GitHubSyncDeps, syncConnection, syncRepository } from "./sync.js"
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

const apiRepository: RemoteRepository = {
  ...webRepository,
  githubId: "102",
  fullName: "acme/api",
  owner: "acme",
  name: "api",
}

function pullRequest(overrides: Partial<RemotePullRequest>): RemotePullRequest {
  return {
    number: 1,
    title: "Pull request",
    draft: false,
    authorLogin: "octocat",
    authorAvatarUrl: null,
    url: "https://github.com/acme/web/pull/1",
    sourceBranch: "feature",
    targetBranch: "main",
    checksState: "success",
    reviewDecision: "approved",
    commentCount: 0,
    bodyExcerpt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  }
}

const pullRequests: Record<string, RemotePullRequest[]> = {
  "acme/web": [
    pullRequest({
      number: 12,
      title: "Add the GitHub View",
      url: "https://github.com/acme/web/pull/12",
      authorLogin: "octocat",
      draft: true,
      sourceBranch: "feature/github-view",
      checksState: "pending",
      reviewDecision: "review_required",
      commentCount: 4,
      updatedAt: "2026-10-02T11:00:00.000Z",
    }),
    pullRequest({
      number: 9,
      title: "Fix login redirect",
      url: "https://github.com/acme/web/pull/9",
      authorLogin: "hubot",
      checksState: "failure",
      reviewDecision: "changes_requested",
      commentCount: 1,
      updatedAt: "2026-10-03T11:00:00.000Z",
    }),
    pullRequest({
      number: 5,
      title: "Tidy the readme",
      url: "https://github.com/acme/web/pull/5",
      authorLogin: "octocat",
      checksState: null,
      reviewDecision: null,
      updatedAt: "2026-10-01T11:00:00.000Z",
    }),
  ],
  "acme/api": [
    pullRequest({
      number: 7,
      title: "API view endpoint",
      url: "https://github.com/acme/api/pull/7",
      authorLogin: "octocat",
      updatedAt: "2026-10-04T11:00:00.000Z",
    }),
  ],
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
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
  const provider = createFakeProvider({
    repositories: [webRepository, apiRepository],
    pullRequests,
  })
  const workspace = await workspaces.createWorkspace(owner.id, "Acme")
  const project = await workspaces.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  const other = await workspaces.createProject(workspace.id, {
    name: "Mobile",
    key: "MOB",
  })
  await workspaces.addProjectViewer(project.id, viewer.id)

  const connection = await github.upsertConnection({
    workspaceId: workspace.id,
    connectorUserId: owner.id,
    connectorAccountId: "ba-account-1",
    login: "octocat",
    scopes: ["repo"],
    encryptedAccessToken: "encrypted:token-1",
    at: FIXED,
  })
  await github.replaceAllowlist(
    connection.id,
    [webRepository, apiRepository],
    FIXED
  )
  const repositories = await github.listAllowlist(connection.id)
  const web = repositories.find((row) => row.fullName === "acme/web")
  const api = repositories.find((row) => row.fullName === "acme/api")
  if (!web || !api) throw new Error("fixture repositories missing")
  await github.replaceProjectRepositories(
    project.id,
    [web.id, api.id],
    owner.id,
    FIXED
  )

  const deps: GitHubSyncDeps = {
    github,
    workspaces,
    provider,
    decrypt: () => "token-1",
    now: () => new Date(FIXED),
  }
  const enqueued: string[] = []
  async function enqueueSync(repositoryId: string) {
    enqueued.push(repositoryId)
    await syncRepository(deps, repositoryId)
  }

  const app = new Hono()
  const getSession = async (req: Request) => {
    const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
    const user = match ? users[match[1]] : undefined
    return user ? { user } : null
  }
  app.route(
    "/",
    createGitHubViewApp({ workspaces, github, getSession, enqueueSync })
  )

  await syncConnection(deps, connection.id)
  const issue = await workspaces.getIssue("WEB-1")
  if (!issue) throw new Error("seeded issue missing")
  await github.createExternalLink(issue.id, {
    provider: "github",
    kind: "pr",
    url: "https://github.com/acme/web/pull/12",
    title: "Add the GitHub View",
    state: "open",
  })

  return {
    app,
    workspaces,
    github,
    provider,
    deps,
    workspace,
    project,
    other,
    connection,
    web,
    api,
    issue,
    enqueued,
  }
}

async function list(
  app: Hono,
  project: Project,
  query = "",
  userId = owner.id
) {
  const res = await app.request(
    `/api/projects/${project.id}/github/pull-requests${query}`,
    { headers: auth(userId) }
  )
  return { res, body: (await res.json()) as PullRequestListResponse }
}

function numbers(items: PullRequestSnapshot[]): number[] {
  return items.map((item) => item.number)
}

describe("github view pull requests", () => {
  test("lists Pull Requests with decision signals, repository, and linked Issue chips", async () => {
    const { app, project, web } = await setup()
    const { res, body } = await list(app, project)

    expect(res.status).toBe(200)
    expect(numbers(body.items)).toEqual([7, 9, 12, 5])
    expect(body.nextCursor).toBeNull()
    expect(body.lastSyncedAt).toBe(FIXED)
    expect(body.connection).toEqual({ status: "active", login: "octocat" })
    expect(body.repositories).toEqual([
      {
        id: expect.any(String),
        fullName: "acme/api",
        issuesEnabled: true,
        unavailable: false,
      },
      {
        id: expect.any(String),
        fullName: "acme/web",
        issuesEnabled: true,
        unavailable: false,
      },
    ])
    expect(body.filters).toEqual({
      authors: ["hubot", "octocat"],
      labels: [],
    })

    const row = body.items.find((item) => item.number === 12)
    expect(row).toMatchObject({
      repositoryId: web.id,
      number: 12,
      title: "Add the GitHub View",
      state: "open",
      draft: true,
      authorLogin: "octocat",
      url: "https://github.com/acme/web/pull/12",
      sourceBranch: "feature/github-view",
      targetBranch: "main",
      checksState: "pending",
      reviewDecision: "review_required",
      commentCount: 4,
      repository: "acme/web",
      linkedIssues: [
        {
          linkId: expect.any(String),
          issueId: expect.any(String),
          identifier: "WEB-1",
          title: "Tour the List, Table, and Kanban views",
        },
      ],
    })
    expect(body.items.find((item) => item.number === 7)?.repository).toBe(
      "acme/api"
    )
    expect(body.items.find((item) => item.number === 9)?.linkedIssues).toEqual(
      []
    )
  })

  test("filters by state, author, and text, with recently updated first", async () => {
    const { app, project, github, web } = await setup()

    const byAuthor = await list(app, project, "?author=OCTOCAT")
    expect(numbers(byAuthor.body.items)).toEqual([7, 12, 5])

    const byText = await list(app, project, "?q=VIEW")
    expect(numbers(byText.body.items)).toEqual([7, 12])

    await github.setPullRequestState(
      web.id,
      5,
      {
        state: "closed",
        mergedAt: null,
        closedAt: "2026-10-05T10:00:00.000Z",
        githubUpdatedAt: "2026-10-05T10:00:00.000Z",
      },
      FIXED
    )
    const open = await list(app, project)
    expect(numbers(open.body.items)).toEqual([7, 9, 12])
    const closed = await list(app, project, "?state=closed")
    expect(numbers(closed.body.items)).toEqual([5])
    const all = await list(app, project, "?state=all")
    expect(numbers(all.body.items)).toEqual([5, 7, 9, 12])

    const invalid = await list(app, project, "?state=nope")
    expect(invalid.res.status).toBe(400)
    const invalidLimit = await list(app, project, "?limit=0")
    expect(invalidLimit.res.status).toBe(400)
    const enormous = await list(app, project, "?limit=101")
    expect(enormous.res.status).toBe(400)
  })

  test("paginates with the opaque cursor", async () => {
    const { app, project } = await setup()
    const first = await list(app, project, "?limit=2&state=all")
    expect(numbers(first.body.items)).toEqual([7, 9])
    expect(first.body.nextCursor).toEqual(expect.any(String))

    const second = await list(
      app,
      project,
      `?limit=2&state=all&cursor=${first.body.nextCursor}`
    )
    expect(numbers(second.body.items)).toEqual([12, 5])
    expect(second.body.nextCursor).toBeNull()
  })

  test("empty states: no connection, then a connection with no linked repositories", async () => {
    const { app, workspace, workspaces } = await setup()
    const beta = await workspaces.createWorkspace(owner.id, "Beta")
    const unconnected = await workspaces.createProject(beta.id, {
      name: "Beta App",
      key: "BET",
    })
    const unconnectedRead = await list(app, unconnected)
    expect(unconnectedRead.res.status).toBe(200)
    expect(unconnectedRead.body).toEqual({
      items: [],
      nextCursor: null,
      lastSyncedAt: null,
      connection: null,
      repositories: [],
      filters: { authors: [], labels: [] },
    })

    const project = await workspaces.createProject(workspace.id, {
      name: "Empty",
      key: "EMP",
    })
    const empty = await list(app, project)
    expect(empty.res.status).toBe(200)
    expect(empty.body.items).toEqual([])
    expect(empty.body.connection).toEqual({
      status: "active",
      login: "octocat",
    })
    expect(empty.body.repositories).toEqual([])
    expect(empty.body.lastSyncedAt).toBeNull()
  })

  test("Viewers read the list, anonymous requests are 401, outsiders are 403", async () => {
    const { app, project } = await setup()

    const viewerRead = await list(app, project, "", viewer.id)
    expect(viewerRead.res.status).toBe(200)
    expect(viewerRead.body.items).toHaveLength(4)

    const outsiderRead = await list(app, project, "", outsider.id)
    expect(outsiderRead.res.status).toBe(403)

    const anonymous = await app.request(
      `/api/projects/${project.id}/github/pull-requests`
    )
    expect(anonymous.status).toBe(401)

    const missing = await list(app, {
      ...project,
      id: "00000000-0000-4000-8000-000000000000",
    } as Project)
    expect(missing.res.status).toBe(404)
  })

  test("manual refresh enqueues every linked repository and the list reflects the sync", async () => {
    const { app, project, provider, web, api, enqueued } = await setup()
    provider.pullRequests["acme/web"] = [
      ...(provider.pullRequests["acme/web"] ?? []),
      pullRequest({
        number: 21,
        title: "Freshly opened",
        url: "https://github.com/acme/web/pull/21",
        updatedAt: "2026-10-11T09:00:00.000Z",
      }),
    ]

    const res = await app.request(
      `/api/projects/${project.id}/github/refresh`,
      { method: "POST", headers: auth(owner.id) }
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as {
      accepted: boolean
      enqueued: number
      lastSyncedAt: string | null
    }
    expect(body).toEqual({
      accepted: true,
      enqueued: 2,
      lastSyncedAt: FIXED,
    })
    expect([...enqueued].sort()).toEqual([web.id, api.id].sort())

    const refreshed = await list(app, project)
    expect(refreshed.body.items[0]).toMatchObject({
      number: 21,
      title: "Freshly opened",
    })
  })

  test("manual refresh needs a connection", async () => {
    const { app, workspaces } = await setup()
    const beta = await workspaces.createWorkspace(owner.id, "Beta")
    const project = await workspaces.createProject(beta.id, {
      name: "Beta App",
      key: "BET",
    })
    const res = await app.request(
      `/api/projects/${project.id}/github/refresh`,
      { method: "POST", headers: auth(owner.id) }
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "GitHub is not connected" })
  })
})
