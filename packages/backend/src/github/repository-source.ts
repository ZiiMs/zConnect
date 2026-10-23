import type { GitHubRemote } from "./connection-routes.js"
import type { RemoteRepository } from "./store.js"

/**
 * Minimal GitHub REST access for the Connection picker (#47). The full
 * GitProvider seam lands in #49 and can replace this implementation without
 * changing the route contract. Never imported by tests.
 */
export function createGitHubRepositoryRemote(
  fetchImpl: typeof fetch = fetch
): GitHubRemote {
  async function github(path: string, accessToken: string) {
    return fetchImpl(`https://api.github.com${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "zConnect",
        "x-github-api-version": "2022-11-28",
      },
    })
  }

  return {
    async listRepositories(accessToken, query) {
      const repositories: RemoteRepository[] = []
      for (let page = 1; page <= 10; page += 1) {
        const params = new URLSearchParams({
          per_page: "100",
          sort: "updated",
          affiliation: "owner,collaborator,organization_member",
          page: String(page),
        })
        const res = await github(
          `/user/repos?${params.toString()}`,
          accessToken
        )
        if (!res.ok) throw new Error("GitHub repository listing failed")
        const batch = (await res.json()) as Array<{
          id: number | string
          full_name: string
          name: string
          owner?: { login?: string }
          private?: boolean
          archived?: boolean
          has_issues?: boolean
          default_branch?: string | null
          pushed_at?: string | null
        }>
        if (!Array.isArray(batch)) break
        for (const item of batch) {
          const owner = item.owner?.login ?? item.full_name.split("/")[0] ?? ""
          repositories.push({
            githubId: String(item.id),
            fullName: item.full_name,
            owner,
            name: item.name,
            private: item.private ?? false,
            archived: item.archived ?? false,
            issuesEnabled: item.has_issues ?? true,
            defaultBranch: item.default_branch ?? null,
            pushedAt: item.pushed_at ?? null,
          })
        }
        if (batch.length < 100) break
      }
      if (!query || query.trim() === "") return repositories
      const lower = query.trim().toLowerCase()
      return repositories.filter((repository) =>
        repository.fullName.toLowerCase().includes(lower)
      )
    },

    async getViewerLogin(accessToken) {
      const res = await github("/user", accessToken)
      if (!res.ok) throw new Error("GitHub account lookup failed")
      const body = (await res.json()) as { login?: string }
      if (!body.login) throw new Error("GitHub account lookup failed")
      return body.login
    },
  }
}
