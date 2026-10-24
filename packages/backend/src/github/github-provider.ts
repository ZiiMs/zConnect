/**
 * Real GitHub adapter for the `GitProvider` seam (#49). REST lists the
 * repositories reachable by the workspace token; GraphQL reads open Pull
 * Requests, GitHub Issues, and resolves state for numbers that disappeared
 * from the open list. Never imported by tests — the fake is.
 */
import {
  type GitProvider,
  GitProviderError,
  type RemoteGitHubIssue,
  type RemotePullRequest,
} from "./provider.js"
import type { RemoteRepository } from "./store.js"

const REST_BASE = "https://api.github.com"
const GRAPHQL_URL = `${REST_BASE}/graphql`
const PER_PAGE = 100
const STATE_BATCH = 50

const REST_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "zConnect",
  "x-github-api-version": "2022-11-28",
} as const

export function createGitHubProvider(
  fetchImpl: typeof fetch = fetch
): GitProvider {
  async function request(
    url: string,
    accessToken: string,
    init?: RequestInit
  ): Promise<Response> {
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        ...REST_HEADERS,
        authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) throw errorFromResponse(res)
    return res
  }

  async function graphql<T>(
    accessToken: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const res = await fetchImpl(GRAPHQL_URL, {
      method: "POST",
      headers: {
        ...REST_HEADERS,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw errorFromResponse(res)
    const body = (await res.json()) as {
      data?: T
      errors?: Array<{ type?: string; message?: string }>
    }
    const errors = body.errors ?? []
    if (errors.length > 0) {
      if (errors.some((error) => error.type === "NOT_FOUND")) {
        throw new GitProviderError("GitHub resource not found", "not_found")
      }
      if (errors.some((error) => /rate limit/i.test(error.message ?? ""))) {
        throw new GitProviderError(
          "GitHub rate limit exceeded",
          "rate_limited",
          resetInstant(res.headers)
        )
      }
      throw new GitProviderError(
        errors[0]?.message ?? "GitHub GraphQL request failed",
        "forbidden"
      )
    }
    if (body.data === undefined) {
      throw new GitProviderError("GitHub returned no data", "forbidden")
    }
    return body.data
  }

  return {
    async listRepositories(accessToken, query) {
      const params = new URLSearchParams({
        per_page: String(PER_PAGE),
        affiliation: "owner,collaborator,organization_member",
      })
      const repositories: RemoteRepository[] = []
      let url: string | null = `${REST_BASE}/user/repos?${params.toString()}`
      while (url) {
        const res = await request(url, accessToken)
        const batch = (await res.json()) as GitHubRestRepository[]
        if (!Array.isArray(batch)) break
        for (const item of batch) repositories.push(toRemoteRepository(item))
        url = nextLink(res.headers.get("link"))
      }
      const lower = query?.trim().toLowerCase() ?? ""
      if (lower === "") return repositories
      return repositories.filter((repository) =>
        repository.fullName.toLowerCase().includes(lower)
      )
    },

    async getViewerLogin(accessToken) {
      const res = await request(`${REST_BASE}/user`, accessToken)
      const body = (await res.json()) as { login?: string }
      if (!body.login) {
        throw new GitProviderError("GitHub account lookup failed", "forbidden")
      }
      return body.login
    },

    async listOpenPullRequests(accessToken, repo) {
      const pullRequests: RemotePullRequest[] = []
      let cursor: string | null = null
      do {
        const data: { repository: GitHubPullRequestRepository } =
          await graphql<{ repository: GitHubPullRequestRepository }>(
            accessToken,
            PULL_REQUESTS_QUERY,
            { owner: repo.owner, name: repo.name, cursor }
          )
        const connection: GitHubPullRequestRepository["pullRequests"] =
          data.repository.pullRequests
        for (const node of connection.nodes ?? []) {
          pullRequests.push(toRemotePullRequest(node))
        }
        cursor = connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null
      } while (cursor)
      return pullRequests
    },

    async listOpenIssues(accessToken, repo) {
      const issues: RemoteGitHubIssue[] = []
      let cursor: string | null = null
      do {
        const data: { repository: GitHubIssueRepository } = await graphql<{
          repository: GitHubIssueRepository
        }>(accessToken, ISSUES_QUERY, {
          owner: repo.owner,
          name: repo.name,
          cursor,
        })
        const connection: GitHubIssueRepository["issues"] =
          data.repository.issues
        for (const node of connection.nodes ?? []) {
          // GitHub's issues connection includes pull requests; the GitHub
          // View shows real GitHub Issues only.
          if (node.__typename !== "Issue") continue
          issues.push(toRemoteGitHubIssue(node))
        }
        cursor = connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null
      } while (cursor)
      return issues
    },

    async resolvePullRequestStates(accessToken, repo, numbers) {
      const resolved = new Map<
        number,
        {
          state: "open" | "merged" | "closed"
          mergedAt: string | null
          closedAt: string | null
          updatedAt: string
        }
      >()
      for (const batch of batches(numbers)) {
        const aliases = batch.map((number, index) => ({
          number,
          alias: `p${index}`,
        }))
        const fields = aliases
          .map(
            ({ alias }) =>
              `${alias}: pullRequest(number: $${alias}) { state mergedAt closedAt updatedAt }`
          )
          .join("\n")
        const variableDefs = aliases
          .map(({ alias }) => `$${alias}: Int!`)
          .join(", ")
        const variables: Record<string, unknown> = {
          owner: repo.owner,
          name: repo.name,
        }
        for (const { alias, number } of aliases) variables[alias] = number
        const data = await graphql<{
          repository: Record<string, GitHubPullRequestState | null>
        }>(
          accessToken,
          `query($owner: String!, $name: String!, ${variableDefs}) {
            repository(owner: $owner, name: $name) {
              ${fields}
            }
          }`,
          variables
        )
        const observedAt = new Date().toISOString()
        for (const { alias, number } of aliases) {
          const node = data.repository[alias]
          // Missing numbers are treated as closed, matching the sync engine's
          // "disappeared from the open list" rule.
          if (!node) {
            resolved.set(number, {
              state: "closed",
              mergedAt: null,
              closedAt: null,
              updatedAt: observedAt,
            })
            continue
          }
          resolved.set(number, {
            state: node.state.toLowerCase() as "open" | "merged" | "closed",
            mergedAt: node.mergedAt,
            closedAt: node.closedAt,
            updatedAt: node.updatedAt,
          })
        }
      }
      return resolved
    },

    async resolveIssueStates(accessToken, repo, numbers) {
      const resolved = new Map<
        number,
        { state: "open" | "closed"; closedAt: string | null; updatedAt: string }
      >()
      for (const batch of batches(numbers)) {
        const aliases = batch.map((number, index) => ({
          number,
          alias: `i${index}`,
        }))
        const fields = aliases
          .map(
            ({ alias }) =>
              `${alias}: issue(number: $${alias}) { state closedAt updatedAt }`
          )
          .join("\n")
        const variableDefs = aliases
          .map(({ alias }) => `$${alias}: Int!`)
          .join(", ")
        const variables: Record<string, unknown> = {
          owner: repo.owner,
          name: repo.name,
        }
        for (const { alias, number } of aliases) variables[alias] = number
        const data = await graphql<{
          repository: Record<string, GitHubIssueState | null>
        }>(
          accessToken,
          `query($owner: String!, $name: String!, ${variableDefs}) {
            repository(owner: $owner, name: $name) {
              ${fields}
            }
          }`,
          variables
        )
        const observedAt = new Date().toISOString()
        for (const { alias, number } of aliases) {
          const node = data.repository[alias]
          if (!node) {
            resolved.set(number, {
              state: "closed",
              closedAt: null,
              updatedAt: observedAt,
            })
            continue
          }
          resolved.set(number, {
            state: node.state.toLowerCase() as "open" | "closed",
            closedAt: node.closedAt,
            updatedAt: node.updatedAt,
          })
        }
      }
      return resolved
    },
  }
}

const PULL_REQUESTS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: ${PER_PAGE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        isDraft
        author { login avatarUrl }
        url
        headRefName
        baseRefName
        reviewDecision
        comments { totalCount }
        bodyText
        createdAt
        updatedAt
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
      }
    }
  }
}`

const ISSUES_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: ${PER_PAGE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        number
        title
        author { login avatarUrl }
        url
        labels(first: 20) { nodes { name color } }
        assignees(first: 10) { nodes { login avatarUrl } }
        comments { totalCount }
        bodyText
        createdAt
        updatedAt
      }
    }
  }
}`

interface GitHubRestRepository {
  id: number | string
  full_name: string
  name: string
  owner?: { login?: string }
  private?: boolean
  archived?: boolean
  has_issues?: boolean
  default_branch?: string | null
  pushed_at?: string | null
}

interface GitHubPullRequestNode {
  number: number
  title: string
  isDraft: boolean
  author: { login: string; avatarUrl: string | null } | null
  url: string
  headRefName: string
  baseRefName: string
  reviewDecision: string | null
  comments: { totalCount: number }
  bodyText: string | null
  createdAt: string
  updatedAt: string
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: { state: string } | null
      }
    }> | null
  }
}

interface GitHubIssueNode {
  __typename: string
  number: number
  title: string
  author: { login: string; avatarUrl: string | null } | null
  url: string
  labels: { nodes: Array<{ name: string; color: string }> | null }
  assignees: {
    nodes: Array<{ login: string; avatarUrl: string | null }> | null
  }
  comments: { totalCount: number }
  bodyText: string | null
  createdAt: string
  updatedAt: string
}

interface GitHubPullRequestRepository {
  pullRequests: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    nodes: GitHubPullRequestNode[] | null
  }
}

interface GitHubIssueRepository {
  issues: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    nodes: GitHubIssueNode[] | null
  }
}

interface GitHubPullRequestState {
  state: string
  mergedAt: string | null
  closedAt: string | null
  updatedAt: string
}

interface GitHubIssueState {
  state: string
  closedAt: string | null
  updatedAt: string
}

function toRemoteRepository(item: GitHubRestRepository): RemoteRepository {
  const owner = item.owner?.login ?? item.full_name.split("/")[0] ?? ""
  return {
    githubId: String(item.id),
    fullName: item.full_name,
    owner,
    name: item.name,
    private: item.private ?? false,
    archived: item.archived ?? false,
    issuesEnabled: item.has_issues ?? true,
    defaultBranch: item.default_branch ?? null,
    pushedAt: item.pushed_at ?? null,
  }
}

function toRemotePullRequest(node: GitHubPullRequestNode): RemotePullRequest {
  return {
    number: node.number,
    title: node.title,
    draft: node.isDraft,
    authorLogin: node.author?.login ?? "ghost",
    authorAvatarUrl: node.author?.avatarUrl ?? null,
    url: node.url,
    sourceBranch: node.headRefName,
    targetBranch: node.baseRefName,
    checksState: checksState(node),
    reviewDecision: node.reviewDecision?.toLowerCase() ?? null,
    commentCount: node.comments.totalCount,
    bodyExcerpt: bodyExcerpt(node.bodyText),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

function toRemoteGitHubIssue(node: GitHubIssueNode): RemoteGitHubIssue {
  return {
    number: node.number,
    title: node.title,
    authorLogin: node.author?.login ?? "ghost",
    authorAvatarUrl: node.author?.avatarUrl ?? null,
    url: node.url,
    labels: (node.labels.nodes ?? []).map((label) => ({
      name: label.name,
      color: label.color,
    })),
    assignees: (node.assignees.nodes ?? []).map((assignee) => ({
      login: assignee.login,
      avatarUrl: assignee.avatarUrl,
    })),
    commentCount: node.comments.totalCount,
    bodyExcerpt: bodyExcerpt(node.bodyText),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

function checksState(node: GitHubPullRequestNode): string | null {
  const rollup = node.commits.nodes?.[0]?.commit.statusCheckRollup
  if (!rollup) return null
  switch (rollup.state) {
    case "SUCCESS":
      return "success"
    case "FAILURE":
    case "ERROR":
      return "failure"
    case "PENDING":
      return "pending"
    case "EXPECTED":
      return "expected"
    default:
      return rollup.state.toLowerCase()
  }
}

/** First 400 characters with whitespace collapsed; null for an empty body. */
function bodyExcerpt(body: string | null | undefined): string | null {
  const collapsed = (body ?? "").replace(/\s+/g, " ").trim()
  if (collapsed === "") return null
  return collapsed.slice(0, 400)
}

function batches(numbers: number[]): number[][] {
  const unique = [...new Set(numbers)]
  const chunks: number[][] = []
  for (let index = 0; index < unique.length; index += STATE_BATCH) {
    chunks.push(unique.slice(index, index + STATE_BATCH))
  }
  return chunks
}

function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim())
    if (match?.[1]) return match[1]
  }
  return null
}

function resetInstant(headers: Headers): string | undefined {
  const reset = headers.get("x-ratelimit-reset")
  if (reset) {
    const seconds = Number(reset)
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString()
  }
  const retryAfter = headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      return new Date(Date.now() + seconds * 1000).toISOString()
    }
  }
  return undefined
}

function errorFromResponse(res: Response): GitProviderError {
  const remaining = res.headers.get("x-ratelimit-remaining")
  const isRateLimited =
    res.status === 429 ||
    (res.status === 403 &&
      (remaining === "0" || res.headers.get("retry-after") !== null))
  if (isRateLimited) {
    return new GitProviderError(
      "GitHub rate limit exceeded",
      "rate_limited",
      resetInstant(res.headers)
    )
  }
  if (res.status === 401) {
    return new GitProviderError("GitHub authorization failed", "unauthorized")
  }
  if (res.status === 404) {
    return new GitProviderError("GitHub resource not found", "not_found")
  }
  if (res.status === 403) {
    return new GitProviderError("GitHub access forbidden", "forbidden")
  }
  return new GitProviderError(
    `GitHub request failed (${res.status})`,
    "forbidden"
  )
}
