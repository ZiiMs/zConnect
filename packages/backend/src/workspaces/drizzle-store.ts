import { and, asc, eq } from "drizzle-orm"
import type { getDb } from "../db/index.js"
import {
  invitation,
  project,
  projectSequence,
  projectViewer,
  status,
  workspace,
  workspaceMember,
} from "../db/schema.js"
import type {
  Invitation,
  Membership,
  Project,
  Status,
  StatusCategory,
  Workspace,
  WorkspaceRole,
  WorkspaceStore,
  WorkspaceWithRole,
} from "./store.js"

type Db = ReturnType<typeof getDb>

function conflict(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "conflict"
  return error
}

function notFound(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "not_found"
  return error
}

/**
 * Production WorkspaceStore over Supabase Postgres. The database connection
 * resolves lazily per call so importing the app never requires DATABASE_URL —
 * contract tests inject the memory store instead.
 */
export function createDrizzleWorkspaceStore(
  resolveDb: () => Db
): WorkspaceStore {
  return {
    async createWorkspace(ownerId, name) {
      const db = resolveDb()
      const [row] = await db
        .insert(workspace)
        .values({ name, createdBy: ownerId })
        .returning()
      await db
        .insert(workspaceMember)
        .values({ workspaceId: row.id, userId: ownerId, role: "Owner" })
      return toWorkspace(row)
    },

    async listWorkspacesForUser(userId) {
      const db = resolveDb()
      const memberships = await db
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.userId, userId))
      const rows = await db.select().from(workspace)
      const byId = new Map(rows.map((w) => [w.id, w]))
      const visible: WorkspaceWithRole[] = []
      for (const m of memberships) {
        const w = byId.get(m.workspaceId)
        if (w) visible.push({ ...toWorkspace(w), role: m.role })
      }
      const memberIds = new Set(memberships.map((m) => m.workspaceId))
      const grants = await db
        .select({
          workspaceId: project.workspaceId,
          projectId: projectViewer.projectId,
        })
        .from(projectViewer)
        .innerJoin(project, eq(project.id, projectViewer.projectId))
        .where(eq(projectViewer.userId, userId))
      for (const g of grants) {
        if (memberIds.has(g.workspaceId)) continue
        memberIds.add(g.workspaceId)
        const w = byId.get(g.workspaceId)
        if (w) visible.push({ ...toWorkspace(w), role: "Viewer" })
      }
      return visible
    },

    async getMembership(workspaceId, userId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.workspaceId, workspaceId),
            eq(workspaceMember.userId, userId)
          )
        )
      const row = rows[0]
      if (!row) return null
      return {
        workspaceId: row.workspaceId,
        userId: row.userId,
        role: row.role,
      }
    },

    async listMembers(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.workspaceId, workspaceId))
      return rows.map((row) => ({
        workspaceId: row.workspaceId,
        userId: row.userId,
        role: row.role,
      }))
    },

    async createInvitation(input) {
      const db = resolveDb()
      const email = input.email.toLowerCase()
      try {
        const [row] = await db
          .insert(invitation)
          .values({ ...input, email })
          .returning()
        return toInvitation(row)
      } catch {
        throw conflict("Invitation already exists")
      }
    },

    async listInvitationsForEmail(email) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(invitation)
        .where(eq(invitation.email, email.toLowerCase()))
      return rows.map(toInvitation)
    },

    async acceptInvitation(invitationId, userId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(invitation)
        .where(eq(invitation.id, invitationId))
      const row = rows[0]
      if (!row) throw notFound("Invitation not found")
      const current = await this.getMembership(row.workspaceId, userId)
      if (current) {
        await db.delete(invitation).where(eq(invitation.id, invitationId))
        return current
      }
      const [member] = await db
        .insert(workspaceMember)
        .values({ workspaceId: row.workspaceId, userId, role: row.role })
        .returning()
      await db.delete(invitation).where(eq(invitation.id, invitationId))
      return {
        workspaceId: member.workspaceId,
        userId: member.userId,
        role: member.role,
      }
    },

    async createProject(workspaceId, input) {
      const db = resolveDb()
      const key = input.key.toUpperCase()
      try {
        const [row] = await db
          .insert(project)
          .values({ workspaceId, name: input.name, key })
          .returning()
        await db.insert(projectSequence).values({ projectId: row.id })
        return toProject(row)
      } catch {
        throw conflict("Project key already exists")
      }
    },

    async listProjects(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(project)
        .where(eq(project.workspaceId, workspaceId))
      return rows.map(toProject)
    },

    async getProject(projectId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(project)
        .where(eq(project.id, projectId))
      const row = rows[0]
      return row ? toProject(row) : null
    },

    async updateProject(projectId, input) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(project)
        .where(eq(project.id, projectId))
      const row = rows[0]
      if (!row) throw notFound("Project not found")
      const patch: { name?: string; key?: string } = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.key !== undefined) {
        const key = input.key.toUpperCase()
        if (key !== row.key) {
          if (await this.hasIssues(projectId)) {
            const error = new Error("Project key is locked once issues exist")
            ;(error as { code?: string }).code = "locked"
            throw error
          }
          patch.key = key
        }
      }
      if (Object.keys(patch).length === 0) return toProject(row)
      try {
        const [updated] = await db
          .update(project)
          .set(patch)
          .where(eq(project.id, projectId))
          .returning()
        return toProject(updated)
      } catch {
        throw conflict("Project key already exists")
      }
    },

    async getNextIssueNumber(projectId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(projectSequence)
        .where(eq(projectSequence.projectId, projectId))
      const row = rows[0]
      if (!row) throw notFound("Project not found")
      return row.nextNumber
    },

    async hasIssues(projectId) {
      return (await this.getNextIssueNumber(projectId)) > 1
    },

    async createStatus(projectId, input) {
      const db = resolveDb()
      const existing = await db
        .select()
        .from(status)
        .where(eq(status.projectId, projectId))
      const position = existing.length
      try {
        const [row] = await db
          .insert(status)
          .values({ ...input, projectId, position })
          .returning()
        return toStatus(row)
      } catch {
        throw conflict("Status already exists")
      }
    },

    async listStatuses(projectId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(status)
        .where(eq(status.projectId, projectId))
        .orderBy(asc(status.position))
      return rows.map(toStatus)
    },

    async getStatus(statusId) {
      const db = resolveDb()
      const rows = await db.select().from(status).where(eq(status.id, statusId))
      const row = rows[0]
      return row ? toStatus(row) : null
    },

    async updateStatus(statusId, input) {
      const db = resolveDb()
      const rows = await db.select().from(status).where(eq(status.id, statusId))
      const row = rows[0]
      if (!row) throw notFound("Status not found")
      if (input.name !== undefined || input.category !== undefined) {
        try {
          await db
            .update(status)
            .set({
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.category !== undefined
                ? { category: input.category }
                : {}),
            })
            .where(eq(status.id, statusId))
        } catch {
          throw conflict("Status already exists")
        }
      }
      if (input.position !== undefined) {
        const ordered = (await this.listStatuses(row.projectId)).filter(
          (s) => s.id !== statusId
        )
        const current = (await this.getStatus(statusId)) ?? toStatus(row)
        const at = Math.max(0, Math.min(input.position, ordered.length))
        ordered.splice(at, 0, current)
        for (const [index, item] of ordered.entries()) {
          await db
            .update(status)
            .set({ position: index })
            .where(eq(status.id, item.id))
        }
      }
      const refreshed = await this.getStatus(statusId)
      if (!refreshed) throw notFound("Status not found")
      return refreshed
    },

    async deleteStatus(statusId) {
      const db = resolveDb()
      const rows = await db.select().from(status).where(eq(status.id, statusId))
      const row = rows[0]
      if (!row) throw notFound("Status not found")
      // TODO(T3): count against the issue table once it exists; no issue
      // rows can exist yet, so the guard below always passes for now.
      if ((await this.countIssuesInStatus(statusId)) > 0) {
        const error = new Error("Cannot delete a status that holds issues")
        ;(error as { code?: string }).code = "locked"
        throw error
      }
      await db.delete(status).where(eq(status.id, statusId))
      const remaining = await this.listStatuses(row.projectId)
      for (const [index, item] of remaining.entries()) {
        await db
          .update(status)
          .set({ position: index })
          .where(eq(status.id, item.id))
      }
    },

    async recordIssue(projectId, _statusId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(projectSequence)
        .where(eq(projectSequence.projectId, projectId))
      const row = rows[0]
      if (!row) throw notFound("Project not found")
      // Forward-compat probe: advances the sequence the way T3's issue
      // creation will. Per-status counts arrive with T3's issue table.
      await db
        .update(projectSequence)
        .set({ nextNumber: row.nextNumber + 1 })
        .where(eq(projectSequence.projectId, projectId))
      return { number: row.nextNumber }
    },

    async countIssuesInStatus(_statusId) {
      // TODO(T3): query the issue table once it exists.
      return 0
    },

    async addProjectViewer(projectId, userId) {
      const db = resolveDb()
      await db
        .insert(projectViewer)
        .values({ projectId, userId })
        .onConflictDoNothing()
    },

    async isProjectViewer(projectId, userId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(projectViewer)
        .where(
          and(
            eq(projectViewer.projectId, projectId),
            eq(projectViewer.userId, userId)
          )
        )
      return rows.length > 0
    },

    async hasProjectGrantInWorkspace(workspaceId, userId) {
      const db = resolveDb()
      const rows = await db
        .select({ projectId: projectViewer.projectId })
        .from(projectViewer)
        .innerJoin(project, eq(project.id, projectViewer.projectId))
        .where(
          and(
            eq(project.workspaceId, workspaceId),
            eq(projectViewer.userId, userId)
          )
        )
      return rows.length > 0
    },
  }
}

function toWorkspace(row: typeof workspace.$inferSelect): Workspace {
  return { id: row.id, name: row.name, createdBy: row.createdBy }
}

function toInvitation(row: typeof invitation.$inferSelect): Invitation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role as WorkspaceRole,
    invitedBy: row.invitedBy,
  }
}

function toProject(row: typeof project.$inferSelect): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    key: row.key,
  }
}

function toStatus(row: typeof status.$inferSelect): Status {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    category: row.category as StatusCategory,
    position: row.position,
  }
}

type MemberRow = typeof workspaceMember.$inferSelect

export function toMembership(row: MemberRow): Membership {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role as WorkspaceRole,
  }
}
