/**
 * GitHub persistence boundary (T6 – External Links). The webhook handler
 * and routes depend only on this interface: contract tests inject the memory
 * store, production injects the Drizzle store over Neon Postgres.
 * Vocabulary per GLOSSARY.md: External Link (never Integration/Sync).
 */
import type { ExternalLinkKind } from "./parse.js"

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
}

export function createMemoryGitHubStore(): GitHubStore {
  const links = new Map<string, ExternalLink>()
  const deliveries = new Set<string>()
  const connections = new Map<string, GitHubConnectionSecret>()
  const repositories = new Map<string, GitHubRepository>()

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

  function removeRepository(id: string) {
    repositories.delete(id)
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
  }
}
