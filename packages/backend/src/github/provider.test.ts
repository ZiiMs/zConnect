import { describe, expect, test } from "bun:test"
import { createGitHubProvider } from "./github-provider.js"
import { GitProviderError } from "./provider.js"

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  })
}

function graphqlBody(data: unknown): { data: unknown } {
  return { data }
}

function pullRequestNode(overrides: Record<string, unknown> = {}) {
  return {
    number: 12,
    title: "Add the GitHub View",
    isDraft: true,
    author: { login: "octocat", avatarUrl: "https://avatars/x.png" },
    url: "https://github.com/acme/web/pull/12",
    headRefName: "feature/github-view",
    baseRefName: "main",
    reviewDecision: "CHANGES_REQUESTED",
    comments: { totalCount: 4 },
    bodyText: "  First line\n\nsecond   line  ",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-02T11:00:00Z",
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }],
    },
    ...overrides,
  }
}

describe("github provider", () => {
  test("maps an open Pull Request GraphQL page, paginating by end cursor", async () => {
    const requests: string[] = []
    const provider = createGitHubProvider((async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url = String(input)
      requests.push(url)
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string
        variables: Record<string, unknown>
      }
      if (body.variables.cursor === null) {
        return jsonResponse(
          graphqlBody({
            repository: {
              pullRequests: {
                pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
                nodes: [pullRequestNode()],
              },
            },
          })
        )
      }
      expect(body.variables.cursor).toBe("cursor-2")
      return jsonResponse(
        graphqlBody({
          repository: {
            pullRequests: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                pullRequestNode({
                  number: 13,
                  title: "Second page",
                  isDraft: false,
                  reviewDecision: null,
                  commits: { nodes: [] },
                }),
              ],
            },
          },
        })
      )
    }) as unknown as typeof fetch)

    const items = await provider.listOpenPullRequests("token-1", {
      owner: "acme",
      name: "web",
    })

    expect(requests.every((url) => url.endsWith("/graphql"))).toBe(true)
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      number: 12,
      title: "Add the GitHub View",
      draft: true,
      authorLogin: "octocat",
      authorAvatarUrl: "https://avatars/x.png",
      url: "https://github.com/acme/web/pull/12",
      sourceBranch: "feature/github-view",
      targetBranch: "main",
      checksState: "failure",
      reviewDecision: "changes_requested",
      commentCount: 4,
      bodyExcerpt: "First line second line",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-02T11:00:00Z",
    })
    expect(items[1]).toMatchObject({
      number: 13,
      draft: false,
      reviewDecision: null,
      checksState: null,
    })
  })

  test("collapses and truncates the body excerpt to 400 characters", async () => {
    const provider = createGitHubProvider((async () =>
      jsonResponse(
        graphqlBody({
          repository: {
            pullRequests: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                pullRequestNode({
                  bodyText: `${"a".repeat(350)} \n\n ${"b".repeat(100)}`,
                }),
                pullRequestNode({ number: 14, bodyText: "   \n  " }),
              ],
            },
          },
        })
      )) as unknown as typeof fetch)
    const items = await provider.listOpenPullRequests("token-1", {
      owner: "acme",
      name: "web",
    })
    expect(items[0]?.bodyExcerpt).toHaveLength(400)
    expect(items[0]?.bodyExcerpt).not.toContain("\n")
    expect(items[1]?.bodyExcerpt).toBeNull()
  })

  test("maps the REST repository listing and follows the Link rel=next header", async () => {
    const urls: string[] = []
    const provider = createGitHubProvider((async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (!url.includes("page=2")) {
        return jsonResponse(
          [
            {
              id: 101,
              full_name: "acme/web",
              name: "web",
              owner: { login: "acme" },
              private: true,
              archived: false,
              has_issues: true,
              default_branch: "main",
              pushed_at: "2026-10-01T10:00:00Z",
            },
          ],
          {
            headers: {
              link: '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next", <https://api.github.com/user/repos?per_page=100&page=2>; rel="last"',
            },
          }
        )
      }
      return jsonResponse([
        {
          id: "102",
          full_name: "acme/legacy",
          name: "legacy",
          private: false,
          archived: true,
          has_issues: false,
          default_branch: null,
          pushed_at: null,
        },
      ])
    }) as unknown as typeof fetch)

    const repositories = await provider.listRepositories("token-1")
    expect(urls[0]).toContain("/user/repos?")
    expect(urls[0]).toContain("per_page=100")
    expect(urls[1]).toContain("page=2")
    expect(repositories).toEqual([
      {
        githubId: "101",
        fullName: "acme/web",
        owner: "acme",
        name: "web",
        private: true,
        archived: false,
        issuesEnabled: true,
        defaultBranch: "main",
        pushedAt: "2026-10-01T10:00:00Z",
      },
      {
        githubId: "102",
        fullName: "acme/legacy",
        owner: "acme",
        name: "legacy",
        private: false,
        archived: true,
        issuesEnabled: false,
        defaultBranch: null,
        pushedAt: null,
      },
    ])
  })

  test("filters repositories by the query substring", async () => {
    const provider = createGitHubProvider((async () =>
      jsonResponse([
        {
          id: 1,
          full_name: "acme/web",
          name: "web",
          has_issues: true,
        },
        {
          id: 2,
          full_name: "acme/api",
          name: "api",
          has_issues: true,
        },
      ])) as unknown as typeof fetch)
    expect(
      (await provider.listRepositories("token-1", "WEB")).map(
        (repository) => repository.fullName
      )
    ).toEqual(["acme/web"])
  })

  test("maps REST failures to provider error codes", async () => {
    const cases: Array<[number, "unauthorized" | "forbidden" | "not_found"]> = [
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
    ]
    for (const [status, code] of cases) {
      const provider = createGitHubProvider(
        (async () =>
          new Response("nope", { status })) as unknown as typeof fetch
      )
      try {
        await provider.getViewerLogin("token-1")
        throw new Error("expected the provider to throw")
      } catch (error) {
        expect(error).toBeInstanceOf(GitProviderError)
        expect((error as GitProviderError).code).toBe(code)
      }
    }
  })

  test("maps 429 to rate_limited with the reset instant", async () => {
    const provider = createGitHubProvider(
      (async () =>
        new Response("slow down", {
          status: 429,
          headers: { "x-ratelimit-reset": "1790000000" },
        })) as unknown as typeof fetch
    )
    try {
      await provider.listOpenPullRequests("token-1", {
        owner: "acme",
        name: "web",
      })
      throw new Error("expected the provider to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(GitProviderError)
      expect((error as GitProviderError).code).toBe("rate_limited")
      expect((error as GitProviderError).retryAt).toBe(
        new Date(1_790_000_000_000).toISOString()
      )
    }
  })

  test("maps GraphQL NOT_FOUND to not_found", async () => {
    const provider = createGitHubProvider((async () =>
      jsonResponse({
        data: null,
        errors: [{ type: "NOT_FOUND", message: "Could not resolve" }],
      })) as unknown as typeof fetch)
    try {
      await provider.listOpenPullRequests("token-1", {
        owner: "acme",
        name: "gone",
      })
      throw new Error("expected the provider to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(GitProviderError)
      expect((error as GitProviderError).code).toBe("not_found")
    }
  })

  test("resolves Pull Request and Issue states with aliased lookups", async () => {
    const requests: Array<{
      query: string
      variables: Record<string, unknown>
    }> = []
    const provider = createGitHubProvider((async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string
        variables: Record<string, unknown>
      }
      requests.push(body)
      if (body.query.includes("pullRequest(number:")) {
        return jsonResponse(
          graphqlBody({
            repository: {
              p0: {
                state: "MERGED",
                mergedAt: "2026-10-01T10:00:00Z",
                closedAt: "2026-10-01T10:00:00Z",
                updatedAt: "2026-10-01T10:00:00Z",
              },
              p1: null,
            },
          })
        )
      }
      return jsonResponse(
        graphqlBody({
          repository: {
            i0: {
              state: "CLOSED",
              closedAt: "2026-10-02T10:00:00Z",
              updatedAt: "2026-10-02T10:00:00Z",
            },
            i1: null,
          },
        })
      )
    }) as unknown as typeof fetch)

    const pullRequests = await provider.resolvePullRequestStates(
      "token-1",
      { owner: "acme", name: "web" },
      [7, 8]
    )
    expect(pullRequests.get(7)).toEqual({
      state: "merged",
      mergedAt: "2026-10-01T10:00:00Z",
      closedAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
    })
    expect(pullRequests.get(8)?.state).toBe("closed")

    const issues = await provider.resolveIssueStates(
      "token-1",
      { owner: "acme", name: "web" },
      [3, 4]
    )
    expect(issues.get(3)).toEqual({
      state: "closed",
      closedAt: "2026-10-02T10:00:00Z",
      updatedAt: "2026-10-02T10:00:00Z",
    })
    expect(issues.get(4)?.state).toBe("closed")
    expect(requests[0]?.query).toContain("p0: pullRequest(number: $p0)")
    expect(requests[0]?.variables).toMatchObject({ p0: 7, p1: 8 })
  })

  test("batches state resolution in chunks of 50", async () => {
    const batchSizes: number[] = []
    const provider = createGitHubProvider((async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        query: string
        variables: Record<string, unknown>
      }
      const aliases = body.query.match(/p\d+: pullRequest/g) ?? []
      batchSizes.push(aliases.length)
      return jsonResponse(graphqlBody({ repository: {} }))
    }) as unknown as typeof fetch)
    const numbers = Array.from({ length: 120 }, (_, index) => index + 1)
    const resolved = await provider.resolvePullRequestStates(
      "token-1",
      { owner: "acme", name: "web" },
      numbers
    )
    expect(batchSizes).toEqual([50, 50, 20])
    expect(resolved.size).toBe(120)
    expect(resolved.get(120)?.state).toBe("closed")
  })
})
