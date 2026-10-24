import { describe, expect, test } from "bun:test"
import { createMemoryWorkspaceStore } from "../workspaces/store.js"
import { createFakeProvider } from "./fake-provider.js"
import { type GitHubSweepDeps, runSweepJob, sweepRetryJobId } from "./jobs.js"
import { GitProviderError } from "./provider.js"
import { createMemoryGitHubStore, type RemoteRepository } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const FIXED = "2026-10-10T12:00:00.000Z"
const SWEEP_INTERVAL_MS = 15 * 60 * 1000

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

async function setup() {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore({
    projectWorkspaceId: async (projectId) =>
      (await workspaces.getProject(projectId))?.workspaceId ?? null,
  })
  const provider = createFakeProvider({
    repositories: [webRepository, apiRepository],
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
    [webRepository, apiRepository],
    FIXED
  )
  const repositories = await github.listAllowlist(connection.id)
  await github.replaceProjectRepositories(
    project.id,
    repositories.map((repository) => repository.id),
    owner.id,
    FIXED
  )

  const scheduled: Array<{ delayMs: number; jobId: string }> = []
  const deps: GitHubSweepDeps = {
    github,
    workspaces,
    provider,
    decrypt: () => "token-1",
    now: () => new Date(clock.at),
    maxAgeMs: SWEEP_INTERVAL_MS,
    scheduleSweep: async (input) => {
      scheduled.push(input)
    },
  }
  return { github, provider, deps, scheduled, clock, workspace }
}

describe("github sweep job", () => {
  test("the retry job id is stable and colon-free", () => {
    const retryAt = "2026-10-10T12:15:00.000Z"
    const jobId = sweepRetryJobId(retryAt)

    expect(jobId).toBe("github-sync-sweep-retry-1791634500000")
    expect(jobId).not.toContain(":")
    expect(sweepRetryJobId(retryAt)).toBe(jobId)
  })

  test("a rate-limited repository stops the sweep and schedules one delayed retry", async () => {
    const { github, provider, deps, scheduled } = await setup()
    provider.failNext.set(
      "acme/api",
      new GitProviderError(
        "GitHub rate limit exceeded",
        "rate_limited",
        "2026-10-10T12:15:00.000Z"
      )
    )

    const result = await runSweepJob(deps)

    expect(result).toEqual({
      status: "rate_limited",
      retryAt: "2026-10-10T12:15:00.000Z",
      repositories: 1,
    })
    // acme/api sorts first; the loop never reaches acme/web.
    expect(provider.calls).toContain("listOpenPullRequests:acme/api")
    expect(provider.calls).not.toContain("listOpenPullRequests:acme/web")
    expect(scheduled).toEqual([
      {
        delayMs: 15 * 60 * 1000,
        jobId: "github-sync-sweep-retry-1791634500000",
      },
    ])
    // The rate limit never touches freshness, so both stay due.
    const repositories = await github.listLinkedRepositories()
    expect(repositories.map((repository) => repository.lastSyncedAt)).toEqual([
      null,
      null,
    ])
  })

  test("a clean sweep processes every candidate and schedules nothing", async () => {
    const { deps, scheduled, github } = await setup()

    const result = await runSweepJob(deps)

    expect(result).toEqual({ status: "ok", repositories: 2 })
    expect(scheduled).toEqual([])
    const repositories = await github.listLinkedRepositories()
    expect(repositories.map((repository) => repository.lastSyncedAt)).toEqual([
      FIXED,
      FIXED,
    ])
  })

  test("clamps a reset instant in the past to no delay", async () => {
    const { provider, deps, scheduled, clock } = await setup()
    clock.at = "2026-10-10T12:20:00.000Z"
    provider.failNext.set(
      "acme/api",
      new GitProviderError(
        "GitHub rate limit exceeded",
        "rate_limited",
        "2026-10-10T12:15:00.000Z"
      )
    )

    await runSweepJob(deps)

    expect(scheduled).toEqual([
      {
        delayMs: 0,
        jobId: "github-sync-sweep-retry-1791634500000",
      },
    ])
  })
})
