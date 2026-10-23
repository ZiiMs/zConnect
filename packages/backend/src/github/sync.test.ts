import { describe, expect, test } from "bun:test"
import {
  createMemoryWorkspaceStore,
  type WorkspaceStore,
} from "../workspaces/store.js"
import { createFakeProvider } from "./fake-provider.js"
import {
  GitProviderError,
  type RemoteGitHubIssue,
  type RemotePullRequest,
} from "./provider.js"
import {
  createMemoryGitHubStore,
  type GitHubStore,
  type RemoteRepository,
} from "./store.js"
import {
  applyRetention,
  type GitHubSyncDeps,
  selectSweepRepositories,
  syncConnection,
  syncRepository,
} from "./sync.js"

const owner = { id: "user-owner", email: "owner@example.com" }
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

const openPullRequest: RemotePullRequest = {
  number: 12,
  title: "Add the GitHub View",
  draft: false,
  authorLogin: "octocat",
  authorAvatarUrl: "https://avatars/x.png",
  url: "https://github.com/acme/web/pull/12",
  sourceBranch: "feature/github-view",
  targetBranch: "main",
  checksState: "success",
  reviewDecision: "approved",
  commentCount: 2,
  bodyExcerpt: "Adds the mirror read path.",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T11:00:00.000Z",
}

const openIssue: RemoteGitHubIssue = {
  number: 5,
  title: "Login redirect loops",
  authorLogin: "hubot",
  authorAvatarUrl: null,
  url: "https://github.com/acme/web/issues/5",
  labels: [{ name: "bug", color: "d73a4a" }],
  assignees: [{ login: "octocat", avatarUrl: "https://avatars/x.png" }],
  commentCount: 3,
  bodyExcerpt: "Steps to reproduce the loop.",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
}

async function setup(
  options: {
    repositories?: RemoteRepository[]
    pullRequests?: Record<string, RemotePullRequest[]>
    issues?: Record<string, RemoteGitHubIssue[]>
  } = {}
) {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore()
  const provider = createFakeProvider({
    repositories: options.repositories ?? [webRepository, apiRepository],
    pullRequests: options.pullRequests ?? { "acme/web": [openPullRequest] },
    issues: options.issues ?? {},
  })
  const clock = { at: FIXED }
  const workspace = await workspaces.createWorkspace(owner.id, "Acme")
  const project = await workspaces.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
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
    options.repositories ?? [webRepository, apiRepository],
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
    decrypt: (payload: string) => {
      if (payload !== "encrypted:token-1") throw new Error("cipher: tampered")
      return "token-1"
    },
    now: () => new Date(clock.at),
  }
  return {
    workspaces,
    github,
    provider,
    deps,
    workspace,
    project,
    connection,
    web,
    api,
    clock,
  }
}

async function repositoryRow(github: GitHubStore, repositoryId: string) {
  const repository = await github.getRepository(repositoryId)
  if (!repository) throw new Error("repository missing")
  return repository
}

describe("github pull request sync", () => {
  test("stores open Pull Requests and records repository plus connection freshness", async () => {
    const { github, deps, connection, web } = await setup()

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toEqual({
      status: "ok",
      repositories: 1,
      pullRequests: 1,
      issues: 0,
      linked: 0,
    })

    const items = await github.listOpenPullRequests(web.id)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      number: 12,
      title: "Add the GitHub View",
      state: "open",
      draft: false,
      authorLogin: "octocat",
      sourceBranch: "feature/github-view",
      targetBranch: "main",
      checksState: "success",
      reviewDecision: "approved",
      commentCount: 2,
      syncedAt: FIXED,
      mergedAt: null,
      closedAt: null,
    })

    expect(await repositoryRow(github, web.id)).toMatchObject({
      lastSyncedAt: FIXED,
      syncError: null,
    })
    const touched = await github.getConnectionById(connection.id)
    expect(touched?.lastSyncedAt).toBe(FIXED)
  })

  test("reopening a Pull Request that reappears clears its closed fields", async () => {
    const { github, deps, web } = await setup()
    await syncRepository(deps, web.id)
    await github.setPullRequestState(
      web.id,
      12,
      {
        state: "closed",
        mergedAt: null,
        closedAt: "2026-10-09T09:00:00.000Z",
        githubUpdatedAt: "2026-10-09T09:00:00.000Z",
      },
      "2026-10-09T09:00:00.000Z"
    )
    expect((await github.getPullRequest(web.id, 12))?.state).toBe("closed")

    await syncRepository(deps, web.id)
    const reopened = await github.getPullRequest(web.id, 12)
    expect(reopened).toMatchObject({
      state: "open",
      closedAt: null,
      mergedAt: null,
    })
  })

  test("a second sync of unchanged data keeps the rows and creates no duplicates", async () => {
    const { github, deps, web } = await setup()
    await syncRepository(deps, web.id)
    const first = await github.listOpenPullRequests(web.id)

    const again = await syncRepository(deps, web.id)
    expect(again.status).toBe("ok")
    const second = await github.listOpenPullRequests(web.id)
    expect(second).toHaveLength(1)
    expect(second[0]?.id).toBe(first[0]?.id as string)
    expect(second[0]?.number).toBe(12)
  })

  test("a 401 marks the Connection reconnect_required and keeps the snapshot", async () => {
    const { github, provider, deps, connection, web } = await setup()
    await syncRepository(deps, web.id)
    provider.failNext.set(
      "acme/web",
      new GitProviderError("GitHub authorization failed", "unauthorized")
    )

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toEqual({ status: "reconnect_required" })
    expect((await github.getConnectionById(connection.id))?.status).toBe(
      "reconnect_required"
    )
    expect(await github.listOpenPullRequests(web.id)).toHaveLength(1)

    // Already reconnecting: no further provider call is made.
    provider.calls.length = 0
    expect(await syncRepository(deps, web.id)).toEqual({
      status: "reconnect_required",
    })
    expect(provider.calls).toEqual([])
  })

  test("a 401 pauses the workspace for every repository", async () => {
    const { provider, deps, web, api } = await setup()
    provider.failNext.set(
      "acme/web",
      new GitProviderError("GitHub authorization failed", "unauthorized")
    )

    expect(await syncRepository(deps, web.id)).toEqual({
      status: "reconnect_required",
    })

    // The Connection is paused: a sibling repository never reaches GitHub.
    provider.calls.length = 0
    expect(await syncRepository(deps, api.id)).toEqual({
      status: "reconnect_required",
    })
    expect(provider.calls).toEqual([])
  })

  test("403 and 404 keep the snapshot and record a sync error", async () => {
    for (const [code, message] of [
      ["forbidden", "GitHub access forbidden"],
      ["not_found", "GitHub resource not found"],
    ] as const) {
      const { github, provider, deps, web } = await setup()
      await syncRepository(deps, web.id)
      provider.failNext.set("acme/web", new GitProviderError(message, code))

      const outcome = await syncRepository(deps, web.id)
      expect(outcome).toEqual({ status: "unavailable", repositoryId: web.id })
      const row = await repositoryRow(github, web.id)
      expect(row.syncError).toBe(message)
      expect(row.lastSyncedAt).toBe(FIXED)
      expect(await github.listOpenPullRequests(web.id)).toHaveLength(1)
    }
  })

  test("a rate limit reports retryAt without touching lastSyncedAt", async () => {
    const { github, provider, deps, web } = await setup()
    await syncRepository(deps, web.id)
    const before = await repositoryRow(github, web.id)

    provider.failNext.set(
      "acme/web",
      new GitProviderError(
        "GitHub rate limit exceeded",
        "rate_limited",
        "2026-10-10T12:15:00.000Z"
      )
    )
    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toEqual({
      status: "rate_limited",
      retryAt: "2026-10-10T12:15:00.000Z",
    })
    const after = await repositoryRow(github, web.id)
    expect(after.lastSyncedAt).toBe(before.lastSyncedAt)
    expect(after.syncError).toBeNull()
  })

  test("success clears a previous sync error", async () => {
    const { github, deps, web } = await setup()
    await github.updateRepository(web.id, { syncError: "GitHub is down" })
    const outcome = await syncRepository(deps, web.id)
    expect(outcome.status).toBe("ok")
    expect((await repositoryRow(github, web.id)).syncError).toBeNull()
  })

  test("an unknown repository is unavailable", async () => {
    const { deps } = await setup()
    expect(
      await syncRepository(deps, "00000000-0000-4000-8000-000000000000")
    ).toEqual({
      status: "unavailable",
      repositoryId: "00000000-0000-4000-8000-000000000000",
    })
  })

  test("syncConnection syncs every allowlisted repository", async () => {
    const { provider, deps, connection, github, web, api } = await setup()
    provider.pullRequests["acme/api"] = [
      {
        ...openPullRequest,
        number: 7,
        title: "API change",
        url: "https://github.com/acme/api/pull/7",
      },
    ]

    const outcome = await syncConnection(deps, connection.id)
    expect(outcome).toEqual({
      status: "ok",
      repositories: 2,
      pullRequests: 2,
      issues: 0,
      linked: 0,
    })
    expect(await github.listOpenPullRequests(web.id)).toHaveLength(1)
    expect(await github.listOpenPullRequests(api.id)).toHaveLength(1)
  })
})

describe("github issue sync", () => {
  test("stores open GitHub Issues and counts them in the outcome", async () => {
    const { github, deps, web } = await setup({
      issues: { "acme/web": [openIssue] },
    })

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toEqual({
      status: "ok",
      repositories: 1,
      pullRequests: 1,
      issues: 1,
      linked: 0,
    })

    const items = await github.listOpenGitHubIssues(web.id)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      repositoryId: web.id,
      number: 5,
      title: "Login redirect loops",
      state: "open",
      authorLogin: "hubot",
      authorAvatarUrl: null,
      url: "https://github.com/acme/web/issues/5",
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "octocat", avatarUrl: "https://avatars/x.png" }],
      commentCount: 3,
      bodyExcerpt: "Steps to reproduce the loop.",
      githubCreatedAt: "2026-10-01T09:00:00.000Z",
      githubUpdatedAt: "2026-10-03T09:00:00.000Z",
      closedAt: null,
      syncedAt: FIXED,
    })
  })

  test("a second sync of unchanged Issues keeps the rows and creates no duplicates", async () => {
    const { github, deps, web } = await setup({
      issues: { "acme/web": [openIssue] },
    })
    await syncRepository(deps, web.id)
    const first = await github.listOpenGitHubIssues(web.id)

    const again = await syncRepository(deps, web.id)
    expect(again.status).toBe("ok")
    const second = await github.listOpenGitHubIssues(web.id)
    expect(second).toHaveLength(1)
    expect(second[0]?.id).toBe(first[0]?.id as string)
    expect(second[0]?.number).toBe(5)
  })

  test("reopening a GitHub Issue that reappears clears its closed state", async () => {
    const { github, deps, web } = await setup({
      issues: { "acme/web": [openIssue] },
    })
    await syncRepository(deps, web.id)
    await github.setGitHubIssueState(
      web.id,
      5,
      {
        state: "closed",
        closedAt: "2026-10-09T09:00:00.000Z",
        githubUpdatedAt: "2026-10-09T09:00:00.000Z",
      },
      "2026-10-09T09:00:00.000Z"
    )
    expect((await github.getGitHubIssue(web.id, 5))?.state).toBe("closed")

    await syncRepository(deps, web.id)
    const reopened = await github.getGitHubIssue(web.id, 5)
    expect(reopened).toMatchObject({ state: "open", closedAt: null })
  })

  test("skips fetching Issues when the repository has them disabled", async () => {
    const { github, provider, deps, web } = await setup({
      issues: { "acme/web": [openIssue] },
    })
    await github.updateRepository(web.id, { issuesEnabled: false })
    provider.calls.length = 0

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toEqual({
      status: "ok",
      repositories: 1,
      pullRequests: 1,
      issues: 0,
      linked: 0,
    })
    expect(provider.calls).not.toContain("listOpenIssues:acme/web")
    expect(provider.calls).toContain("listOpenPullRequests:acme/web")
    expect(await github.listOpenGitHubIssues(web.id)).toEqual([])
  })

  test("Pull Requests never land in the Issue store", async () => {
    const { github, deps, web } = await setup({
      issues: { "acme/web": [openIssue] },
    })
    await syncRepository(deps, web.id)

    expect(await github.getGitHubIssue(web.id, 12)).toBeNull()
    expect(await github.getPullRequest(web.id, 5)).toBeNull()
    expect(
      (await github.listOpenGitHubIssues(web.id)).map((item) => item.number)
    ).toEqual([5])
  })

  test("syncConnection sums the Issue counts across repositories", async () => {
    const { provider, deps, connection } = await setup({
      issues: { "acme/web": [openIssue] },
    })
    provider.issues["acme/api"] = [
      {
        ...openIssue,
        number: 8,
        title: "API 500 on refresh",
        url: "https://github.com/acme/api/issues/8",
      },
    ]

    const outcome = await syncConnection(deps, connection.id)
    expect(outcome).toMatchObject({
      status: "ok",
      repositories: 2,
      pullRequests: 1,
      issues: 2,
    })
  })
})

describe("github state resolution", () => {
  test("closes and merges stored rows that disappeared from the open list", async () => {
    const { github, provider, deps, project, web } = await setup({
      issues: { "acme/web": [openIssue] },
    })
    await syncRepository(deps, web.id)

    provider.pullRequests["acme/web"] = []
    provider.closedPullRequests["acme/web"] = [
      { number: 12, state: "merged", at: "2026-10-09T08:00:00.000Z" },
    ]
    provider.issues["acme/web"] = []
    provider.closedIssues["acme/web"] = [
      { number: 5, at: "2026-10-09T09:00:00.000Z" },
    ]

    expect((await syncRepository(deps, web.id)).status).toBe("ok")

    expect(await github.getPullRequest(web.id, 12)).toMatchObject({
      state: "merged",
      mergedAt: "2026-10-09T08:00:00.000Z",
      closedAt: null,
      githubUpdatedAt: "2026-10-09T08:00:00.000Z",
    })
    expect(await github.getGitHubIssue(web.id, 5)).toMatchObject({
      state: "closed",
      closedAt: "2026-10-09T09:00:00.000Z",
      githubUpdatedAt: "2026-10-09T09:00:00.000Z",
    })
    expect(await github.listOpenPullRequests(web.id)).toEqual([])
    expect(await github.listOpenGitHubIssues(web.id)).toEqual([])

    // The rows stay visible on the merged/closed tabs for retention to age.
    const retained = await github.listPullRequestsForProject(project.id, {
      state: "all",
      limit: 100,
    })
    expect(retained.items.map((item) => item.number)).toEqual([12])
  })

  test("resolves missing numbers in batches of at most fifty", async () => {
    const pullRequests = Array.from({ length: 120 }, (_, index) => ({
      ...openPullRequest,
      number: index + 1,
      title: `Pull request ${index + 1}`,
      url: `https://github.com/acme/web/pull/${index + 1}`,
    }))
    const { github, provider, deps, web } = await setup({
      pullRequests: { "acme/web": pullRequests },
    })
    await syncRepository(deps, web.id)

    const batches: number[][] = []
    const resolve = provider.resolvePullRequestStates.bind(provider)
    provider.resolvePullRequestStates = async (token, repo, numbers) => {
      batches.push([...numbers])
      return resolve(token, repo, numbers)
    }
    provider.pullRequests["acme/web"] = []
    provider.closedPullRequests["acme/web"] = pullRequests.map((item) => ({
      number: item.number,
      state: "closed" as const,
      at: "2026-10-09T00:00:00.000Z",
    }))

    expect((await syncRepository(deps, web.id)).status).toBe("ok")
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 20])
    expect(await github.listOpenPullRequests(web.id)).toEqual([])
  })

  test("never deletes a row merely because it disappeared from the open list", async () => {
    const { github, provider, deps, web } = await setup()
    await syncRepository(deps, web.id)

    // GitHub's open list missed it, but state resolution still reports open.
    provider.pullRequests["acme/web"] = []
    provider.resolvePullRequestStates = async (_token, _repo, numbers) =>
      new Map(
        numbers.map((number) => [
          number,
          {
            state: "open" as const,
            mergedAt: null,
            closedAt: null,
            updatedAt: "2026-10-09T00:00:00.000Z",
          },
        ])
      )

    await syncRepository(deps, web.id)
    expect(await github.getPullRequest(web.id, 12)).toMatchObject({
      state: "open",
    })
    expect(await github.listOpenPullRequests(web.id)).toHaveLength(1)
  })
})

describe("github rename repair", () => {
  test("repairs a renamed repository through its immutable id and retries once", async () => {
    const { github, provider, deps, web } = await setup()
    await syncRepository(deps, web.id)

    provider.pullRequests["acme/webapp"] =
      provider.pullRequests["acme/web"] ?? []
    provider.repositories = [
      { ...webRepository, fullName: "acme/webapp", name: "webapp" },
      apiRepository,
    ]
    provider.failNext.set(
      "acme/web",
      new GitProviderError("GitHub resource not found", "not_found")
    )
    provider.calls.length = 0

    const outcome = await syncRepository(deps, web.id)
    expect(outcome.status).toBe("ok")
    expect(provider.calls).toContain("listRepositories")
    expect(provider.calls).toContain("listOpenPullRequests:acme/webapp")
    expect(await repositoryRow(github, web.id)).toMatchObject({
      fullName: "acme/webapp",
      owner: "acme",
      name: "webapp",
      lastSyncedAt: FIXED,
      syncError: null,
    })
    expect(await github.listOpenPullRequests(web.id)).toHaveLength(1)
  })

  test("stays unavailable when GitHub no longer knows the immutable id", async () => {
    const { github, provider, deps, web } = await setup()
    provider.repositories = [apiRepository]
    provider.failNext.set(
      "acme/web",
      new GitProviderError("GitHub resource not found", "not_found")
    )

    expect(await syncRepository(deps, web.id)).toEqual({
      status: "unavailable",
      repositoryId: web.id,
    })
    expect((await repositoryRow(github, web.id)).syncError).toBe(
      "GitHub resource not found"
    )
  })
})

describe("github sync sweep", () => {
  test("selects linked repositories that never synced or aged past the window, never unlinked ones", async () => {
    const docsRepository: RemoteRepository = {
      ...webRepository,
      githubId: "103",
      fullName: "acme/docs",
      name: "docs",
    }
    const { github, deps, connection, workspace, web, api } = await setup()
    await github.replaceAllowlist(
      connection.id,
      [webRepository, apiRepository, docsRepository],
      FIXED
    )

    // acme/docs is allowlisted but linked to no project; the other two never synced.
    expect(await selectSweepRepositories(deps, 15 * 60 * 1000)).toEqual([
      api.id,
      web.id,
    ])

    await github.updateRepository(web.id, {
      lastSyncedAt: "2026-10-10T11:59:00.000Z",
    })
    await github.updateRepository(api.id, {
      lastSyncedAt: "2026-10-10T11:44:00.000Z",
    })
    // acme/api is sixteen minutes old; acme/web is fresh.
    expect(await selectSweepRepositories(deps, 15 * 60 * 1000)).toEqual([
      api.id,
    ])

    await github.updateRepository(web.id, {
      lastSyncedAt: "2026-10-10T11:44:00.000Z",
    })
    expect(await selectSweepRepositories(deps, 15 * 60 * 1000)).toEqual([
      api.id,
      web.id,
    ])

    await github.setConnectionStatus(workspace.id, "reconnect_required")
    expect(await selectSweepRepositories(deps, 15 * 60 * 1000)).toEqual([])
  })
})

describe("github retention", () => {
  test("deletes merged and closed items older than ninety days, keeps the rest, and never touches open items", async () => {
    const pullRequests = [12, 13, 14, 15, 16, 17].map((number) => ({
      ...openPullRequest,
      number,
      title: `Pull request ${number}`,
      url: `https://github.com/acme/web/pull/${number}`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }))
    const issues = [5, 6, 7].map((number) => ({
      ...openIssue,
      number,
      title: `GitHub Issue ${number}`,
      url: `https://github.com/acme/web/issues/${number}`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }))
    const { github, deps, project, web } = await setup({
      pullRequests: { "acme/web": pullRequests },
      issues: { "acme/web": issues },
    })
    await syncRepository(deps, web.id)

    const closedPullRequest = (
      closedAt: string | null,
      githubUpdatedAt: string
    ) => ({
      state: "closed" as const,
      mergedAt: null,
      closedAt,
      githubUpdatedAt,
    })
    // 91 days before the fixed clock (2026-07-11) is due; 89 days (2026-07-13) is not.
    await github.setPullRequestState(
      web.id,
      13,
      {
        state: "merged",
        mergedAt: "2026-07-11T12:00:00.000Z",
        closedAt: null,
        githubUpdatedAt: "2026-07-11T12:00:00.000Z",
      },
      FIXED
    )
    await github.setPullRequestState(
      web.id,
      14,
      closedPullRequest("2026-07-13T12:00:00.000Z", "2026-07-13T12:00:00.000Z"),
      FIXED
    )
    // No closing timestamp: githubUpdatedAt decides.
    await github.setPullRequestState(
      web.id,
      15,
      closedPullRequest(null, "2026-07-11T12:00:00.000Z"),
      FIXED
    )
    await github.setPullRequestState(
      web.id,
      16,
      closedPullRequest(null, "2026-07-13T12:00:00.000Z"),
      FIXED
    )
    // Exactly ninety days old is not older than the cutoff.
    await github.setPullRequestState(
      web.id,
      17,
      closedPullRequest("2026-07-12T12:00:00.000Z", "2026-07-12T12:00:00.000Z"),
      FIXED
    )
    await github.setGitHubIssueState(
      web.id,
      5,
      {
        state: "closed",
        closedAt: "2026-07-11T12:00:00.000Z",
        githubUpdatedAt: "2026-07-11T12:00:00.000Z",
      },
      FIXED
    )
    await github.setGitHubIssueState(
      web.id,
      6,
      {
        state: "closed",
        closedAt: "2026-07-13T12:00:00.000Z",
        githubUpdatedAt: "2026-07-13T12:00:00.000Z",
      },
      FIXED
    )

    expect(await applyRetention(deps)).toEqual({
      pullRequests: 2,
      issues: 1,
    })

    const retainedPullRequests = await github.listPullRequestsForProject(
      project.id,
      { state: "all", limit: 100 }
    )
    expect(
      retainedPullRequests.items
        .map((item) => item.number)
        .sort((a, b) => a - b)
    ).toEqual([12, 14, 16, 17])

    const retainedIssues = await github.listGitHubIssuesForProject(project.id, {
      state: "all",
      limit: 100,
    })
    expect(retainedIssues.items.map((item) => item.number).sort()).toEqual([
      6, 7,
    ])
  })
})

async function issueByKey(workspaces: WorkspaceStore, identifier: string) {
  const issue = await workspaces.getIssue(identifier)
  if (!issue) throw new Error(`fixture issue ${identifier} missing`)
  return issue
}

async function activityOfType(
  workspaces: WorkspaceStore,
  identifier: string,
  type: string
) {
  const issue = await issueByKey(workspaces, identifier)
  return (await workspaces.listActivity(issue.id)).filter(
    (event) => event.type === type
  )
}

async function linksFor(
  github: GitHubStore,
  workspaces: WorkspaceStore,
  identifier: string
) {
  const issue = await issueByKey(workspaces, identifier)
  return github.listExternalLinks(issue.id)
}

describe("github automatic linking", () => {
  const linkingPullRequest: RemotePullRequest = {
    ...openPullRequest,
    sourceBranch: "feature/WEB-1-login",
    title: "Fix WEB-2 too",
  }

  test("links a Pull Request from its branch and title", async () => {
    const { github, deps, web, workspaces } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toMatchObject({ status: "ok", linked: 2 })

    expect(await linksFor(github, workspaces, "WEB-1")).toEqual([
      {
        id: expect.any(String),
        issueId: (await issueByKey(workspaces, "WEB-1")).id,
        provider: "github",
        kind: "pr",
        url: openPullRequest.url,
        title: "Fix WEB-2 too",
        state: "open",
      },
    ])
    expect(await linksFor(github, workspaces, "WEB-2")).toHaveLength(1)

    expect(await activityOfType(workspaces, "WEB-1", "github.linked")).toEqual([
      expect.objectContaining({
        actorType: "github",
        actorId: null,
        summary: "Linked automatically from WEB-1",
        payload: {
          kind: "pr",
          number: 12,
          url: openPullRequest.url,
          repository: "acme/web",
          identifier: "WEB-1",
        },
      }),
    ])
  })

  test("links a GitHub Issue from its title", async () => {
    const { github, deps, web, workspaces } = await setup({
      issues: { "acme/web": [{ ...openIssue, title: "WEB-3 regression" }] },
    })

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toMatchObject({ status: "ok", linked: 1 })

    expect(await linksFor(github, workspaces, "WEB-3")).toEqual([
      expect.objectContaining({
        provider: "github",
        kind: "issue",
        url: openIssue.url,
        title: "WEB-3 regression",
        state: "open",
      }),
    ])
    expect(await activityOfType(workspaces, "WEB-3", "github.linked")).toEqual([
      expect.objectContaining({
        summary: "Linked automatically from WEB-3",
        payload: expect.objectContaining({
          kind: "issue",
          number: 5,
          identifier: "WEB-3",
        }),
      }),
    ])
  })

  test("dedupes repeated identifiers and ignores unknown or foreign ones", async () => {
    const { github, deps, web, workspaces } = await setup({
      pullRequests: {
        "acme/web": [
          {
            ...openPullRequest,
            sourceBranch: "feature/WEB-1-login",
            title: "Follow-up to WEB-1, WEB-999, and MOB-1",
          },
        ],
      },
    })
    const otherWorkspace = await workspaces.createWorkspace(
      "user-other",
      "Other"
    )
    await workspaces.createProject(otherWorkspace.id, {
      name: "Mobile",
      key: "MOB",
    })
    expect(await workspaces.getIssue("MOB-1")).not.toBeNull()

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toMatchObject({ status: "ok", linked: 1 })
    expect(await linksFor(github, workspaces, "WEB-1")).toHaveLength(1)
    expect(await linksFor(github, workspaces, "MOB-1")).toEqual([])
  })

  test("a repeated sync creates no duplicate links or github.linked events", async () => {
    const { github, deps, web, workspaces } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })
    await syncRepository(deps, web.id)
    const again = await syncRepository(deps, web.id)

    expect(again).toMatchObject({ status: "ok", linked: 0 })
    expect(await linksFor(github, workspaces, "WEB-1")).toHaveLength(1)
    expect(
      await activityOfType(workspaces, "WEB-1", "github.linked")
    ).toHaveLength(1)
  })

  test("overlapping syncs create one link and one github.linked event", async () => {
    const { github, deps, connection, workspaces } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })

    const outcomes = await Promise.all([
      syncConnection(deps, connection.id),
      syncConnection(deps, connection.id),
    ])
    const linked = outcomes.reduce(
      (total, outcome) =>
        total + (outcome.status === "ok" ? outcome.linked : 0),
      0
    )
    expect(linked).toBe(2)
    expect(await linksFor(github, workspaces, "WEB-1")).toHaveLength(1)
    expect(await linksFor(github, workspaces, "WEB-2")).toHaveLength(1)
    expect(
      await activityOfType(workspaces, "WEB-1", "github.linked")
    ).toHaveLength(1)
  })

  test("a link created by the manual link route is not linked or evented again", async () => {
    const { github, deps, web, workspaces } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })
    const target = await issueByKey(workspaces, "WEB-1")
    await github.createExternalLink(target.id, {
      provider: "github",
      kind: "pr",
      url: linkingPullRequest.url,
      title: linkingPullRequest.title,
      state: "open",
    })
    await workspaces.appendActivity(target.id, {
      actor: { type: "user", id: owner.id },
      type: "github.linked",
      summary: "Linked from acme/web #12",
      payload: { kind: "pr", number: 12, url: linkingPullRequest.url },
    })

    const outcome = await syncRepository(deps, web.id)
    expect(outcome).toMatchObject({ status: "ok", linked: 1 })
    expect(await linksFor(github, workspaces, "WEB-1")).toHaveLength(1)
    const events = await activityOfType(workspaces, "WEB-1", "github.linked")
    expect(events).toHaveLength(1)
    expect(events[0]?.summary).toBe("Linked from acme/web #12")
  })
})

describe("github transition activity", () => {
  const linkingPullRequest: RemotePullRequest = {
    ...openPullRequest,
    sourceBranch: "feature/WEB-1-login",
    title: "Fix WEB-1",
  }

  test("merging a Pull Request appends one event and refreshes its badge", async () => {
    const { github, provider, deps, web, workspaces, clock } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })
    await syncRepository(deps, web.id)

    // A still-open update refreshes the snapshot, not the badge.
    provider.pullRequests["acme/web"] = [
      { ...linkingPullRequest, title: "Fix WEB-1 properly" },
    ]
    await syncRepository(deps, web.id)
    expect((await linksFor(github, workspaces, "WEB-1"))[0]?.title).toBe(
      "Fix WEB-1"
    )

    provider.pullRequests["acme/web"] = []
    provider.closedPullRequests["acme/web"] = [
      { number: 12, state: "merged", at: "2026-10-11T10:00:00.000Z" },
    ]
    clock.at = "2026-10-11T12:00:00.000Z"
    await syncRepository(deps, web.id)

    expect(await github.getPullRequest(web.id, 12)).toMatchObject({
      state: "merged",
    })
    expect((await linksFor(github, workspaces, "WEB-1"))[0]).toMatchObject({
      state: "merged",
      title: "Fix WEB-1 properly",
    })

    const merged = await activityOfType(
      workspaces,
      "WEB-1",
      "github.pull_request.merged"
    )
    expect(merged).toEqual([
      expect.objectContaining({
        actorType: "github",
        actorId: null,
        summary: "Merged pull request #12",
        payload: {
          kind: "pr",
          number: 12,
          url: linkingPullRequest.url,
          repository: "acme/web",
        },
      }),
    ])

    // No Inbox rows come from a GitHub transition.
    expect(
      (await workspaces.listNotifications(owner.id, { filter: "all" }))
        .notifications
    ).toEqual([])

    // A second sync of unchanged data observes no transition.
    await syncRepository(deps, web.id)
    expect(
      await activityOfType(workspaces, "WEB-1", "github.pull_request.merged")
    ).toHaveLength(1)
  })

  test("closing a Pull Request appends the closed event", async () => {
    const { github, provider, deps, web, workspaces } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })
    await syncRepository(deps, web.id)

    provider.pullRequests["acme/web"] = []
    provider.closedPullRequests["acme/web"] = [
      { number: 12, state: "closed", at: "2026-10-11T10:00:00.000Z" },
    ]
    await syncRepository(deps, web.id)

    expect((await linksFor(github, workspaces, "WEB-1"))[0]).toMatchObject({
      state: "closed",
    })
    expect(
      await activityOfType(workspaces, "WEB-1", "github.pull_request.closed")
    ).toEqual([
      expect.objectContaining({
        summary: "Closed pull request #12",
        payload: expect.objectContaining({ kind: "pr", number: 12 }),
      }),
    ])
  })

  test("closing a GitHub Issue appends the closed event", async () => {
    const { github, provider, deps, web, workspaces } = await setup({
      issues: { "acme/web": [{ ...openIssue, title: "WEB-3 regression" }] },
    })
    await syncRepository(deps, web.id)

    provider.issues["acme/web"] = []
    provider.closedIssues["acme/web"] = [
      { number: 5, at: "2026-10-11T10:00:00.000Z" },
    ]
    await syncRepository(deps, web.id)

    expect(await github.getGitHubIssue(web.id, 5)).toMatchObject({
      state: "closed",
    })
    expect((await linksFor(github, workspaces, "WEB-3"))[0]).toMatchObject({
      state: "closed",
    })
    expect(
      await activityOfType(workspaces, "WEB-3", "github.issue.closed")
    ).toEqual([
      expect.objectContaining({
        summary: "Closed GitHub issue #5",
        payload: {
          kind: "issue",
          number: 5,
          url: openIssue.url,
          repository: "acme/web",
        },
      }),
    ])
  })

  test("a reappearing Pull Request emits reopened and clears the badge", async () => {
    const { github, provider, deps, web, workspaces } = await setup({
      pullRequests: { "acme/web": [linkingPullRequest] },
    })
    await syncRepository(deps, web.id)
    await github.setPullRequestState(
      web.id,
      12,
      {
        state: "merged",
        mergedAt: "2026-10-09T08:00:00.000Z",
        closedAt: null,
        githubUpdatedAt: "2026-10-09T08:00:00.000Z",
      },
      "2026-10-09T08:00:00.000Z"
    )
    await github.updateExternalLink(
      (await linksFor(github, workspaces, "WEB-1"))[0]?.id as string,
      { state: "merged" }
    )

    provider.pullRequests["acme/web"] = [
      { ...linkingPullRequest, title: "Fix WEB-1 again" },
    ]
    await syncRepository(deps, web.id)

    expect(await github.getPullRequest(web.id, 12)).toMatchObject({
      state: "open",
    })
    expect((await linksFor(github, workspaces, "WEB-1"))[0]).toMatchObject({
      state: "open",
      title: "Fix WEB-1 again",
    })
    expect(
      await activityOfType(workspaces, "WEB-1", "github.pull_request.reopened")
    ).toEqual([
      expect.objectContaining({
        summary: "Reopened pull request #12",
        payload: {
          kind: "pr",
          number: 12,
          url: linkingPullRequest.url,
          repository: "acme/web",
        },
      }),
    ])
  })

  test("a reappearing GitHub Issue emits reopened and clears the badge", async () => {
    const { github, deps, web, workspaces } = await setup({
      issues: { "acme/web": [{ ...openIssue, title: "WEB-3 regression" }] },
    })
    await syncRepository(deps, web.id)
    await github.setGitHubIssueState(
      web.id,
      5,
      {
        state: "closed",
        closedAt: "2026-10-09T09:00:00.000Z",
        githubUpdatedAt: "2026-10-09T09:00:00.000Z",
      },
      "2026-10-09T09:00:00.000Z"
    )
    await github.updateExternalLink(
      (await linksFor(github, workspaces, "WEB-3"))[0]?.id as string,
      { state: "closed" }
    )

    await syncRepository(deps, web.id)

    expect(await github.getGitHubIssue(web.id, 5)).toMatchObject({
      state: "open",
    })
    expect((await linksFor(github, workspaces, "WEB-3"))[0]).toMatchObject({
      state: "open",
    })
    expect(
      await activityOfType(workspaces, "WEB-3", "github.issue.reopened")
    ).toEqual([
      expect.objectContaining({
        summary: "Reopened GitHub issue #5",
        payload: expect.objectContaining({ kind: "issue", number: 5 }),
      }),
    ])
  })
})
