import { describe, expect, test } from "bun:test"
import { createMemoryWorkspaceStore } from "../workspaces/store.js"
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
import { type GitHubSyncDeps, syncConnection, syncRepository } from "./sync.js"

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
    issues?: Record<string, RemoteGitHubIssue[]>
  } = {}
) {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore()
  const provider = createFakeProvider({
    repositories: options.repositories ?? [webRepository, apiRepository],
    pullRequests: { "acme/web": [openPullRequest] },
    issues: options.issues ?? {},
  })
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
    now: () => new Date(FIXED),
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
