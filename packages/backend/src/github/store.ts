/**
 * GitHub persistence boundary (T6 – External Links). The webhook handler
 * and routes depend only on this interface: contract tests inject the memory
 * store, production injects the Drizzle store over Neon Postgres.
 * Vocabulary per GLOSSARY.md: External Link (never Integration/Sync).
 */
import type { ExternalLinkKind } from "./parse.js"
import type { RemoteGitHubIssue, RemotePullRequest } from "./provider.js"

export type ExternalLinkState = "open" | "merged" | "closed"

export interface ExternalLink {
  id: string
  issueId: string
  provider: "github"
  kind: ExternalLinkKind
  url: string
  title: string | null
  state: ExternalLinkState | null
}

export interface CreateExternalLinkInput {
  provider: "github"
  kind: ExternalLinkKind
  url: string
  title?: string | null
  state?: ExternalLinkState | null
}

/** GitHub Connection custody (ADR-0005). Vocabulary: Connection, not App. */
export type GitHubConnectionStatus = "active" | "reconnect_required"
export const GITHUB_CONNECTION_STATUSES = [
  "active",
  "reconnect_required",
] as const

/** Safe view — never carries the token. */
export interface GitHubConnection {
  id: string
  workspaceId: string
  connectorUserId: string
  connectorAccountId: string
  login: string
  scopes: string[]
  status: GitHubConnectionStatus
  lastSyncedAt: string | null
  lastManualRefreshAt: string | null
  createdAt: string
  updatedAt: string
}

/** Store-only shape. Routes must never serialize `encryptedAccessToken`. */
export interface GitHubConnectionSecret extends GitHubConnection {
  encryptedAccessToken: string
}

export const MAX_ALLOWLIST = 50

export interface GitHubRepository {
  id: string
  connectionId: string
  githubId: string
  fullName: string
  owner: string
  name: string
  private: boolean
  archived: boolean
  issuesEnabled: boolean
  defaultBranch: string | null
  pushedAt: string | null
  selectedAt: string
  lastSyncedAt: string | null
  syncError: string | null
}

/** A repository plus the project link's metadata. */
export interface ProjectRepository extends GitHubRepository {
  linkedAt: string
  linkedBy: string
}

export interface ProjectRepositoryLink {
  projectId: string
  repositoryId: string
  linkedBy: string
  linkedAt: string
}

export type PullRequestState = "open" | "merged" | "closed"
export type GitHubIssueState = "open" | "closed"

export interface PullRequestSnapshot {
  id: string
  repositoryId: string
  number: number
  title: string
  state: PullRequestState
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
  githubCreatedAt: string
  githubUpdatedAt: string
  mergedAt: string | null
  closedAt: string | null
  syncedAt: string
}

export interface GitHubLabel {
  name: string
  color: string
}

export interface GitHubAssignee {
  login: string
  avatarUrl: string | null
}

export interface GitHubIssueSnapshot {
  id: string
  repositoryId: string
  number: number
  title: string
  state: GitHubIssueState
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  labels: GitHubLabel[]
  assignees: GitHubAssignee[]
  commentCount: number
  bodyExcerpt: string | null
  githubCreatedAt: string
  githubUpdatedAt: string
  closedAt: string | null
  syncedAt: string
}

/** Chip shown on a GitHub Item row. One entry per External Link. */
export interface LinkedIssueRef {
  linkId: string
  issueId: string
  identifier: string
  title: string
}

export interface GitHubItemFilters {
  state: "open" | "merged" | "closed" | "all"
  author?: string | null
  label?: string | null
  query?: string | null
  limit?: number
  cursor?: string | null
}

export const DEFAULT_GITHUB_ITEM_LIMIT = 30
export const MAX_GITHUB_ITEM_LIMIT = 100

/**
 * Opaque snapshot cursor: base64url of `${githubUpdatedAt}|${id}`, meaning
 * "strictly older than this item" in the documented order
 * (`github_updated_at DESC, id DESC`). Malformed input is ignored so a stale
 * client cursor never 500s a list route.
 */
export function encodeGitHubItemCursor(item: {
  githubUpdatedAt: string
  id: string
}): string {
  return Buffer.from(`${item.githubUpdatedAt}|${item.id}`, "utf8").toString(
    "base64url"
  )
}

export function decodeGitHubItemCursor(
  cursor: string | null | undefined
): { githubUpdatedAt: string; id: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8")
    const separator = raw.indexOf("|")
    if (separator <= 0) return null
    const githubUpdatedAt = raw.slice(0, separator)
    const id = raw.slice(separator + 1)
    if (!githubUpdatedAt || !id) return null
    if (Number.isNaN(new Date(githubUpdatedAt).getTime())) return null
    return { githubUpdatedAt, id }
  } catch {
    return null
  }
}

/** Newest first: githubUpdatedAt descending, then id descending. */
export function compareGitHubItemsDesc(
  a: { githubUpdatedAt: string; id: string },
  b: { githubUpdatedAt: string; id: string }
): number {
  if (a.githubUpdatedAt !== b.githubUpdatedAt) {
    return a.githubUpdatedAt < b.githubUpdatedAt ? 1 : -1
  }
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

function isOlderThanGitHubCursor(
  item: { githubUpdatedAt: string; id: string },
  cursor: { githubUpdatedAt: string; id: string }
): boolean {
  if (item.githubUpdatedAt !== cursor.githubUpdatedAt) {
    return item.githubUpdatedAt < cursor.githubUpdatedAt
  }
  return item.id < cursor.id
}

function githubItemLimit(filters: GitHubItemFilters): number {
  const raw = filters.limit ?? DEFAULT_GITHUB_ITEM_LIMIT
  if (!Number.isFinite(raw)) return DEFAULT_GITHUB_ITEM_LIMIT
  return Math.min(MAX_GITHUB_ITEM_LIMIT, Math.max(1, Math.floor(raw)))
}

/** Provider-agnostic repository listing shape shared with the GitProvider seam. */
export interface RemoteRepository {
  githubId: string
  fullName: string
  owner: string
  name: string
  private: boolean
  archived: boolean
  issuesEnabled: boolean
  defaultBranch: string | null
  pushedAt: string | null
}

export interface GitHubStore {
  /**
   * Creates an External Link, deduped by issue plus URL so webhook
   * redelivery never duplicates the badge.
   */
  createExternalLink(
    issueId: string,
    input: CreateExternalLinkInput
  ): Promise<ExternalLink>
  updateExternalLink(
    id: string,
    patch: { title?: string | null; state?: ExternalLinkState | null }
  ): Promise<ExternalLink>
  listExternalLinks(issueId: string): Promise<ExternalLink[]>
  hasProcessedDelivery(deliveryId: string): Promise<boolean>
  markDeliveryProcessed(deliveryId: string): Promise<void>

  /** #47 — connection custody. */
  getConnection(workspaceId: string): Promise<GitHubConnectionSecret | null>
  upsertConnection(input: {
    workspaceId: string
    connectorUserId: string
    connectorAccountId: string
    login: string
    scopes: string[]
    encryptedAccessToken: string
    at: string
  }): Promise<GitHubConnectionSecret>
  deleteConnection(workspaceId: string): Promise<void>
  setConnectionStatus(
    workspaceId: string,
    status: GitHubConnectionStatus
  ): Promise<void>
  touchConnectionLastSynced(workspaceId: string, at: string): Promise<void>
  touchConnectionManualRefresh(workspaceId: string, at: string): Promise<void>

  /** #47 — repository allowlist. */
  replaceAllowlist(
    connectionId: string,
    repositories: RemoteRepository[],
    at: string
  ): Promise<{
    repositories: GitHubRepository[]
    removedRepositoryIds: string[]
  }>
  listAllowlist(connectionId: string): Promise<GitHubRepository[]>
  getConnectionRepository(
    connectionId: string,
    repositoryId: string
  ): Promise<GitHubRepository | null>
  findRepositoryByFullName(
    connectionId: string,
    fullName: string
  ): Promise<GitHubRepository | null>
  findRepositoryByGithubId(
    connectionId: string,
    githubId: string
  ): Promise<GitHubRepository | null>
  findRepositoryByRemoteFullName(fullName: string): Promise<{
    repository: GitHubRepository
    connection: GitHubConnection
  } | null>
  updateRepository(
    id: string,
    patch: Partial<
      Pick<
        GitHubRepository,
        | "fullName"
        | "owner"
        | "name"
        | "private"
        | "archived"
        | "issuesEnabled"
        | "defaultBranch"
        | "pushedAt"
        | "lastSyncedAt"
        | "syncError"
      >
    >
  ): Promise<GitHubRepository>
  getRepository(id: string): Promise<GitHubRepository | null>

  /** #48 — project links. */
  listProjectRepositories(projectId: string): Promise<ProjectRepository[]>
  replaceProjectRepositories(
    projectId: string,
    repositoryIds: string[],
    linkedBy: string,
    at: string
  ): Promise<ProjectRepository[]>
  listRepositoryProjectIds(repositoryId: string): Promise<string[]>
  /** Repositories linked to at least one project; the sweep's candidate pool. */
  listLinkedRepositories(): Promise<GitHubRepository[]>
  /**
   * Removes a repository and its project links. Drizzle cascades the cached
   * snapshots; the memory store drops them in `removeRepository`.
   */
  deleteRepository(repositoryId: string): Promise<void>

  /** #49 — connection lookup for the sync runner (queue jobs carry repository ids). */
  getConnectionById(
    connectionId: string
  ): Promise<GitHubConnectionSecret | null>

  /** #49 — Pull Request snapshots. */
  upsertPullRequests(
    repositoryId: string,
    items: RemotePullRequest[],
    at: string
  ): Promise<void>
  listPullRequestsForProject(
    projectId: string,
    filters: GitHubItemFilters
  ): Promise<{ items: PullRequestSnapshot[]; nextCursor: string | null }>
  listOpenPullRequests(repositoryId: string): Promise<PullRequestSnapshot[]>
  getPullRequest(
    repositoryId: string,
    number: number
  ): Promise<PullRequestSnapshot | null>
  setPullRequestState(
    repositoryId: string,
    number: number,
    patch: {
      state: PullRequestState
      mergedAt: string | null
      closedAt: string | null
      githubUpdatedAt: string
    },
    at: string
  ): Promise<void>
  /** #49 — External Link chips for a page of GitHub Items, newest link first. */
  listLinkedIssueRefs(urls: string[]): Promise<Record<string, LinkedIssueRef[]>>

  /** #50 — GitHub Issue snapshots. */
  upsertGitHubIssues(
    repositoryId: string,
    items: RemoteGitHubIssue[],
    at: string
  ): Promise<void>
  listGitHubIssuesForProject(
    projectId: string,
    filters: GitHubItemFilters
  ): Promise<{ items: GitHubIssueSnapshot[]; nextCursor: string | null }>
  listOpenGitHubIssues(repositoryId: string): Promise<GitHubIssueSnapshot[]>
  getGitHubIssue(
    repositoryId: string,
    number: number
  ): Promise<GitHubIssueSnapshot | null>
  setGitHubIssueState(
    repositoryId: string,
    number: number,
    patch: {
      state: GitHubIssueState
      closedAt: string | null
      githubUpdatedAt: string
    },
    at: string
  ): Promise<void>

  /** #52 — reverse link lookup / removal. */
  findExternalLinksByUrl(url: string): Promise<ExternalLink[]>
  getExternalLink(id: string): Promise<ExternalLink | null>
  /** True when a row was removed; false when it was already gone. */
  deleteExternalLink(id: string): Promise<boolean>

  /**
   * #51 — retention. Deletes merged/closed rows whose closing instant
   * (`mergedAt ?? closedAt`, falling back to `githubUpdatedAt`) is older than
   * `olderThan`. Open rows are never touched.
   */
  deleteExpiredPullRequests(olderThan: string): Promise<number>
  deleteExpiredGitHubIssues(olderThan: string): Promise<number>
}

export interface MemoryGitHubStoreOptions {
  /**
   * Resolves the Project's workspace so project links stay inside the
   * workspace allowlist. Production enforces the same relation in SQL;
   * fixtures that exercise project links pass the workspace store here.
   */
  projectWorkspaceId?: (projectId: string) => Promise<string | null>
  /**
   * Resolves an Issue for External Link chips. The Drizzle store joins the
   * Issue row; fixtures pass the workspace store here.
   */
  getIssue?: (
    issueId: string
  ) => Promise<{ identifier: string; title: string } | null>
}

function invalid(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "invalid"
  return error
}

export function createMemoryGitHubStore(
  options: MemoryGitHubStoreOptions = {}
): GitHubStore {
  const links = new Map<string, ExternalLink>()
  const deliveries = new Set<string>()
  const connections = new Map<string, GitHubConnectionSecret>()
  const repositories = new Map<string, GitHubRepository>()
  const projectLinks = new Map<string, ProjectRepositoryLink>()
  const pullRequests = new Map<string, PullRequestSnapshot>()
  const githubIssues = new Map<string, GitHubIssueSnapshot>()

  function cloneConnection(
    connection: GitHubConnectionSecret
  ): GitHubConnectionSecret {
    return { ...connection, scopes: [...connection.scopes] }
  }

  function safeConnection(
    connection: GitHubConnectionSecret
  ): GitHubConnection {
    const { encryptedAccessToken: _encrypted, ...safe } = connection
    return { ...safe, scopes: [...safe.scopes] }
  }

  function cloneIssue(item: GitHubIssueSnapshot): GitHubIssueSnapshot {
    return {
      ...item,
      labels: item.labels.map((label) => ({ ...label })),
      assignees: item.assignees.map((assignee) => ({ ...assignee })),
    }
  }

  function linkKey(projectId: string, repositoryId: string): string {
    return `${projectId}:${repositoryId}`
  }

  function removeLinksForRepository(repositoryId: string) {
    for (const [key, link] of projectLinks) {
      if (link.repositoryId === repositoryId) projectLinks.delete(key)
    }
  }

  function removeRepository(id: string) {
    // Project links cascade with the repository, and so do cached snapshots
    // (the memory store has no foreign keys).
    removeLinksForRepository(id)
    for (const [key, snapshot] of pullRequests) {
      if (snapshot.repositoryId === id) pullRequests.delete(key)
    }
    for (const [key, snapshot] of githubIssues) {
      if (snapshot.repositoryId === id) githubIssues.delete(key)
    }
    repositories.delete(id)
  }

  function projectRepositories(projectId: string): ProjectRepository[] {
    const found: ProjectRepository[] = []
    for (const link of projectLinks.values()) {
      if (link.projectId !== projectId) continue
      const repository = repositories.get(link.repositoryId)
      if (!repository) continue
      found.push({
        ...repository,
        linkedBy: link.linkedBy,
        linkedAt: link.linkedAt,
      })
    }
    return found.sort((a, b) =>
      a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
    )
  }

  function connectionRepositories(connectionId: string): GitHubRepository[] {
    return [...repositories.values()].filter(
      (repository) => repository.connectionId === connectionId
    )
  }

  return {
    async createExternalLink(issueId, input) {
      for (const link of links.values()) {
        if (link.issueId === issueId && link.url === input.url) {
          return { ...link }
        }
      }
      const link: ExternalLink = {
        id: crypto.randomUUID(),
        issueId,
        provider: input.provider,
        kind: input.kind,
        url: input.url,
        title: input.title ?? null,
        state: input.state ?? null,
      }
      links.set(link.id, link)
      return { ...link }
    },

    async updateExternalLink(id, patch) {
      const link = links.get(id)
      if (!link) throw new Error("External Link not found")
      if (patch.title !== undefined) link.title = patch.title
      if (patch.state !== undefined) link.state = patch.state
      return { ...link }
    },

    async listExternalLinks(issueId) {
      return [...links.values()]
        .filter((l) => l.issueId === issueId)
        .map((l) => ({ ...l }))
    },

    async hasProcessedDelivery(deliveryId) {
      return deliveries.has(deliveryId)
    },

    async markDeliveryProcessed(deliveryId) {
      deliveries.add(deliveryId)
    },

    async getConnection(workspaceId) {
      const connection = connections.get(workspaceId)
      return connection ? cloneConnection(connection) : null
    },

    async upsertConnection(input) {
      const existing = connections.get(input.workspaceId)
      const connection: GitHubConnectionSecret = existing
        ? {
            ...existing,
            connectorUserId: input.connectorUserId,
            connectorAccountId: input.connectorAccountId,
            login: input.login,
            scopes: [...input.scopes],
            status: "active",
            encryptedAccessToken: input.encryptedAccessToken,
            updatedAt: input.at,
          }
        : {
            id: crypto.randomUUID(),
            workspaceId: input.workspaceId,
            connectorUserId: input.connectorUserId,
            connectorAccountId: input.connectorAccountId,
            login: input.login,
            scopes: [...input.scopes],
            status: "active",
            encryptedAccessToken: input.encryptedAccessToken,
            lastSyncedAt: null,
            lastManualRefreshAt: null,
            createdAt: input.at,
            updatedAt: input.at,
          }
      connections.set(input.workspaceId, connection)
      return cloneConnection(connection)
    },

    async deleteConnection(workspaceId) {
      const connection = connections.get(workspaceId)
      if (!connection) return
      for (const repository of connectionRepositories(connection.id)) {
        removeRepository(repository.id)
      }
      connections.delete(workspaceId)
    },

    async setConnectionStatus(workspaceId, status) {
      const connection = connections.get(workspaceId)
      if (!connection) throw new Error("GitHub Connection not found")
      connection.status = status
    },

    async touchConnectionLastSynced(workspaceId, at) {
      const connection = connections.get(workspaceId)
      if (!connection) throw new Error("GitHub Connection not found")
      connection.lastSyncedAt = at
    },

    async touchConnectionManualRefresh(workspaceId, at) {
      const connection = connections.get(workspaceId)
      if (!connection) throw new Error("GitHub Connection not found")
      connection.lastManualRefreshAt = at
    },

    async replaceAllowlist(connectionId, remoteRepositories, at) {
      const existing = connectionRepositories(connectionId)
      const byGithubId = new Map(
        existing.map((repository) => [repository.githubId, repository])
      )
      const wanted = new Set(
        remoteRepositories.map((repository) => repository.githubId)
      )
      const saved: GitHubRepository[] = []
      for (const remote of remoteRepositories) {
        const current = byGithubId.get(remote.githubId)
        if (current) {
          current.fullName = remote.fullName
          current.owner = remote.owner
          current.name = remote.name
          current.private = remote.private
          current.archived = remote.archived
          current.issuesEnabled = remote.issuesEnabled
          current.defaultBranch = remote.defaultBranch
          current.pushedAt = remote.pushedAt
          saved.push({ ...current })
          continue
        }
        const repository: GitHubRepository = {
          id: crypto.randomUUID(),
          connectionId,
          githubId: remote.githubId,
          fullName: remote.fullName,
          owner: remote.owner,
          name: remote.name,
          private: remote.private,
          archived: remote.archived,
          issuesEnabled: remote.issuesEnabled,
          defaultBranch: remote.defaultBranch,
          pushedAt: remote.pushedAt,
          selectedAt: at,
          lastSyncedAt: null,
          syncError: null,
        }
        repositories.set(repository.id, repository)
        saved.push({ ...repository })
      }
      const removedRepositoryIds: string[] = []
      for (const repository of existing) {
        if (!wanted.has(repository.githubId)) {
          removeRepository(repository.id)
          removedRepositoryIds.push(repository.id)
        }
      }
      return { repositories: saved, removedRepositoryIds }
    },

    async listAllowlist(connectionId) {
      return connectionRepositories(connectionId)
        .sort((a, b) =>
          a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
        )
        .map((repository) => ({ ...repository }))
    },

    async getConnectionRepository(connectionId, repositoryId) {
      const repository = repositories.get(repositoryId)
      if (!repository || repository.connectionId !== connectionId) return null
      return { ...repository }
    },

    async findRepositoryByFullName(connectionId, fullName) {
      const lower = fullName.toLowerCase()
      const repository = connectionRepositories(connectionId).find(
        (row) => row.fullName.toLowerCase() === lower
      )
      return repository ? { ...repository } : null
    },

    async findRepositoryByGithubId(connectionId, githubId) {
      const repository = connectionRepositories(connectionId).find(
        (row) => row.githubId === githubId
      )
      return repository ? { ...repository } : null
    },

    async findRepositoryByRemoteFullName(fullName) {
      const lower = fullName.toLowerCase()
      for (const repository of repositories.values()) {
        if (repository.fullName.toLowerCase() !== lower) continue
        for (const connection of connections.values()) {
          if (connection.id !== repository.connectionId) continue
          return {
            repository: { ...repository },
            connection: safeConnection(connection),
          }
        }
      }
      return null
    },

    async updateRepository(id, patch) {
      const repository = repositories.get(id)
      if (!repository) throw new Error("GitHub repository not found")
      Object.assign(repository, patch)
      return { ...repository }
    },

    async getRepository(id) {
      const repository = repositories.get(id)
      return repository ? { ...repository } : null
    },

    async listProjectRepositories(projectId) {
      return projectRepositories(projectId)
    },

    async replaceProjectRepositories(projectId, repositoryIds, linkedBy, at) {
      const wanted = [...new Set(repositoryIds)]
      if (wanted.length > MAX_ALLOWLIST) {
        throw invalid(
          `At most ${MAX_ALLOWLIST} repositories can be linked to a project`
        )
      }
      const workspaceId = options.projectWorkspaceId
        ? await options.projectWorkspaceId(projectId)
        : null
      for (const repositoryId of wanted) {
        const repository = repositories.get(repositoryId)
        if (!repository) throw invalid("Unknown repository")
        if (!workspaceId) continue
        const connection = [...connections.values()].find(
          (candidate) => candidate.id === repository.connectionId
        )
        if (!connection || connection.workspaceId !== workspaceId) {
          throw invalid("Repository is outside the workspace allowlist")
        }
      }
      const wantedIds = new Set(wanted)
      for (const [key, link] of projectLinks) {
        if (link.projectId !== projectId) continue
        if (!wantedIds.has(link.repositoryId)) projectLinks.delete(key)
      }
      for (const repositoryId of wanted) {
        const key = linkKey(projectId, repositoryId)
        if (projectLinks.has(key)) continue
        projectLinks.set(key, {
          projectId,
          repositoryId,
          linkedBy,
          linkedAt: at,
        })
      }
      return projectRepositories(projectId)
    },

    async listRepositoryProjectIds(repositoryId) {
      return [...projectLinks.values()]
        .filter((link) => link.repositoryId === repositoryId)
        .map((link) => link.projectId)
    },

    async listLinkedRepositories() {
      const ids = new Set(
        [...projectLinks.values()].map((link) => link.repositoryId)
      )
      return [...ids]
        .map((id) => repositories.get(id))
        .filter((repository): repository is GitHubRepository =>
          Boolean(repository)
        )
        .sort((a, b) =>
          a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
        )
        .map((repository) => ({ ...repository }))
    },

    async deleteRepository(repositoryId) {
      removeRepository(repositoryId)
    },

    async getConnectionById(connectionId) {
      for (const connection of connections.values()) {
        if (connection.id === connectionId) return cloneConnection(connection)
      }
      return null
    },

    async upsertPullRequests(repositoryId, items, at) {
      for (const item of items) {
        const key = `${repositoryId}:${item.number}`
        const current = pullRequests.get(key)
        const snapshot: PullRequestSnapshot = {
          id: current?.id ?? crypto.randomUUID(),
          repositoryId,
          number: item.number,
          title: item.title,
          state: "open",
          draft: item.draft,
          authorLogin: item.authorLogin,
          authorAvatarUrl: item.authorAvatarUrl,
          url: item.url,
          sourceBranch: item.sourceBranch,
          targetBranch: item.targetBranch,
          checksState: item.checksState,
          reviewDecision: item.reviewDecision,
          commentCount: item.commentCount,
          bodyExcerpt: item.bodyExcerpt,
          githubCreatedAt: item.createdAt,
          githubUpdatedAt: item.updatedAt,
          mergedAt: null,
          closedAt: null,
          syncedAt: at,
        }
        pullRequests.set(key, snapshot)
      }
    },

    async listPullRequestsForProject(projectId, filters) {
      const repositoryIds = new Set(
        [...projectLinks.values()]
          .filter((link) => link.projectId === projectId)
          .map((link) => link.repositoryId)
      )
      const cursor = decodeGitHubItemCursor(filters.cursor)
      const author = filters.author?.toLowerCase() ?? null
      const query = filters.query?.trim().toLowerCase() ?? ""
      const matching = [...pullRequests.values()]
        .filter((item) => repositoryIds.has(item.repositoryId))
        .filter(
          (item) => filters.state === "all" || item.state === filters.state
        )
        .filter((item) => !author || item.authorLogin.toLowerCase() === author)
        .filter(
          (item) => query === "" || item.title.toLowerCase().includes(query)
        )
        .filter((item) => !cursor || isOlderThanGitHubCursor(item, cursor))
        .sort(compareGitHubItemsDesc)
      const limit = githubItemLimit(filters)
      const page = matching.slice(0, limit)
      return {
        items: page.map((item) => ({ ...item })),
        nextCursor:
          matching.length > page.length && page.length > 0
            ? encodeGitHubItemCursor(
                page[page.length - 1] as PullRequestSnapshot
              )
            : null,
      }
    },

    async listOpenPullRequests(repositoryId) {
      return [...pullRequests.values()]
        .filter(
          (item) => item.repositoryId === repositoryId && item.state === "open"
        )
        .sort(compareGitHubItemsDesc)
        .map((item) => ({ ...item }))
    },

    async getPullRequest(repositoryId, number) {
      const snapshot = pullRequests.get(`${repositoryId}:${number}`)
      return snapshot ? { ...snapshot } : null
    },

    async setPullRequestState(repositoryId, number, patch, at) {
      const key = `${repositoryId}:${number}`
      const snapshot = pullRequests.get(key)
      if (!snapshot) return
      snapshot.state = patch.state
      snapshot.mergedAt = patch.mergedAt
      snapshot.closedAt = patch.closedAt
      snapshot.githubUpdatedAt = patch.githubUpdatedAt
      snapshot.syncedAt = at
    },

    async listLinkedIssueRefs(urls) {
      const wanted = new Set(urls)
      const byUrl: Record<string, LinkedIssueRef[]> = {}
      for (const url of wanted) byUrl[url] = []
      // Newest first: the memory map preserves insertion order, so walk it
      // backwards (the Drizzle store orders by createdAt DESC).
      const ordered = [...links.values()].reverse()
      for (const link of ordered) {
        if (!wanted.has(link.url)) continue
        if (link.kind !== "pr" && link.kind !== "issue") continue
        const issue = options.getIssue
          ? await options.getIssue(link.issueId)
          : null
        if (!issue) continue
        byUrl[link.url]?.push({
          linkId: link.id,
          issueId: link.issueId,
          identifier: issue.identifier,
          title: issue.title,
        })
      }
      return byUrl
    },

    async upsertGitHubIssues(repositoryId, items, at) {
      for (const item of items) {
        const key = `${repositoryId}:${item.number}`
        const current = githubIssues.get(key)
        const snapshot: GitHubIssueSnapshot = {
          id: current?.id ?? crypto.randomUUID(),
          repositoryId,
          number: item.number,
          title: item.title,
          state: "open",
          authorLogin: item.authorLogin,
          authorAvatarUrl: item.authorAvatarUrl,
          url: item.url,
          labels: item.labels.map((label) => ({ ...label })),
          assignees: item.assignees.map((assignee) => ({ ...assignee })),
          commentCount: item.commentCount,
          bodyExcerpt: item.bodyExcerpt,
          githubCreatedAt: item.createdAt,
          githubUpdatedAt: item.updatedAt,
          closedAt: null,
          syncedAt: at,
        }
        githubIssues.set(key, snapshot)
      }
    },

    async listGitHubIssuesForProject(projectId, filters) {
      const repositoryIds = new Set(
        [...projectLinks.values()]
          .filter((link) => link.projectId === projectId)
          .map((link) => link.repositoryId)
      )
      const cursor = decodeGitHubItemCursor(filters.cursor)
      const author = filters.author?.toLowerCase() ?? null
      const label = filters.label?.trim().toLowerCase() ?? ""
      const query = filters.query?.trim().toLowerCase() ?? ""
      const matching = [...githubIssues.values()]
        .filter((item) => repositoryIds.has(item.repositoryId))
        .filter(
          (item) => filters.state === "all" || item.state === filters.state
        )
        .filter((item) => !author || item.authorLogin.toLowerCase() === author)
        .filter(
          (item) =>
            label === "" ||
            item.labels.some(
              (candidate) => candidate.name.toLowerCase() === label
            )
        )
        .filter(
          (item) => query === "" || item.title.toLowerCase().includes(query)
        )
        .filter((item) => !cursor || isOlderThanGitHubCursor(item, cursor))
        .sort(compareGitHubItemsDesc)
      const limit = githubItemLimit(filters)
      const page = matching.slice(0, limit)
      return {
        items: page.map(cloneIssue),
        nextCursor:
          matching.length > page.length && page.length > 0
            ? encodeGitHubItemCursor(
                page[page.length - 1] as GitHubIssueSnapshot
              )
            : null,
      }
    },

    async listOpenGitHubIssues(repositoryId) {
      return [...githubIssues.values()]
        .filter(
          (item) => item.repositoryId === repositoryId && item.state === "open"
        )
        .sort(compareGitHubItemsDesc)
        .map(cloneIssue)
    },

    async getGitHubIssue(repositoryId, number) {
      const snapshot = githubIssues.get(`${repositoryId}:${number}`)
      return snapshot ? cloneIssue(snapshot) : null
    },

    async setGitHubIssueState(repositoryId, number, patch, at) {
      const key = `${repositoryId}:${number}`
      const snapshot = githubIssues.get(key)
      if (!snapshot) return
      snapshot.state = patch.state
      snapshot.closedAt = patch.closedAt
      snapshot.githubUpdatedAt = patch.githubUpdatedAt
      snapshot.syncedAt = at
    },

    async findExternalLinksByUrl(url) {
      return [...links.values()]
        .filter((link) => link.url === url)
        .map((link) => ({ ...link }))
    },

    async getExternalLink(id) {
      const link = links.get(id)
      return link ? { ...link } : null
    },

    async deleteExternalLink(id) {
      return links.delete(id)
    },

    async deleteExpiredPullRequests(olderThan) {
      const cutoff = new Date(olderThan).getTime()
      let deleted = 0
      for (const [key, item] of pullRequests) {
        if (item.state === "open") continue
        const closing = item.mergedAt ?? item.closedAt ?? item.githubUpdatedAt
        if (new Date(closing).getTime() < cutoff) {
          pullRequests.delete(key)
          deleted += 1
        }
      }
      return deleted
    },

    async deleteExpiredGitHubIssues(olderThan) {
      const cutoff = new Date(olderThan).getTime()
      let deleted = 0
      for (const [key, item] of githubIssues) {
        if (item.state === "open") continue
        const closing = item.closedAt ?? item.githubUpdatedAt
        if (new Date(closing).getTime() < cutoff) {
          githubIssues.delete(key)
          deleted += 1
        }
      }
      return deleted
    },
  }
}
