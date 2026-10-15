import { and, eq } from "drizzle-orm"
import type { getDb } from "../db/index.js"
import {
  invitation,
  project,
  projectViewer,
  workspace,
  workspaceMember,
} from "../db/schema.js"
import type {
  Invitation,
  Membership,
  Project,
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

type MemberRow = typeof workspaceMember.$inferSelect

export function toMembership(row: MemberRow): Membership {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role as WorkspaceRole,
  }
}
