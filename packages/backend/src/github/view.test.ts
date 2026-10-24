import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import type { Session } from "../workspaces/session.js"
import {
  createMemoryWorkspaceStore,
  type Project,
} from "../workspaces/store.js"
import { createFakeProvider } from "./fake-provider.js"
import type { RemoteGitHubIssue, RemotePullRequest } from "./provider.js"
import {
  createMemoryGitHubStore,
  type PullRequestSnapshot,
  type RemoteRepository,
} from "./store.js"
import { type GitHubSyncDeps, syncConnection, syncRepository } from "./sync.js"
import {
  createGitHubViewApp,
  type GitHubIssueListResponse,
  type GitHubIssueRow,
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

function githubIssue(overrides: Partial<RemoteGitHubIssue>): RemoteGitHubIssue {
  return {
    number: 1,
    title: "GitHub Issue",
    authorLogin: "octocat",
    authorAvatarUrl: null,
    url: "https://github.com/acme/web/issues/1",
    labels: [],
    assignees: [],
    commentCount: 0,
    bodyExcerpt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  }
}

const githubIssues: Record<string, RemoteGitHubIssue[]> = {
  "acme/web": [
    githubIssue({
      number: 5,
      title: "Login redirect loops",
      authorLogin: "hubot",
      url: "https://github.com/acme/web/issues/5",
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "enhancement", color: "a2eeef" },
      ],
      assignees: [{ login: "octocat", avatarUrl: "https://avatars/x.png" }],
      commentCount: 3,
      bodyExcerpt: "Steps to reproduce the loop.",
      updatedAt: "2026-10-05T11:00:00.000Z",
    }),
    githubIssue({
      number: 3,
      title: "Docs typo",
      authorLogin: "mona",
      url: "https://github.com/acme/web/issues/3",
      labels: [{ name: "docs", color: "0075ca" }],
      updatedAt: "2026-10-04T11:00:00.000Z",
    }),
  ],
  "acme/api": [
    githubIssue({
      number: 8,
      title: "API 500 on refresh",
      authorLogin: "octocat",
      url: "https://github.com/acme/api/issues/8",
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "hubot", avatarUrl: null }],
      commentCount: 2,
      updatedAt: "2026-10-06T11:00:00.000Z",
    }),
  ],
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

/** Per-test copy so one test's provider mutation never leaks into the next. */
function cloneRemote<T>(record: Record<string, T[]>): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(record).map(([key, items]) => [
      key,
      items.map((item) => ({ ...item })),
    ])
  )
}

async function setup(
  options: {
    issuesEnabled?: boolean
    /** Defaults to the inline adapter so the list reflects the sync. */
    inlineSync?: boolean
    startAt?: string
  } = {}
) {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore({
    projectWorkspaceId: async (projectId) =>
      (await workspaces.getProject(projectId))?.workspaceId ?? null,
    getIssue: async (issueId) => {
      const issue = await workspaces.getIssue(issueId)
      return issue ? { identifier: issue.identifier, title: issue.title } : null
    },
  })
  const issuesEnabled = options.issuesEnabled ?? true
  const remoteRepositories = [
    { ...webRepository, issuesEnabled },
    { ...apiRepository, issuesEnabled },
  ]
  const provider = createFakeProvider({
    repositories: remoteRepositories,
    pullRequests: cloneRemote(pullRequests),
    issues: cloneRemote(githubIssues),
  })
  const clock = { at: options.startAt ?? FIXED }
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
  await github.replaceAllowlist(connection.id, remoteRepositories, FIXED)
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
    now: () => new Date(clock.at),
  }
  const enqueued: string[] = []
  async function enqueueSync(repositoryId: string) {
    enqueued.push(repositoryId)
    if (options.inlineSync === false) return
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
    createGitHubViewApp({
      workspaces,
      github,
      getSession,
      enqueueSync,
      now: () => new Date(clock.at),
    })
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
  await github.createExternalLink(issue.id, {
    provider: "github",
    kind: "issue",
    url: "https://github.com/acme/web/issues/5",
    title: "Login redirect loops",
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
    clock,
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

async function listIssues(
  app: Hono,
  project: Project,
  query = "",
  userId = owner.id
) {
  const res = await app.request(
    `/api/projects/${project.id}/github/issues${query}`,
    { headers: auth(userId) }
  )
  return { res, body: (await res.json()) as GitHubIssueListResponse }
}

async function issueChips(
  app: Hono,
  project: Project,
  number: number,
  userId = owner.id
) {
  const { body } = await listIssues(app, project, "", userId)
  return body.items.find((item) => item.number === number)?.linkedIssues ?? []
}

async function pullRequestChips(
  app: Hono,
  project: Project,
  userId = owner.id
) {
  const { body } = await list(app, project, "", userId)
  return body.items.find((item) => item.number === 12)?.linkedIssues ?? []
}

interface RefreshBody {
  accepted?: boolean
  enqueued?: number
  lastSyncedAt?: string | null
  /** Present on a 429. */
  error?: string
  retryAfter?: number
}

async function refresh(
  app: Hono,
  project: Project,
  userId = owner.id,
  body?: unknown
): Promise<{ res: Response; body: RefreshBody }> {
  const res = await app.request(`/api/projects/${project.id}/github/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(userId) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { res, body: (await res.json()) as RefreshBody }
}

function numbers(items: PullRequestSnapshot[]): number[] {
  return items.map((item) => item.number)
}

function issueNumbers(items: GitHubIssueRow[]): number[] {
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
        lastSyncedAt: FIXED,
      },
      {
        id: expect.any(String),
        fullName: "acme/web",
        issuesEnabled: true,
        unavailable: false,
        lastSyncedAt: FIXED,
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

  test("linked Issue chips omit targets the reader cannot read", async () => {
    const { app, project, github, workspaces } = await setup()
    const otherIssue = await workspaces.getIssue("MOB-1")
    if (!otherIssue) throw new Error("seeded issue missing")
    await github.createExternalLink(otherIssue.id, {
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/12",
      title: "Add the GitHub View",
      state: "open",
    })

    const ownerChips = await pullRequestChips(app, project, owner.id)
    expect(ownerChips.map((chip) => chip.identifier).sort()).toEqual([
      "MOB-1",
      "WEB-1",
    ])

    const viewerChips = await pullRequestChips(app, project, viewer.id)
    expect(viewerChips.map((chip) => chip.identifier)).toEqual(["WEB-1"])
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
    const { app, project, provider, web, api, enqueued, clock } = await setup()
    provider.pullRequests["acme/web"] = [
      ...(provider.pullRequests["acme/web"] ?? []),
      pullRequest({
        number: 21,
        title: "Freshly opened",
        url: "https://github.com/acme/web/pull/21",
        updatedAt: "2026-10-11T09:00:00.000Z",
      }),
    ]
    provider.issues["acme/web"] = [
      ...(provider.issues["acme/web"] ?? []),
      githubIssue({
        number: 11,
        title: "Freshly filed GitHub Issue",
        url: "https://github.com/acme/web/issues/11",
        updatedAt: "2026-10-11T09:00:00.000Z",
      }),
    ]

    // Six minutes after the last sync: both repositories are due.
    clock.at = "2026-10-10T12:06:00.000Z"
    const { res, body } = await refresh(app, project)
    expect(res.status).toBe(202)
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

    const refreshedIssues = await listIssues(app, project)
    expect(refreshedIssues.body.items[0]).toMatchObject({
      number: 11,
      title: "Freshly filed GitHub Issue",
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

  test("refresh enqueues only repositories older than five minutes and serves the snapshot immediately", async () => {
    const { app, project, clock, enqueued, web, api } = await setup({
      inlineSync: false,
    })

    // Four minutes after the last sync: fresh.
    clock.at = "2026-10-10T12:04:00.000Z"
    const fresh = await refresh(app, project)
    expect(fresh.res.status).toBe(202)
    expect(fresh.body).toEqual({
      accepted: true,
      enqueued: 0,
      lastSyncedAt: FIXED,
    })
    expect(enqueued).toEqual([])

    // Six minutes after the last sync: both repositories are due.
    clock.at = "2026-10-10T12:06:00.000Z"
    const stale = await refresh(app, project)
    expect(stale.res.status).toBe(202)
    expect(stale.body).toEqual({
      accepted: true,
      enqueued: 2,
      lastSyncedAt: FIXED,
    })
    expect([...enqueued].sort()).toEqual([web.id, api.id].sort())

    // The cached snapshot stays on screen while the queue catches up.
    const { body } = await list(app, project)
    expect(numbers(body.items)).toEqual([7, 9, 12, 5])
    expect(body.lastSyncedAt).toBe(FIXED)
  })

  test("manual refresh is throttled per workspace to once a minute", async () => {
    const { app, project, clock } = await setup({ inlineSync: false })
    clock.at = "2026-10-10T12:06:00.000Z"

    const first = await refresh(app, project)
    expect(first.res.status).toBe(202)
    expect(first.body.accepted).toBe(true)

    clock.at = "2026-10-10T12:06:30.000Z"
    const throttled = await refresh(app, project)
    expect(throttled.res.status).toBe(429)
    expect(throttled.body).toEqual({
      error: "Refresh throttled",
      retryAfter: 30,
    })
    expect(throttled.res.headers.get("retry-after")).toBe("30")

    // Exactly sixty seconds after the accepted refresh: allowed again.
    clock.at = "2026-10-10T12:07:00.000Z"
    const allowed = await refresh(app, project)
    expect(allowed.res.status).toBe(202)
  })

  test("automatic refresh neither checks nor stamps the manual throttle", async () => {
    const { app, project, clock, enqueued } = await setup({ inlineSync: false })
    clock.at = "2026-10-10T12:06:00.000Z"

    const automatic = await refresh(app, project, owner.id, {
      automatic: true,
    })
    expect(automatic.res.status).toBe(202)
    expect(automatic.body).toEqual({
      accepted: true,
      enqueued: 2,
      lastSyncedAt: FIXED,
    })
    expect(enqueued).toHaveLength(2)

    // An automatic refresh never stamps lastManualRefreshAt: a manual refresh
    // immediately after is accepted (and starts the window itself).
    const manual = await refresh(app, project)
    expect(manual.res.status).toBe(202)

    clock.at = "2026-10-10T12:06:30.000Z"
    const throttled = await refresh(app, project)
    expect(throttled.res.status).toBe(429)
    expect(throttled.body.retryAfter).toBe(30)
  })

  test("an automatic refresh still enqueues inside an open manual window", async () => {
    const { app, project, clock, enqueued, web, api } = await setup({
      inlineSync: false,
    })
    clock.at = "2026-10-10T12:06:00.000Z"
    expect((await refresh(app, project)).res.status).toBe(202)
    enqueued.length = 0

    clock.at = "2026-10-10T12:06:30.000Z"
    const automatic = await refresh(app, project, owner.id, {
      automatic: true,
    })
    expect(automatic.res.status).toBe(202)
    expect(automatic.body.enqueued).toBe(2)
    expect([...enqueued].sort()).toEqual([web.id, api.id].sort())

    // The window still belongs to the earlier manual request.
    expect((await refresh(app, project)).res.status).toBe(429)
  })

  test("the throttle is per workspace, so another connection still refreshes", async () => {
    const { app, project, github, workspaces, clock } = await setup({
      inlineSync: false,
    })
    const beta = await workspaces.createWorkspace(owner.id, "Beta")
    const betaProject = await workspaces.createProject(beta.id, {
      name: "Beta App",
      key: "BET",
    })
    const betaConnection = await github.upsertConnection({
      workspaceId: beta.id,
      connectorUserId: owner.id,
      connectorAccountId: "ba-account-2",
      login: "octocat",
      scopes: ["repo"],
      encryptedAccessToken: "encrypted:token-2",
      at: FIXED,
    })
    await github.replaceAllowlist(
      betaConnection.id,
      [
        {
          ...webRepository,
          githubId: "201",
          fullName: "beta/app",
          owner: "beta",
          name: "app",
        },
      ],
      FIXED
    )
    const betaRepositories = await github.listAllowlist(betaConnection.id)
    const betaRepository = betaRepositories[0]
    if (!betaRepository) throw new Error("beta fixture repository missing")
    await github.replaceProjectRepositories(
      betaProject.id,
      [betaRepository.id],
      owner.id,
      FIXED
    )

    clock.at = "2026-10-10T12:06:00.000Z"
    expect((await refresh(app, project)).res.status).toBe(202)
    expect((await refresh(app, project)).res.status).toBe(429)

    const betaRefresh = await refresh(app, betaProject)
    expect(betaRefresh.res.status).toBe(202)
    expect(betaRefresh.body.enqueued).toBe(1)
  })
})

describe("github view status", () => {
  test("returns the same non-item envelope as the lists", async () => {
    const { app, project } = await setup()
    const res = await app.request(`/api/projects/${project.id}/github/status`, {
      headers: auth(owner.id),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      connection: { status: "active", login: "octocat" },
      repositories: [
        {
          id: expect.any(String),
          fullName: "acme/api",
          issuesEnabled: true,
          unavailable: false,
          lastSyncedAt: FIXED,
        },
        {
          id: expect.any(String),
          fullName: "acme/web",
          issuesEnabled: true,
          unavailable: false,
          lastSyncedAt: FIXED,
        },
      ],
      lastSyncedAt: FIXED,
    })
  })

  test("reports per-repository freshness alongside the newest project sync", async () => {
    const { app, project, github, web } = await setup()
    await github.updateRepository(web.id, { lastSyncedAt: null })

    const res = await app.request(`/api/projects/${project.id}/github/status`, {
      headers: auth(owner.id),
    })
    const body = (await res.json()) as {
      repositories: Array<{ fullName: string; lastSyncedAt: string | null }>
      lastSyncedAt: string | null
    }
    expect(
      body.repositories.find((repository) => repository.fullName === "acme/web")
        ?.lastSyncedAt
    ).toBeNull()
    expect(
      body.repositories.find((repository) => repository.fullName === "acme/api")
        ?.lastSyncedAt
    ).toBe(FIXED)
    // The project-wide value still reports the newest sync.
    expect(body.lastSyncedAt).toBe(FIXED)
  })

  test("status is project read: Viewer 200, outsider 403, anonymous 401, missing 404", async () => {
    const { app, project } = await setup()
    const read = (userId?: string) =>
      app.request(`/api/projects/${project.id}/github/status`, {
        headers: auth(userId),
      })

    expect((await read(viewer.id)).status).toBe(200)
    expect((await read(outsider.id)).status).toBe(403)
    expect((await read()).status).toBe(401)
    expect(
      (
        await app.request(
          "/api/projects/00000000-0000-4000-8000-000000000000/github/status",
          { headers: auth(owner.id) }
        )
      ).status
    ).toBe(404)
  })

  test("reports a paused connection and unavailable repositories without dropping the snapshot", async () => {
    const { app, project, github, workspace, web } = await setup()
    await github.setConnectionStatus(workspace.id, "reconnect_required")
    await github.updateRepository(web.id, {
      syncError: "GitHub access forbidden",
    })

    const res = await app.request(`/api/projects/${project.id}/github/status`, {
      headers: auth(viewer.id),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      connection: { status: string; login: string } | null
      repositories: Array<{ fullName: string; unavailable: boolean }>
      lastSyncedAt: string | null
    }
    expect(body.connection).toEqual({
      status: "reconnect_required",
      login: "octocat",
    })
    expect(
      body.repositories.find((repository) => repository.fullName === "acme/web")
        ?.unavailable
    ).toBe(true)
    expect(
      body.repositories.find((repository) => repository.fullName === "acme/api")
        ?.unavailable
    ).toBe(false)
    expect(body.lastSyncedAt).toBe(FIXED)
  })

  test("an unconnected workspace reports an empty status", async () => {
    const { app, workspaces } = await setup()
    const beta = await workspaces.createWorkspace(owner.id, "Beta")
    const project = await workspaces.createProject(beta.id, {
      name: "Beta App",
      key: "BET",
    })
    const res = await app.request(`/api/projects/${project.id}/github/status`, {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      connection: null,
      repositories: [],
      lastSyncedAt: null,
    })
  })
})

describe("github view issues", () => {
  test("lists GitHub Issues with labels, assignees, comments, author, and linked Issue chips", async () => {
    const { app, project, web } = await setup()
    const { res, body } = await listIssues(app, project)

    expect(res.status).toBe(200)
    expect(issueNumbers(body.items)).toEqual([8, 5, 3])
    // Pull Requests never appear in the Issues list.
    expect(issueNumbers(body.items)).not.toContain(12)
    expect(issueNumbers(body.items)).not.toContain(9)
    expect(body.nextCursor).toBeNull()
    expect(body.lastSyncedAt).toBe(FIXED)
    expect(body.connection).toEqual({ status: "active", login: "octocat" })
    expect(body.repositories.map((repository) => repository.fullName)).toEqual([
      "acme/api",
      "acme/web",
    ])

    const row = body.items.find((item) => item.number === 5)
    expect(row).toMatchObject({
      repositoryId: web.id,
      number: 5,
      title: "Login redirect loops",
      state: "open",
      authorLogin: "hubot",
      url: "https://github.com/acme/web/issues/5",
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "enhancement", color: "a2eeef" },
      ],
      assignees: [{ login: "octocat", avatarUrl: "https://avatars/x.png" }],
      commentCount: 3,
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

    const apiRow = body.items.find((item) => item.number === 8)
    expect(apiRow).toMatchObject({
      repository: "acme/api",
      authorLogin: "octocat",
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "hubot", avatarUrl: null }],
      commentCount: 2,
      linkedIssues: [],
    })
  })

  test("linked Issue chips omit targets the reader cannot read", async () => {
    const { app, project, github, workspaces } = await setup()
    const otherIssue = await workspaces.getIssue("MOB-1")
    if (!otherIssue) throw new Error("seeded issue missing")
    await github.createExternalLink(otherIssue.id, {
      provider: "github",
      kind: "issue",
      url: "https://github.com/acme/web/issues/5",
      title: "Login redirect loops",
      state: "open",
    })

    const ownerChips = await issueChips(app, project, 5, owner.id)
    expect(ownerChips.map((chip) => chip.identifier).sort()).toEqual([
      "MOB-1",
      "WEB-1",
    ])

    const viewerChips = await issueChips(app, project, 5, viewer.id)
    expect(viewerChips.map((chip) => chip.identifier)).toEqual(["WEB-1"])
  })

  test("filters by state, author, label, and text, with recently updated first", async () => {
    const { app, project, github, web } = await setup()

    const defaultOrder = await listIssues(app, project)
    expect(issueNumbers(defaultOrder.body.items)).toEqual([8, 5, 3])

    const byAuthor = await listIssues(app, project, "?author=MONA")
    expect(issueNumbers(byAuthor.body.items)).toEqual([3])

    const byLabel = await listIssues(app, project, "?label=BUG")
    expect(issueNumbers(byLabel.body.items)).toEqual([8, 5])

    const byText = await listIssues(app, project, "?q=LOGIN")
    expect(issueNumbers(byText.body.items)).toEqual([5])

    await github.setGitHubIssueState(
      web.id,
      3,
      {
        state: "closed",
        closedAt: "2026-10-03T10:00:00.000Z",
        githubUpdatedAt: "2026-10-03T10:00:00.000Z",
      },
      FIXED
    )
    const open = await listIssues(app, project)
    expect(issueNumbers(open.body.items)).toEqual([8, 5])
    const closed = await listIssues(app, project, "?state=closed")
    expect(issueNumbers(closed.body.items)).toEqual([3])
    const all = await listIssues(app, project, "?state=all")
    expect(issueNumbers(all.body.items)).toEqual([8, 5, 3])

    const merged = await listIssues(app, project, "?state=merged")
    expect(merged.res.status).toBe(400)
    const invalid = await listIssues(app, project, "?state=nope")
    expect(invalid.res.status).toBe(400)
    const invalidLimit = await listIssues(app, project, "?limit=0")
    expect(invalidLimit.res.status).toBe(400)
  })

  test("paginates issue results with the opaque cursor", async () => {
    const { app, project } = await setup()
    const first = await listIssues(app, project, "?limit=2&state=all")
    expect(issueNumbers(first.body.items)).toEqual([8, 5])
    expect(first.body.nextCursor).toEqual(expect.any(String))

    const second = await listIssues(
      app,
      project,
      `?limit=2&state=all&cursor=${first.body.nextCursor}`
    )
    expect(issueNumbers(second.body.items)).toEqual([3])
    expect(second.body.nextCursor).toBeNull()
  })

  test("derives author and label filter options from the whole snapshot", async () => {
    const { app, project } = await setup()
    const { body } = await listIssues(app, project, "?label=docs")

    expect(issueNumbers(body.items)).toEqual([3])
    expect(body.filters).toEqual({
      authors: ["hubot", "mona", "octocat"],
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "docs", color: "0075ca" },
        { name: "enhancement", color: "a2eeef" },
      ],
    })
  })

  test("Viewers read the Issues list, anonymous requests are 401, outsiders are 403", async () => {
    const { app, project } = await setup()

    const viewerRead = await listIssues(app, project, "", viewer.id)
    expect(viewerRead.res.status).toBe(200)
    expect(viewerRead.body.items).toHaveLength(3)

    const outsiderRead = await listIssues(app, project, "", outsider.id)
    expect(outsiderRead.res.status).toBe(403)

    const anonymous = await app.request(
      `/api/projects/${project.id}/github/issues`
    )
    expect(anonymous.status).toBe(401)

    const missing = await listIssues(app, {
      ...project,
      id: "00000000-0000-4000-8000-000000000000",
    } as Project)
    expect(missing.res.status).toBe(404)
  })

  test("a repository with Issues disabled returns an explanatory empty envelope", async () => {
    const { app, project, web } = await setup({ issuesEnabled: false })
    const { res, body } = await listIssues(app, project)

    expect(res.status).toBe(200)
    expect(body.items).toEqual([])
    expect(body.repositories).toEqual([
      {
        id: expect.any(String),
        fullName: "acme/api",
        issuesEnabled: false,
        unavailable: false,
        lastSyncedAt: FIXED,
      },
      {
        id: web.id,
        fullName: "acme/web",
        issuesEnabled: false,
        unavailable: false,
        lastSyncedAt: FIXED,
      },
    ])
    expect(body.lastSyncedAt).toBe(FIXED)
    // The repository still syncs Pull Requests.
    const pullRequests = await list(app, project)
    expect(numbers(pullRequests.body.items)).toEqual([7, 9, 12, 5])
  })
})
