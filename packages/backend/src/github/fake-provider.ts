/**
 * In-memory GitProvider for contract tests. No test calls GitHub: every seam
 * test injects this fake, keyed by `owner/name`. `failNext` is consumed by the
 * next call that names the repository so 401/403/404/rate-limit paths are one
 * line in a test.
 */
import type {
  GitProvider,
  GitProviderError,
  RemoteGitHubIssue,
  RemotePullRequest,
  RepoRef,
} from "./provider.js"
import type { RemoteRepository } from "./store.js"

export interface FakeProvider extends GitProvider {
  repositories: RemoteRepository[]
  pullRequests: Record<string, RemotePullRequest[]>
  issues: Record<string, RemoteGitHubIssue[]>
  closedPullRequests: Record<
    string,
    Array<{ number: number; state: "merged" | "closed"; at: string }>
  >
  closedIssues: Record<string, Array<{ number: number; at: string }>>
  /** Thrown by the next call for a repo, keyed "owner/name". */
  failNext: Map<string, GitProviderError>
  calls: string[]
}

function repoKey(repo: RepoRef): string {
  return `${repo.owner}/${repo.name}`
}

export function createFakeProvider(
  seed: Partial<Omit<FakeProvider, keyof GitProvider>> = {}
): FakeProvider {
  const failNext = seed.failNext ?? new Map<string, GitProviderError>()
  const calls: string[] = []

  function maybeFail(key: string, call: string): void {
    calls.push(call)
    const failure = failNext.get(key)
    if (failure) {
      failNext.delete(key)
      throw failure
    }
  }

  const provider: FakeProvider = {
    repositories: seed.repositories ?? [],
    pullRequests: seed.pullRequests ?? {},
    issues: seed.issues ?? {},
    closedPullRequests: seed.closedPullRequests ?? {},
    closedIssues: seed.closedIssues ?? {},
    failNext,
    calls,

    async listRepositories(_accessToken, query) {
      maybeFail("*", "listRepositories")
      const lower = (query ?? "").trim().toLowerCase()
      return provider.repositories
        .filter(
          (repository) =>
            lower === "" || repository.fullName.toLowerCase().includes(lower)
        )
        .map((repository) => ({ ...repository }))
    },

    async getViewerLogin(accessToken) {
      maybeFail("viewer", "getViewerLogin")
      return accessToken === "token-2" ? "hubot" : "octocat"
    },

    async listOpenPullRequests(_accessToken, repo) {
      maybeFail(repoKey(repo), `listOpenPullRequests:${repoKey(repo)}`)
      return (provider.pullRequests[repoKey(repo)] ?? []).map((item) => ({
        ...item,
      }))
    },

    async listOpenIssues(_accessToken, repo) {
      maybeFail(repoKey(repo), `listOpenIssues:${repoKey(repo)}`)
      return (provider.issues[repoKey(repo)] ?? []).map((item) => ({
        ...item,
        labels: item.labels.map((label) => ({ ...label })),
        assignees: item.assignees.map((assignee) => ({ ...assignee })),
      }))
    },

    async resolvePullRequestStates(_accessToken, repo, numbers) {
      maybeFail(repoKey(repo), `resolvePullRequestStates:${repoKey(repo)}`)
      const key = repoKey(repo)
      const closed = new Map(
        (provider.closedPullRequests[key] ?? []).map((item) => [
          item.number,
          item,
        ])
      )
      const open = new Set(
        (provider.pullRequests[key] ?? []).map((item) => item.number)
      )
      const states = new Map<
        number,
        {
          state: "open" | "merged" | "closed"
          mergedAt: string | null
          closedAt: string | null
          updatedAt: string
        }
      >()
      for (const number of numbers) {
        const resolved = closed.get(number)
        if (resolved) {
          states.set(number, {
            state: resolved.state,
            mergedAt: resolved.state === "merged" ? resolved.at : null,
            closedAt: resolved.state === "closed" ? resolved.at : null,
            updatedAt: resolved.at,
          })
          continue
        }
        if (open.has(number)) {
          const current = provider.pullRequests[key]?.find(
            (item) => item.number === number
          )
          states.set(number, {
            state: "open",
            mergedAt: null,
            closedAt: null,
            updatedAt: current?.updatedAt ?? new Date(0).toISOString(),
          })
          continue
        }
        // Unknown numbers are treated as closed, matching GitHub's NOT_FOUND.
        states.set(number, {
          state: "closed",
          mergedAt: null,
          closedAt: null,
          updatedAt: new Date(0).toISOString(),
        })
      }
      return states
    },

    async resolveIssueStates(_accessToken, repo, numbers) {
      maybeFail(repoKey(repo), `resolveIssueStates:${repoKey(repo)}`)
      const key = repoKey(repo)
      const closed = new Map(
        (provider.closedIssues[key] ?? []).map((item) => [item.number, item])
      )
      const open = new Set(
        (provider.issues[key] ?? []).map((item) => item.number)
      )
      const states = new Map<
        number,
        { state: "open" | "closed"; closedAt: string | null; updatedAt: string }
      >()
      for (const number of numbers) {
        const resolved = closed.get(number)
        if (resolved) {
          states.set(number, {
            state: "closed",
            closedAt: resolved.at,
            updatedAt: resolved.at,
          })
          continue
        }
        if (open.has(number)) {
          const current = provider.issues[key]?.find(
            (item) => item.number === number
          )
          states.set(number, {
            state: "open",
            closedAt: null,
            updatedAt: current?.updatedAt ?? new Date(0).toISOString(),
          })
          continue
        }
        states.set(number, {
          state: "closed",
          closedAt: null,
          updatedAt: new Date(0).toISOString(),
        })
      }
      return states
    },
  }

  return provider
}
