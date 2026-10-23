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
   * snapshots; the memory store drops them in `removeRepository` once #49/#50
   * add those maps.
   */
  deleteRepository(repositoryId: string): Promise<void>
}

export interface MemoryGitHubStoreOptions {
  /**
   * Resolves the Project's workspace so project links stay inside the
   * workspace allowlist. Production enforces the same relation in SQL;
   * fixtures that exercise project links pass the workspace store here.
   */
  projectWorkspaceId?: (projectId: string) => Promise<string | null>
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

  function linkKey(projectId: string, repositoryId: string): string {
    return `${projectId}:${repositoryId}`
  }

  function removeLinksForRepository(repositoryId: string) {
    for (const [key, link] of projectLinks) {
      if (link.repositoryId === repositoryId) projectLinks.delete(key)
    }
  }

  function removeRepository(id: string) {
    // Project links cascade with the repository. #49/#50 must also drop the
    // cached pull request and issue snapshots for `id` here — the memory store
    // has no foreign keys.
    removeLinksForRepository(id)
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
  }
}
