import { and, eq, inArray, sql } from "drizzle-orm"
import type { getDb } from "../db/index.js"
import {
  externalLink,
  githubConnection,
  githubInstall,
  githubRepository,
  project,
  projectRepository,
  webhookDelivery,
} from "../db/schema.js"
import type { ExternalLinkKind } from "./parse.js"
import {
  type CreateExternalLinkInput,
  type ExternalLink,
  type ExternalLinkState,
  type GitHubConnection,
  type GitHubConnectionSecret,
  type GitHubConnectionStatus,
  type GitHubInstall,
  type GitHubRepository,
  type GitHubStore,
  MAX_ALLOWLIST,
  type ProjectRepository,
  type RemoteRepository,
} from "./store.js"

type Db = ReturnType<typeof getDb>

/**
 * Production GitHubStore over Neon Postgres. Resolves the connection
 * lazily per call so importing the app never requires DATABASE_URL —
 * contract tests inject the memory store instead.
 */
export function createDrizzleGitHubStore(resolveDb: () => Db): GitHubStore {
  return {
    async createInstall(workspaceId, repos) {
      const db = resolveDb()
      const [row] = await db
        .insert(githubInstall)
        .values({ workspaceId, repos: [...repos] })
        .returning()
      return toInstall(row)
    },

    async listInstalls(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(githubInstall)
        .where(eq(githubInstall.workspaceId, workspaceId))
      return rows.map(toInstall)
    },

    async findInstallByRepo(fullName) {
      const db = resolveDb()
      const rows = await db.select().from(githubInstall)
      const lower = fullName.toLowerCase()
      const match = rows.find((row) =>
        (row.repos ?? []).some((r) => r.toLowerCase() === lower)
      )
      return match ? toInstall(match) : null
    },

    async createExternalLink(issueId, input: CreateExternalLinkInput) {
      const db = resolveDb()
      const existing = await db
        .select()
        .from(externalLink)
        .where(
          and(
            eq(externalLink.issueId, issueId),
            eq(externalLink.url, input.url)
          )
        )
      if (existing[0]) return toLink(existing[0])
      const [row] = await db
        .insert(externalLink)
        .values({
          issueId,
          provider: input.provider,
          kind: input.kind,
          url: input.url,
          title: input.title ?? null,
          state: input.state ?? null,
        })
        .returning()
      return toLink(row)
    },

    async updateExternalLink(id, patch) {
      const db = resolveDb()
      const [row] = await db
        .update(externalLink)
        .set({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.state !== undefined ? { state: patch.state } : {}),
        })
        .where(eq(externalLink.id, id))
        .returning()
      if (!row) throw new Error("External Link not found")
      return toLink(row)
    },

    async listExternalLinks(issueId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(externalLink)
        .where(eq(externalLink.issueId, issueId))
      return rows.map(toLink)
    },

    async hasProcessedDelivery(deliveryId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(webhookDelivery)
        .where(eq(webhookDelivery.deliveryId, deliveryId))
      return rows.length > 0
    },

    async markDeliveryProcessed(deliveryId) {
      const db = resolveDb()
      await db
        .insert(webhookDelivery)
        .values({ deliveryId })
        .onConflictDoNothing()
    },

    async getConnection(workspaceId) {
      const db = resolveDb()
      const [row] = await db
        .select()
        .from(githubConnection)
        .where(eq(githubConnection.workspaceId, workspaceId))
      return row ? toConnection(row) : null
    },

    async upsertConnection(input) {
      const db = resolveDb()
      const [row] = await db
        .insert(githubConnection)
        .values({
          workspaceId: input.workspaceId,
          connectorUserId: input.connectorUserId,
          connectorAccountId: input.connectorAccountId,
          login: input.login,
          scopes: [...input.scopes],
          status: "active",
          encryptedAccessToken: input.encryptedAccessToken,
          updatedAt: new Date(input.at),
        })
        .onConflictDoUpdate({
          target: githubConnection.workspaceId,
          set: {
            connectorUserId: input.connectorUserId,
            connectorAccountId: input.connectorAccountId,
            login: input.login,
            scopes: [...input.scopes],
            status: "active",
            encryptedAccessToken: input.encryptedAccessToken,
            updatedAt: new Date(input.at),
          },
        })
        .returning()
      return toConnection(row)
    },

    async deleteConnection(workspaceId) {
      const db = resolveDb()
      // FK cascades drop repositories, project links and cached snapshots.
      await db
        .delete(githubConnection)
        .where(eq(githubConnection.workspaceId, workspaceId))
    },

    async setConnectionStatus(workspaceId, status) {
      const db = resolveDb()
      const rows = await db
        .update(githubConnection)
        .set({ status })
        .where(eq(githubConnection.workspaceId, workspaceId))
        .returning()
      if (!rows[0]) throw new Error("GitHub Connection not found")
    },

    async touchConnectionLastSynced(workspaceId, at) {
      const db = resolveDb()
      const rows = await db
        .update(githubConnection)
        .set({ lastSyncedAt: new Date(at) })
        .where(eq(githubConnection.workspaceId, workspaceId))
        .returning()
      if (!rows[0]) throw new Error("GitHub Connection not found")
    },

    async touchConnectionManualRefresh(workspaceId, at) {
      const db = resolveDb()
      const rows = await db
        .update(githubConnection)
        .set({ lastManualRefreshAt: new Date(at) })
        .where(eq(githubConnection.workspaceId, workspaceId))
        .returning()
      if (!rows[0]) throw new Error("GitHub Connection not found")
    },

    async replaceAllowlist(connectionId, remoteRepositories, at) {
      const db = resolveDb()
      return db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(githubRepository)
          .where(eq(githubRepository.connectionId, connectionId))
        const byGithubId = new Map(existing.map((row) => [row.githubId, row]))
        const wanted = new Set(
          remoteRepositories.map((repository) => repository.githubId)
        )
        const saved: GitHubRepository[] = []
        for (const remote of remoteRepositories) {
          const current = byGithubId.get(remote.githubId)
          if (current) {
            const [row] = await tx
              .update(githubRepository)
              .set(repositoryMetadata(remote))
              .where(eq(githubRepository.id, current.id))
              .returning()
            saved.push(toRepository(row))
            continue
          }
          const [row] = await tx
            .insert(githubRepository)
            .values({
              connectionId,
              githubId: remote.githubId,
              ...repositoryMetadata(remote),
              selectedAt: new Date(at),
            })
            .returning()
          saved.push(toRepository(row))
        }
        const removedRepositoryIds = existing
          .filter((row) => !wanted.has(row.githubId))
          .map((row) => row.id)
        if (removedRepositoryIds.length > 0) {
          await tx
            .delete(githubRepository)
            .where(inArray(githubRepository.id, removedRepositoryIds))
        }
        return { repositories: saved, removedRepositoryIds }
      })
    },

    async listAllowlist(connectionId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(githubRepository)
        .where(eq(githubRepository.connectionId, connectionId))
        .orderBy(sql`lower(${githubRepository.fullName})`)
      return rows.map(toRepository)
    },

    async getConnectionRepository(connectionId, repositoryId) {
      const db = resolveDb()
      const [row] = await db
        .select()
        .from(githubRepository)
        .where(
          and(
            eq(githubRepository.id, repositoryId),
            eq(githubRepository.connectionId, connectionId)
          )
        )
      return row ? toRepository(row) : null
    },

    async findRepositoryByFullName(connectionId, fullName) {
      const db = resolveDb()
      const [row] = await db
        .select()
        .from(githubRepository)
        .where(
          and(
            eq(githubRepository.connectionId, connectionId),
            sql`lower(${githubRepository.fullName}) = ${fullName.toLowerCase()}`
          )
        )
      return row ? toRepository(row) : null
    },

    async findRepositoryByGithubId(connectionId, githubId) {
      const db = resolveDb()
      const [row] = await db
        .select()
        .from(githubRepository)
        .where(
          and(
            eq(githubRepository.connectionId, connectionId),
            eq(githubRepository.githubId, githubId)
          )
        )
      return row ? toRepository(row) : null
    },

    async findRepositoryByRemoteFullName(fullName) {
      const db = resolveDb()
      const [match] = await db
        .select({
          repository: githubRepository,
          connection: githubConnection,
        })
        .from(githubRepository)
        .innerJoin(
          githubConnection,
          eq(githubRepository.connectionId, githubConnection.id)
        )
        .where(
          sql`lower(${githubRepository.fullName}) = ${fullName.toLowerCase()}`
        )
        .limit(1)
      if (!match) return null
      return {
        repository: toRepository(match.repository),
        connection: toSafeConnection(match.connection),
      }
    },

    async updateRepository(id, patch) {
      const db = resolveDb()
      const set: Partial<typeof githubRepository.$inferInsert> = {}
      if (patch.fullName !== undefined) set.fullName = patch.fullName
      if (patch.owner !== undefined) set.owner = patch.owner
      if (patch.name !== undefined) set.name = patch.name
      if (patch.private !== undefined) set.private = patch.private
      if (patch.archived !== undefined) set.archived = patch.archived
      if (patch.issuesEnabled !== undefined) {
        set.issuesEnabled = patch.issuesEnabled
      }
      if (patch.defaultBranch !== undefined) {
        set.defaultBranch = patch.defaultBranch
      }
      if (patch.pushedAt !== undefined) {
        set.pushedAt = patch.pushedAt === null ? null : new Date(patch.pushedAt)
      }
      if (patch.lastSyncedAt !== undefined) {
        set.lastSyncedAt =
          patch.lastSyncedAt === null ? null : new Date(patch.lastSyncedAt)
      }
      if (patch.syncError !== undefined) set.syncError = patch.syncError
      if (Object.keys(set).length === 0) {
        const [existing] = await db
          .select()
          .from(githubRepository)
          .where(eq(githubRepository.id, id))
        if (!existing) throw new Error("GitHub repository not found")
        return toRepository(existing)
      }
      const [row] = await db
        .update(githubRepository)
        .set(set)
        .where(eq(githubRepository.id, id))
        .returning()
      if (!row) throw new Error("GitHub repository not found")
      return toRepository(row)
    },

    async getRepository(id) {
      const db = resolveDb()
      const [row] = await db
        .select()
        .from(githubRepository)
        .where(eq(githubRepository.id, id))
      return row ? toRepository(row) : null
    },

    async listProjectRepositories(projectId) {
      const db = resolveDb()
      const rows = await db
        .select({
          repository: githubRepository,
          link: projectRepository,
        })
        .from(projectRepository)
        .innerJoin(
          githubRepository,
          eq(projectRepository.repositoryId, githubRepository.id)
        )
        .where(eq(projectRepository.projectId, projectId))
        .orderBy(sql`lower(${githubRepository.fullName})`)
      return rows.map(toProjectRepository)
    },

    async replaceProjectRepositories(projectId, repositoryIds, linkedBy, at) {
      const db = resolveDb()
      const wanted = [...new Set(repositoryIds)]
      if (wanted.length > MAX_ALLOWLIST) {
        throw invalidError(
          `At most ${MAX_ALLOWLIST} repositories can be linked to a project`
        )
      }
      return db.transaction(async (tx) => {
        if (wanted.length > 0) {
          const allowed = await tx
            .select({ id: githubRepository.id })
            .from(githubRepository)
            .innerJoin(
              githubConnection,
              eq(githubRepository.connectionId, githubConnection.id)
            )
            .innerJoin(
              project,
              eq(project.workspaceId, githubConnection.workspaceId)
            )
            .where(
              and(
                eq(project.id, projectId),
                inArray(githubRepository.id, wanted)
              )
            )
          if (allowed.length !== wanted.length) {
            throw invalidError("Repository is outside the workspace allowlist")
          }
        }

        const existing = await tx
          .select()
          .from(projectRepository)
          .where(eq(projectRepository.projectId, projectId))
        const wantedIds = new Set(wanted)
        const removed = existing
          .filter((link) => !wantedIds.has(link.repositoryId))
          .map((link) => link.repositoryId)
        if (removed.length > 0) {
          await tx
            .delete(projectRepository)
            .where(
              and(
                eq(projectRepository.projectId, projectId),
                inArray(projectRepository.repositoryId, removed)
              )
            )
        }
        const existingIds = new Set(existing.map((link) => link.repositoryId))
        const added = wanted.filter(
          (repositoryId) => !existingIds.has(repositoryId)
        )
        if (added.length > 0) {
          await tx.insert(projectRepository).values(
            added.map((repositoryId) => ({
              projectId,
              repositoryId,
              linkedBy,
              linkedAt: new Date(at),
            }))
          )
        }

        const rows = await tx
          .select({
            repository: githubRepository,
            link: projectRepository,
          })
          .from(projectRepository)
          .innerJoin(
            githubRepository,
            eq(projectRepository.repositoryId, githubRepository.id)
          )
          .where(eq(projectRepository.projectId, projectId))
          .orderBy(sql`lower(${githubRepository.fullName})`)
        return rows.map(toProjectRepository)
      })
    },

    async listRepositoryProjectIds(repositoryId) {
      const db = resolveDb()
      const rows = await db
        .select({ projectId: projectRepository.projectId })
        .from(projectRepository)
        .where(eq(projectRepository.repositoryId, repositoryId))
      return rows.map((row) => row.projectId)
    },

    async listLinkedRepositories() {
      const db = resolveDb()
      const linked = await db
        .selectDistinct({ repositoryId: projectRepository.repositoryId })
        .from(projectRepository)
      if (linked.length === 0) return []
      const rows = await db
        .select()
        .from(githubRepository)
        .where(
          inArray(
            githubRepository.id,
            linked.map((row) => row.repositoryId)
          )
        )
        .orderBy(sql`lower(${githubRepository.fullName})`)
      return rows.map(toRepository)
    },

    async deleteRepository(repositoryId) {
      const db = resolveDb()
      // FK cascades drop project links and cached snapshots.
      await db
        .delete(githubRepository)
        .where(eq(githubRepository.id, repositoryId))
    },
  }
}

function toInstall(row: typeof githubInstall.$inferSelect): GitHubInstall {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    repos: [...(row.repos ?? [])],
  }
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function invalidError(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "invalid"
  return error
}

function toConnection(
  row: typeof githubConnection.$inferSelect
): GitHubConnectionSecret {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    connectorUserId: row.connectorUserId,
    connectorAccountId: row.connectorAccountId,
    login: row.login,
    scopes: [...(row.scopes ?? [])],
    status: row.status as GitHubConnectionStatus,
    encryptedAccessToken: row.encryptedAccessToken,
    lastSyncedAt: iso(row.lastSyncedAt),
    lastManualRefreshAt: iso(row.lastManualRefreshAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toSafeConnection(
  row: typeof githubConnection.$inferSelect
): GitHubConnection {
  const { encryptedAccessToken: _token, ...safe } = toConnection(row)
  return safe
}

function toRepository(
  row: typeof githubRepository.$inferSelect
): GitHubRepository {
  return {
    id: row.id,
    connectionId: row.connectionId,
    githubId: row.githubId,
    fullName: row.fullName,
    owner: row.owner,
    name: row.name,
    private: row.private,
    archived: row.archived,
    issuesEnabled: row.issuesEnabled,
    defaultBranch: row.defaultBranch,
    pushedAt: iso(row.pushedAt),
    selectedAt: row.selectedAt.toISOString(),
    lastSyncedAt: iso(row.lastSyncedAt),
    syncError: row.syncError,
  }
}

function repositoryMetadata(remote: RemoteRepository) {
  return {
    fullName: remote.fullName,
    owner: remote.owner,
    name: remote.name,
    private: remote.private,
    archived: remote.archived,
    issuesEnabled: remote.issuesEnabled,
    defaultBranch: remote.defaultBranch,
    pushedAt: remote.pushedAt === null ? null : new Date(remote.pushedAt),
  }
}

function toProjectRepository(row: {
  repository: typeof githubRepository.$inferSelect
  link: typeof projectRepository.$inferSelect
}): ProjectRepository {
  return {
    ...toRepository(row.repository),
    linkedBy: row.link.linkedBy,
    linkedAt: row.link.linkedAt.toISOString(),
  }
}

function toLink(row: typeof externalLink.$inferSelect): ExternalLink {
  return {
    id: row.id,
    issueId: row.issueId,
    provider: "github",
    kind: row.kind as ExternalLinkKind,
    url: row.url,
    title: row.title,
    state: row.state as ExternalLinkState | null,
  }
}
