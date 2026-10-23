import { afterEach, describe, expect, test, vi } from "vitest"
import {
  ApiError,
  api,
  issueProgress,
  isTerminalStatusCategory,
  type Status,
  statusCategorySchema,
} from "./api.js"

function mockFetchOnce(payload: unknown, init?: { status?: number }) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json" },
    })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("workspace api client", () => {
  test("listWorkspaces sends credentials and parses workspaces", async () => {
    const fetchMock = mockFetchOnce([
      { id: "ws-1", name: "Acme", role: "Owner" },
    ])

    const result = await api.listWorkspaces()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces")
    expect(options.credentials).toBe("include")
    expect(result).toEqual([{ id: "ws-1", name: "Acme", role: "Owner" }])
  })

  test("createWorkspace posts the name as JSON", async () => {
    const fetchMock = mockFetchOnce({
      id: "ws-1",
      name: "Acme",
      role: "Owner",
    })

    await api.createWorkspace("Acme")

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(options.method).toBe("POST")
    expect(options.body).toBe(JSON.stringify({ name: "Acme" }))
  })

  test("inviteMember posts email and role", async () => {
    const fetchMock = mockFetchOnce({
      id: "inv-1",
      workspaceId: "ws-1",
      email: "member@example.com",
      role: "Member",
    })

    await api.inviteMember("ws-1", {
      email: "member@example.com",
      role: "Member",
    })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/invites")
    expect(JSON.parse(options.body as string)).toEqual({
      email: "member@example.com",
      role: "Member",
    })
  })

  test("non-2xx responses throw ApiError with status", async () => {
    mockFetchOnce({ error: "Forbidden" }, { status: 403 })

    const failure = await api
      .inviteMember("ws-1", { email: "x@y.z", role: "Member" })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(403)
  })

  test("malformed workspace payloads throw", async () => {
    mockFetchOnce([{ id: 42, name: "Acme" }])

    await expect(api.listWorkspaces()).rejects.toThrow()
  })
})

describe("project api client", () => {
  test("createProject posts name and key", async () => {
    const fetchMock = mockFetchOnce({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
    })

    await api.createProject("ws-1", { name: "Web", key: "WEB" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/projects")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Web",
      key: "WEB",
    })
  })

  test("updateProject patches name and key", async () => {
    const fetchMock = mockFetchOnce({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Website",
      key: "SITE",
    })

    await api.updateProject("pr-1", { name: "Website", key: "SITE" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1")
    expect(options.method).toBe("PATCH")
  })

  test("listStatuses parses ordered statuses", async () => {
    mockFetchOnce([
      {
        id: "st-1",
        projectId: "pr-1",
        name: "Backlog",
        category: "Backlog",
        position: 0,
      },
      {
        id: "st-2",
        projectId: "pr-1",
        name: "Shipped",
        category: "Completed",
        position: 1,
      },
    ])

    const result = await api.listStatuses("pr-1")

    expect(result).toEqual([
      {
        id: "st-1",
        projectId: "pr-1",
        name: "Backlog",
        category: "Backlog",
        color: "#94a3b8",
        position: 0,
      },
      {
        id: "st-2",
        projectId: "pr-1",
        name: "Shipped",
        category: "Completed",
        color: "#94a3b8",
        position: 1,
      },
    ])
  })

  test("createStatus posts name and category", async () => {
    const fetchMock = mockFetchOnce({
      id: "st-1",
      projectId: "pr-1",
      name: "Backlog",
      category: "Backlog",
      color: "#bec2c8",
      position: 0,
    })

    await api.createStatus("pr-1", { name: "Backlog", category: "Backlog" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/statuses")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Backlog",
      category: "Backlog",
    })
  })

  test("deleteStatus sends DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await api.deleteStatus("pr-1", "st-1")

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/statuses/st-1")
    expect(options.method).toBe("DELETE")
  })

  test("blocked deletes throw ApiError with status", async () => {
    mockFetchOnce(
      { error: "Cannot delete a status that holds issues" },
      { status: 409 }
    )

    const failure = await api
      .deleteStatus("pr-1", "st-1")
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as Error).message).toMatch(/holds issues/i)
  })
})

describe("status category domain (ADR-0001)", () => {
  test("exposes the six categories in roster order", () => {
    expect(statusCategorySchema.options).toEqual([
      "Backlog",
      "Unstarted",
      "In Progress",
      "Completed",
      "Canceled",
      "Duplicate",
    ])
  })

  test("parses every category and rejects anything else", () => {
    for (const category of statusCategorySchema.options) {
      expect(statusCategorySchema.parse(category)).toBe(category)
    }
    expect(statusCategorySchema.safeParse("Todo").success).toBe(false)
    expect(statusCategorySchema.safeParse("Done").success).toBe(false)
  })

  test("only Completed, Canceled and Duplicate are terminal", () => {
    expect(
      statusCategorySchema.options.filter(isTerminalStatusCategory)
    ).toEqual(["Completed", "Canceled", "Duplicate"])
  })

  test("progress counts the terminal three as done, not the open three", () => {
    const statuses: Status[] = [
      {
        id: "st-backlog",
        projectId: "pr-1",
        name: "Backlog",
        category: "Backlog",
        color: "#bec2c8",
        position: 0,
      },
      {
        id: "st-todo",
        projectId: "pr-1",
        name: "Todo",
        category: "Unstarted",
        color: "#e2e2e2",
        position: 1,
      },
      {
        id: "st-progress",
        projectId: "pr-1",
        name: "In Progress",
        category: "In Progress",
        color: "#f2c94c",
        position: 2,
      },
      {
        id: "st-completed",
        projectId: "pr-1",
        name: "Done",
        category: "Completed",
        color: "#5e6ad2",
        position: 3,
      },
      {
        id: "st-canceled",
        projectId: "pr-1",
        name: "Canceled",
        category: "Canceled",
        color: "#95a2b3",
        position: 4,
      },
      {
        id: "st-duplicate",
        projectId: "pr-1",
        name: "Duplicate",
        category: "Duplicate",
        color: "#95a2b3",
        position: 5,
      },
    ]
    const issues = [
      "st-backlog",
      "st-todo",
      "st-progress",
      "st-completed",
      "st-canceled",
      "st-duplicate",
      "st-unknown",
    ].map((statusId, index) => ({
      id: `is-${index}`,
      projectId: "pr-1",
      number: index + 1,
      keyPrefix: "WEB",
      identifier: `WEB-${index + 1}`,
      title: "Issue",
      description: null,
      statusId,
      priority: "None" as const,
      assigneeId: null,
      dueDate: null,
      archived: false,
      labels: [],
    }))

    expect(issueProgress(issues, statuses)).toEqual({ total: 7, done: 3 })
  })
})

describe("issue api client", () => {
  const issuePayload = {
    id: "is-1",
    projectId: "pr-1",
    number: 1,
    keyPrefix: "WEB",
    identifier: "WEB-1",
    title: "Fix login",
    description: "Session expires too fast",
    statusId: "st-1",
    priority: "High",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: ["bug"],
  }

  test("createIssue posts title, status and options", async () => {
    const fetchMock = mockFetchOnce(issuePayload)

    await api.createIssue("pr-1", {
      title: "Fix login",
      statusId: "st-1",
      priority: "High",
    })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/issues")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toMatchObject({
      title: "Fix login",
      statusId: "st-1",
      priority: "High",
    })
  })

  test("listIssues encodes filters as query params", async () => {
    const fetchMock = mockFetchOnce([issuePayload])

    const result = await api.listIssues("pr-1", {
      statusIds: ["st-1"],
      priorities: ["High"],
      text: "fix",
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/issues")
    expect(url).toContain("status=st-1")
    expect(url).toContain("priority=High")
    expect(url).toContain("q=fix")
    expect(result).toHaveLength(1)
    expect(result[0]?.identifier).toBe("WEB-1")
  })

  test("getIssue resolves by human identifier", async () => {
    const fetchMock = mockFetchOnce(issuePayload)

    const result = await api.getIssue("WEB-1")

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/issues/WEB-1")
    expect(result.identifier).toBe("WEB-1")
  })

  test("updateIssue patches the status", async () => {
    const fetchMock = mockFetchOnce({ ...issuePayload, statusId: "st-2" })

    const result = await api.updateIssue("WEB-1", { statusId: "st-2" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/issues/WEB-1")
    expect(options.method).toBe("PATCH")
    expect(result.statusId).toBe("st-2")
  })

  test("malformed issue payloads throw", async () => {
    mockFetchOnce([{ id: 42 }])

    await expect(api.listIssues("pr-1")).rejects.toThrow()
  })
})

describe("label api client", () => {
  const labelPayload = {
    id: "lb-1",
    workspaceId: "ws-1",
    name: "bug",
    color: "#ef4444",
  }

  test("listLabels parses the workspace registry", async () => {
    const fetchMock = mockFetchOnce([labelPayload])

    const result = await api.listLabels("ws-1")

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/labels")
    expect(result).toEqual([labelPayload])
  })

  test("createLabel posts name and color", async () => {
    const fetchMock = mockFetchOnce(labelPayload)

    await api.createLabel("ws-1", { name: "bug", color: "#ef4444" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/labels")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      name: "bug",
      color: "#ef4444",
    })
  })

  test("updateLabel patches the registry row", async () => {
    const fetchMock = mockFetchOnce({ ...labelPayload, name: "defect" })

    const result = await api.updateLabel("ws-1", "lb-1", { name: "defect" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/labels/lb-1")
    expect(options.method).toBe("PATCH")
    expect(result.name).toBe("defect")
  })

  test("deleteLabel sends DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await api.deleteLabel("ws-1", "lb-1")

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/labels/lb-1")
    expect(options.method).toBe("DELETE")
  })
})

describe("subtask and archive api client", () => {
  test("listSubtasks resolves by human identifier", async () => {
    const fetchMock = mockFetchOnce([])

    await api.listSubtasks("WEB-1")

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/issues/WEB-1/subtasks")
  })

  test("deleteIssue sends DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await api.deleteIssue("WEB-1")

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/issues/WEB-1")
    expect(options.method).toBe("DELETE")
  })
})

describe("github connection api client", () => {
  test("getGitHubConnection parses the safe connection view", async () => {
    const fetchMock = mockFetchOnce({
      connection: {
        id: "gc-1",
        workspaceId: "ws-1",
        connectorUserId: "user-1",
        connectorAccountId: "ba-1",
        login: "octocat",
        scopes: ["repo"],
        status: "active",
        lastSyncedAt: null,
        lastManualRefreshAt: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        connectorName: "Ada",
        repositoryCount: 0,
      },
      repositories: [],
    })

    const result = await api.getGitHubConnection("ws-1")

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/github-connection")
    expect(result.connection?.login).toBe("octocat")
    expect(result.connection?.connectorName).toBe("Ada")
  })

  test("connect posts an empty finalize body", async () => {
    const fetchMock = mockFetchOnce({ connection: null, repositories: [] })

    await api.connectGitHubConnection("ws-1")

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/github-connection")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({})
  })

  test("disconnect sends DELETE and resolves void", async () => {
    const fetchMock = mockFetchOnce({ disconnected: true })

    await expect(api.disconnectGitHubConnection("ws-1")).resolves.toBe(
      undefined
    )

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/github-connection")
    expect(options.method).toBe("DELETE")
  })

  test("repository search encodes the query and the allowlist saves ids", async () => {
    const fetchMock = mockFetchOnce({
      items: [
        {
          githubId: "101",
          fullName: "acme/web",
          owner: "acme",
          name: "web",
          private: false,
          archived: false,
          issuesEnabled: true,
          defaultBranch: "main",
          pushedAt: null,
          selected: true,
        },
      ],
    })

    const search = await api.searchGitHubRepositories("ws-1", "acme web")
    expect(fetchMock.mock.calls[0][0]).toContain("query=acme+web")
    expect(search.items[0].selected).toBe(true)

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ repositories: [], removed: 2 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const saved = await api.setGitHubAllowlist("ws-1", ["101", "102"])
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/github-connection/repositories")
    expect(options.method).toBe("PUT")
    expect(JSON.parse(options.body as string)).toEqual({
      githubIds: ["101", "102"],
    })
    expect(saved.removed).toBe(2)
  })
})

describe("project repositories api client", () => {
  const view = {
    id: "repo-1",
    connectionId: "gc-1",
    githubId: "101",
    fullName: "acme/web",
    owner: "acme",
    name: "web",
    private: false,
    archived: false,
    issuesEnabled: true,
    defaultBranch: "main",
    pushedAt: null,
    selectedAt: "2026-10-01T00:00:00.000Z",
    lastSyncedAt: "2026-10-10T10:00:00.000Z",
    syncError: "Forbidden",
    unavailable: true,
    linkedBy: "user-1",
    linkedAt: "2026-10-09T10:00:00.000Z",
  }

  test("getProjectRepositories parses links and the workspace connection", async () => {
    const fetchMock = mockFetchOnce({
      items: [view],
      connection: { status: "active", login: "octocat" },
    })

    const result = await api.getProjectRepositories("pr-1")

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/repositories")
    expect(result.items[0]).toMatchObject({
      fullName: "acme/web",
      linkedBy: "user-1",
      unavailable: true,
    })
    expect(result.connection).toEqual({
      status: "active",
      login: "octocat",
    })
  })

  test("setProjectRepositories puts the local repository ids", async () => {
    const fetchMock = mockFetchOnce({ items: [], connection: null })

    const result = await api.setProjectRepositories("pr-1", ["repo-1"])

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/repositories")
    expect(options.method).toBe("PUT")
    expect(JSON.parse(options.body as string)).toEqual({
      repositoryIds: ["repo-1"],
    })
    expect(result).toEqual({ items: [], connection: null })
  })
})

describe("github view api client", () => {
  const row = {
    id: "pr-row-1",
    repositoryId: "repo-1",
    number: 12,
    title: "Add the GitHub View",
    state: "open",
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
    githubCreatedAt: "2026-10-01T10:00:00.000Z",
    githubUpdatedAt: "2026-10-02T11:00:00.000Z",
    mergedAt: null,
    closedAt: null,
    syncedAt: "2026-10-10T12:00:00.000Z",
    repository: "acme/web",
    linkedIssues: [],
  }

  test("listPullRequests sends the filters and parses the envelope", async () => {
    const fetchMock = mockFetchOnce({
      items: [row],
      nextCursor: "cursor-2",
      lastSyncedAt: "2026-10-10T12:00:00.000Z",
      connection: { status: "active", login: "octocat" },
      repositories: [
        {
          id: "repo-1",
          fullName: "acme/web",
          issuesEnabled: true,
          unavailable: false,
        },
      ],
      filters: { authors: ["octocat"], labels: [] },
    })

    const result = await api.listPullRequests("pr-1", {
      state: "merged",
      author: "octocat",
      q: "view",
      cursor: "cursor-1",
      limit: 30,
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/github/pull-requests?")
    expect(url).toContain("state=merged")
    expect(url).toContain("author=octocat")
    expect(url).toContain("q=view")
    expect(url).toContain("cursor=cursor-1")
    expect(url).toContain("limit=30")
    expect(result.items[0]).toMatchObject({
      number: 12,
      repository: "acme/web",
      checksState: "success",
    })
    expect(result.filters.authors).toEqual(["octocat"])
  })

  test("refreshGitHub posts and retries through ApiError", async () => {
    const fetchMock = mockFetchOnce({
      accepted: true,
      enqueued: 2,
      lastSyncedAt: null,
    })

    const result = await api.refreshGitHub("pr-1")

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/github/refresh")
    expect(options.method).toBe("POST")
    expect(result).toEqual({
      accepted: true,
      enqueued: 2,
      lastSyncedAt: null,
    })
  })

  test("listGitHubIssues sends the filters and parses the envelope", async () => {
    const issueRow = {
      id: "issue-row-5",
      repositoryId: "repo-1",
      number: 5,
      title: "Login redirect loops",
      state: "open",
      authorLogin: "hubot",
      authorAvatarUrl: null,
      url: "https://github.com/acme/web/issues/5",
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "octocat", avatarUrl: null }],
      commentCount: 3,
      bodyExcerpt: "Steps to reproduce.",
      githubCreatedAt: "2026-10-01T09:00:00.000Z",
      githubUpdatedAt: "2026-10-03T09:00:00.000Z",
      closedAt: null,
      syncedAt: "2026-10-10T12:00:00.000Z",
      repository: "acme/web",
      linkedIssues: [],
    }
    const fetchMock = mockFetchOnce({
      items: [issueRow],
      nextCursor: "cursor-2",
      lastSyncedAt: "2026-10-10T12:00:00.000Z",
      connection: { status: "active", login: "octocat" },
      repositories: [
        {
          id: "repo-1",
          fullName: "acme/web",
          issuesEnabled: true,
          unavailable: false,
        },
      ],
      filters: {
        authors: ["hubot", "octocat"],
        labels: [{ name: "bug", color: "d73a4a" }],
      },
    })

    const result = await api.listGitHubIssues("pr-1", {
      state: "closed",
      author: "hubot",
      label: "bug",
      q: "login",
      cursor: "cursor-1",
      limit: 10,
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/github/issues?")
    expect(url).toContain("state=closed")
    expect(url).toContain("author=hubot")
    expect(url).toContain("label=bug")
    expect(url).toContain("q=login")
    expect(url).toContain("cursor=cursor-1")
    expect(url).toContain("limit=10")
    expect(result.items[0]).toMatchObject({
      number: 5,
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "octocat", avatarUrl: null }],
      repository: "acme/web",
    })
    expect(result.filters.labels).toEqual([{ name: "bug", color: "d73a4a" }])
  })
})

describe("github item api client", () => {
  const link = {
    id: "link-1",
    issueId: "issue-1",
    provider: "github",
    kind: "pr",
    url: "https://github.com/acme/web/pull/12",
    title: "Add the GitHub View",
    state: "open",
  }
  const linkedIssue = {
    linkId: "link-1",
    issueId: "issue-1",
    identifier: "WEB-2",
    title: "Invite your teammates to this workspace",
  }

  test("linkGitHubItem posts the item and target identifier, then parses the chips", async () => {
    const fetchMock = mockFetchOnce({
      link,
      issue: {
        id: "issue-1",
        identifier: "WEB-2",
        title: "Invite your teammates to this workspace",
      },
      linkedIssues: [linkedIssue],
    })

    const result = await api.linkGitHubItem("pr-1", {
      kind: "pr",
      repositoryId: "repo-1",
      number: 12,
      issue: "WEB-2",
    })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/github/items/link")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      kind: "pr",
      repositoryId: "repo-1",
      number: 12,
      issue: "WEB-2",
    })
    expect(result.link).toMatchObject({ id: "link-1", kind: "pr" })
    expect(result.linkedIssues).toEqual([linkedIssue])
  })

  test("deleteExternalLink sends DELETE and resolves without a body", async () => {
    const fetchMock = mockFetchOnce({ deleted: true })

    await expect(
      api.deleteExternalLink("WEB-1", "link-1")
    ).resolves.toBeUndefined()

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/issues/WEB-1/external-links/link-1")
    expect(options.method).toBe("DELETE")
  })
})
