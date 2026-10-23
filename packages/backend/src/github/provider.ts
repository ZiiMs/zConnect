/**
 * The GitProvider seam (#49). HTTP routes and the sync engine depend only on
 * this interface; production injects `createGitHubProvider` and every test
 * injects `createFakeProvider`. Remote shapes mirror the snapshot columns so
 * the sync engine never touches GitHub's JSON.
 */
import type {
  GitHubAssignee,
  GitHubIssueState,
  GitHubLabel,
  PullRequestState,
  RemoteRepository,
} from "./store.js"

export interface RemotePullRequest {
  number: number
  title: string
  draft: boolean
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  sourceBranch: string
  targetBranch: string
  checksState: string | null
  reviewDecision: string | null
  commentCount: number
  bodyExcerpt: string | null
  createdAt: string
  updatedAt: string
  /** Closed/merged items only appear in state resolution, never the open list. */
}

export interface RemoteGitHubIssue {
  number: number
  title: string
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  labels: GitHubLabel[]
  assignees: GitHubAssignee[]
  commentCount: number
  bodyExcerpt: string | null
  createdAt: string
  updatedAt: string
}

export interface RepoRef {
  owner: string
  name: string
}

export type ProviderErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"

export class GitProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    /** ISO instant from GitHub's reset header, for `rate_limited`. */
    readonly retryAt?: string
  ) {
    super(message)
    this.name = "GitProviderError"
  }
}

/**
 * Remote repository access the Connection routes need (#47): list repositories
 * reachable by the token and resolve the connector's login for display.
 */
export interface GitHubRemote {
  listRepositories(
    accessToken: string,
    query?: string
  ): Promise<RemoteRepository[]>
  getViewerLogin(accessToken: string): Promise<string>
}

export interface GitProvider extends GitHubRemote {
  listOpenPullRequests(
    accessToken: string,
    repo: RepoRef
  ): Promise<RemotePullRequest[]>
  listOpenIssues(
    accessToken: string,
    repo: RepoRef
  ): Promise<RemoteGitHubIssue[]>
  resolvePullRequestStates(
    accessToken: string,
    repo: RepoRef,
    numbers: number[]
  ): Promise<
    Map<
      number,
      {
        state: PullRequestState
        mergedAt: string | null
        closedAt: string | null
        updatedAt: string
      }
    >
  >
  resolveIssueStates(
    accessToken: string,
    repo: RepoRef,
    numbers: number[]
  ): Promise<
    Map<
      number,
      { state: GitHubIssueState; closedAt: string | null; updatedAt: string }
    >
  >
}
