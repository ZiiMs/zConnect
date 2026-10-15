import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import type { getDb } from "../db/index.js"
import {
  invitation,
  issue,
  project,
  projectSequence,
  projectViewer,
  status,
  workspace,
  workspaceMember,
} from "../db/schema.js"
import type {
  CreateIssueInput,
  Invitation,
  Issue,
  IssueFilters,
  Membership,
  Priority,
  Project,
  Status,
  StatusCategory,
  UpdateIssueInput,
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

function invalid(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "invalid"
  return error
}

function parseDueDate(dueDate: string | null | undefined): Date | null {
  if (dueDate === undefined || dueDate === null) return null
  const parsed = new Date(dueDate)
  if (Number.isNaN(parsed.getTime())) throw invalid("Invalid due date")
  return parsed
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
      // Guarded by the issue table: any Issue (including archived ones)
      // still references its status, so deletion must stay blocked.
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

    async createIssue(
      projectId: string,
      input: CreateIssueInput
    ): Promise<Issue> {
      const db = resolveDb()
      const projects = await db
        .select()
        .from(project)
        .where(eq(project.id, projectId))
      const projectRow = projects[0]
      if (!projectRow) throw notFound("Project not found")
      const title = input.title.trim()
      if (!title) throw invalid("Invalid title")
      const statusRows = await db
        .select()
        .from(status)
        .where(eq(status.id, input.statusId))
      const statusRow = statusRows[0]
      if (!statusRow || statusRow.projectId !== projectId) {
        throw invalid("Invalid status")
      }
      const priority: Priority = input.priority ?? "Medium"
      let assigneeId: string | null = null
      if (input.assigneeId !== undefined && input.assigneeId !== null) {
        const found = await db
          .select()
          .from(workspaceMember)
          .where(
            and(
              eq(workspaceMember.workspaceId, projectRow.workspaceId),
              eq(workspaceMember.userId, input.assigneeId)
            )
          )
        if (found.length === 0) throw invalid("Assignee is not a member")
        assigneeId = input.assigneeId
      }
      const dueDate = parseDueDate(input.dueDate)
      const sequences = await db
        .select()
        .from(projectSequence)
        .where(eq(projectSequence.projectId, projectId))
      const sequence = sequences[0]
      if (!sequence) throw notFound("Project not found")
      const number = sequence.nextNumber
      await db
        .update(projectSequence)
        .set({ nextNumber: number + 1 })
        .where(eq(projectSequence.projectId, projectId))
      const [row] = await db
        .insert(issue)
        .values({
          projectId,
          number,
          keyPrefix: projectRow.key,
          identifier: `${projectRow.key}-${number}`,
          title,
          description: input.description ?? null,
          statusId: statusRow.id,
          priority,
          assigneeId,
          dueDate,
          labels: input.labels ? [...input.labels] : [],
        })
        .returning()
      return toIssue(row)
    },

    async listIssues(
      projectId: string,
      filters?: IssueFilters
    ): Promise<Issue[]> {
      const db = resolveDb()
      const conditions = [
        eq(issue.projectId, projectId),
        eq(issue.archived, filters?.archived ?? false),
      ]
      if (filters?.statusIds !== undefined && filters.statusIds.length > 0) {
        conditions.push(inArray(issue.statusId, filters.statusIds))
      }
      if (filters?.priorities !== undefined && filters.priorities.length > 0) {
        conditions.push(inArray(issue.priority, filters.priorities))
      }
      if (filters?.assigneeId !== undefined) {
        conditions.push(
          filters.assigneeId === null
            ? isNull(issue.assigneeId)
            : eq(issue.assigneeId, filters.assigneeId)
        )
      }
      const rows = await db
        .select()
        .from(issue)
        .where(and(...conditions))
        .orderBy(asc(issue.number))
      const labels =
        filters?.labels !== undefined && filters.labels.length > 0
          ? new Set(filters.labels)
          : undefined
      const text = filters?.text?.toLowerCase()
      return rows
        .map(toIssue)
        .filter(
          (item) =>
            !labels ||
            [...labels].every((label) => item.labels.includes(label))
        )
        .filter(
          (item) =>
            !text ||
            item.identifier.toLowerCase().includes(text) ||
            item.title.toLowerCase().includes(text)
        )
    },

    async getIssue(ref: string): Promise<Issue | null> {
      const db = resolveDb()
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
        const byId = await db.select().from(issue).where(eq(issue.id, ref))
        if (byId[0]) return toIssue(byId[0])
      }
      const byKey = await db
        .select()
        .from(issue)
        .where(eq(issue.identifier, ref.toUpperCase()))
      return byKey[0] ? toIssue(byKey[0]) : null
    },

    async updateIssue(
      ref: string,
      input: UpdateIssueInput
    ): Promise<Issue> {
      const db = resolveDb()
      const current = await this.getIssue(ref)
      if (!current) throw notFound("Issue not found")
      let projectId = current.projectId
      if (input.projectId !== undefined && input.projectId !== current.projectId) {
        const targets = await db
          .select()
          .from(project)
          .where(eq(project.id, input.projectId))
        const target = targets[0]
        if (!target) throw notFound("Project not found")
        const sources = await db
          .select()
          .from(project)
          .where(eq(project.id, current.projectId))
        const source = sources[0]
        if (!source || source.workspaceId !== target.workspaceId) {
          throw invalid("Cannot move an issue to another workspace")
        }
        projectId = target.id
      }
      if (input.statusId !== undefined) {
        const statusRows = await db
          .select()
          .from(status)
          .where(eq(status.id, input.statusId))
        const statusRow = statusRows[0]
        if (!statusRow || statusRow.projectId !== projectId) {
          throw invalid("Invalid status")
        }
      } else if (projectId !== current.projectId) {
        const statusRows = await db
          .select()
          .from(status)
          .where(eq(status.id, current.statusId))
        const statusRow = statusRows[0]
        if (!statusRow || statusRow.projectId !== projectId) {
          throw invalid("A status in the target project is required")
        }
      }
      if (input.title !== undefined && !input.title.trim()) {
        throw invalid("Invalid title")
      }
      let assigneeId = current.assigneeId
      let assigneeTouched = false
      if (input.assigneeId !== undefined) {
        assigneeTouched = true
        assigneeId = input.assigneeId
        if (assigneeId !== null) {
          const projectRows = await db
            .select()
            .from(project)
            .where(eq(project.id, projectId))
          const projectRow = projectRows[0]
          if (!projectRow) throw notFound("Project not found")
          const found = await db
            .select()
            .from(workspaceMember)
            .where(
              and(
                eq(workspaceMember.workspaceId, projectRow.workspaceId),
                eq(workspaceMember.userId, assigneeId)
              )
            )
          if (found.length === 0) throw invalid("Assignee is not a member")
        }
      }
      const [updated] = await db
        .update(issue)
        .set({
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.statusId !== undefined ? { statusId: input.statusId } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(assigneeTouched ? { assigneeId } : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: parseDueDate(input.dueDate) }
            : {}),
          ...(input.archived !== undefined ? { archived: input.archived } : {}),
          ...(input.labels !== undefined ? { labels: [...input.labels] } : {}),
          ...(projectId !== current.projectId ? { projectId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(issue.id, current.id))
        .returning()
      if (!updated) throw notFound("Issue not found")
      return toIssue(updated)
    },

    async recordIssue(projectId, _statusId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(projectSequence)
        .where(eq(projectSequence.projectId, projectId))
      const row = rows[0]
      if (!row) throw notFound("Project not found")
      // T2 probe: advances the sequence exactly like issue creation.
      // Production routes never call it; contract tests seed through it.
      await db
        .update(projectSequence)
        .set({ nextNumber: row.nextNumber + 1 })
        .where(eq(projectSequence.projectId, projectId))
      return { number: row.nextNumber }
    },

    async countIssuesInStatus(statusId: string) {
      const db = resolveDb()
      const rows = await db
        .select({ id: issue.id })
        .from(issue)
        .where(eq(issue.statusId, statusId))
      return rows.length
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

function toIssue(row: typeof issue.$inferSelect): Issue {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    keyPrefix: row.keyPrefix,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    statusId: row.statusId,
    priority: row.priority as Priority,
    assigneeId: row.assigneeId,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    archived: row.archived,
    labels: [...(row.labels ?? [])],
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
