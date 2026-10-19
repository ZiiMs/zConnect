import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { user } from "../db/auth-schema.js"
import type { getDb } from "../db/index.js"
import {
  invitation,
  issue,
  issueLabel,
  label,
  project,
  projectSequence,
  projectViewer,
  status,
  workspace,
  workspaceMember,
} from "../db/schema.js"
import type {
  CreateIssueInput,
  CreateLabelInput,
  Invitation,
  Issue,
  IssueFilters,
  Label,
  Membership,
  Priority,
  Project,
  Status,
  StatusCategory,
  UpdateIssueInput,
  UpdateLabelInput,
  Workspace,
  WorkspaceRole,
  WorkspaceStore,
  WorkspaceWithRole,
} from "./store.js"
import {
  DEFAULT_LABEL_COLOR,
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  DEFAULT_SEED_ISSUES,
  DEFAULT_STATUS_ROSTER,
  defaultStatusColorForName,
  isValidLabelColor,
  isValidProjectColor,
  isValidProjectIcon,
  isValidStatusColor,
  normalizeLabelNames,
  seedIssueFields,
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

/** True for a Postgres unique-violation, however drizzle wraps it. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (
    let depth = 0;
    depth < 3 && current !== null && current !== undefined;
    depth += 1
  ) {
    if ((current as { code?: unknown }).code === "23505") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

function parseDueDate(dueDate: string | null | undefined): Date | null {
  if (dueDate === undefined || dueDate === null) return null
  const parsed = new Date(dueDate)
  if (Number.isNaN(parsed.getTime())) throw invalid("Invalid due date")
  return parsed
}

/**
 * Validate a T5 subtask link for `childId` (null when creating): same
 * project, no self-parent, one level only (parent must be top-level and the
 * child must not already have subtasks). Unknown ids are invalid (400).
 */
async function resolveParentRow(
  db: Db,
  projectId: string,
  selfId: string | null,
  parentId: string
): Promise<string> {
  const parentRows = await db.select().from(issue).where(eq(issue.id, parentId))
  const parentRow = parentRows[0]
  if (!parentRow) throw invalid("Parent issue not found")
  if (parentRow.projectId !== projectId) {
    throw invalid("A subtask must live in the same project as its parent")
  }
  if (selfId !== null && parentRow.id === selfId) {
    throw invalid("An issue cannot be its own parent")
  }
  if (parentRow.parentId) {
    throw invalid("Subtasks cannot nest more than one level")
  }
  if (selfId !== null) {
    const existing = await db
      .select({ id: issue.id })
      .from(issue)
      .where(eq(issue.parentId, selfId))
    if (existing.length > 0) {
      throw invalid("An issue with subtasks cannot become a subtask")
    }
  }
  return parentRow.id
}

/**
 * Resolve one label name to its registry row, creating it with the default
 * color when missing. Matches are case-insensitive per the store contract.
 */
async function ensureLabelRow(
  db: Db,
  workspaceId: string,
  name: string
): Promise<typeof label.$inferSelect> {
  const existing = await db
    .select()
    .from(label)
    .where(eq(label.workspaceId, workspaceId))
  const found = existing.find(
    (row) => row.name.toLowerCase() === name.toLowerCase()
  )
  if (found) return found
  try {
    const [row] = await db
      .insert(label)
      .values({ workspaceId, name, color: DEFAULT_LABEL_COLOR })
      .returning()
    return row
  } catch {
    const retry = await db
      .select()
      .from(label)
      .where(eq(label.workspaceId, workspaceId))
    const raced = retry.find(
      (row) => row.name.toLowerCase() === name.toLowerCase()
    )
    if (raced) return raced
    throw conflict("Label already exists")
  }
}

async function relinkIssue(
  db: Db,
  issueId: string,
  labelIds: string[]
): Promise<void> {
  await db.delete(issueLabel).where(eq(issueLabel.issueId, issueId))
  if (labelIds.length > 0) {
    await db
      .insert(issueLabel)
      .values(labelIds.map((labelId) => ({ issueId, labelId })))
  }
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
        .select({
          workspaceId: workspaceMember.workspaceId,
          userId: workspaceMember.userId,
          role: workspaceMember.role,
          name: user.name,
          image: user.image,
        })
        .from(workspaceMember)
        .leftJoin(user, eq(user.id, workspaceMember.userId))
        .where(eq(workspaceMember.workspaceId, workspaceId))
      return rows.map((row) => ({
        workspaceId: row.workspaceId,
        userId: row.userId,
        role: row.role,
        name: row.name ?? undefined,
        image: row.image ?? null,
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
      const icon = input.icon ?? DEFAULT_PROJECT_ICON
      if (!isValidProjectIcon(icon)) throw invalid("Invalid project icon")
      const color = input.color ?? DEFAULT_PROJECT_COLOR
      if (!isValidProjectColor(color)) throw invalid("Invalid project color")
      try {
        // ADR-0001 seeding: project + sequence + the default roster + the six
        // sample issues go in one transaction, so a failure anywhere leaves
        // no half-seeded project behind.
        const row = await db.transaction(async (tx) => {
          const [projectRow] = await tx
            .insert(project)
            .values({ workspaceId, name: input.name, key, icon, color })
            .returning()
          await tx.insert(projectSequence).values({ projectId: projectRow.id })
          const statusRows = await tx
            .insert(status)
            .values(
              DEFAULT_STATUS_ROSTER.map((entry, position) => ({
                projectId: projectRow.id,
                name: entry.name,
                category: entry.category,
                color: entry.color,
                position,
              }))
            )
            .returning()
          const statusIdByName = new Map(
            statusRows.map((s) => [s.name, s.id] as const)
          )
          let nextNumber = 1
          for (const seed of DEFAULT_SEED_ISSUES) {
            const statusId = statusIdByName.get(seed.statusName)
            if (!statusId) {
              throw invalid(`Seed status ${seed.statusName} is missing`)
            }
            await tx.insert(issue).values({
              projectId: projectRow.id,
              ...seedIssueFields(projectRow.key, nextNumber, statusId, seed),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            nextNumber += 1
          }
          await tx
            .update(projectSequence)
            .set({ nextNumber })
            .where(eq(projectSequence.projectId, projectRow.id))
          return projectRow
        })
        return toProject(row)
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("Project key already exists")
        }
        throw error
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
      const patch: {
        name?: string
        key?: string
        icon?: string
        color?: string
      } = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.icon !== undefined) {
        if (!isValidProjectIcon(input.icon)) {
          throw invalid("Invalid project icon")
        }
        patch.icon = input.icon
      }
      if (input.color !== undefined) {
        if (!isValidProjectColor(input.color)) {
          throw invalid("Invalid project color")
        }
        patch.color = input.color
      }
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
      const color = input.color ?? defaultStatusColorForName(input.name)
      if (!isValidStatusColor(color)) throw invalid("Invalid status color")
      try {
        const [row] = await db
          .insert(status)
          .values({ ...input, color, projectId, position })
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
      if (
        input.name !== undefined ||
        input.category !== undefined ||
        input.color !== undefined
      ) {
        if (input.color !== undefined && !isValidStatusColor(input.color)) {
          throw invalid("Invalid status color")
        }
        try {
          await db
            .update(status)
            .set({
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.category !== undefined
                ? { category: input.category }
                : {}),
              ...(input.color !== undefined ? { color: input.color } : {}),
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
      // T5 registry: free-form names resolve to shared rows (auto-created),
      // while the T3 text[] column stays the read-compatible name list.
      const labelNames = normalizeLabelNames(input.labels ?? [])
      const labelRows: { id: string }[] = []
      for (const name of labelNames) {
        labelRows.push(await ensureLabelRow(db, projectRow.workspaceId, name))
      }
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
          labels: [...labelNames],
          parentId:
            input.parentId === undefined || input.parentId === null
              ? null
              : await resolveParentRow(db, projectId, null, input.parentId),
        })
        .returning()
      await relinkIssue(
        db,
        row.id,
        labelRows.map((r) => r.id)
      )
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
            !labels || [...labels].every((label) => item.labels.includes(label))
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
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          ref
        )
      ) {
        const byId = await db.select().from(issue).where(eq(issue.id, ref))
        if (byId[0]) return toIssue(byId[0])
      }
      const byKey = await db
        .select()
        .from(issue)
        .where(eq(issue.identifier, ref.toUpperCase()))
      return byKey[0] ? toIssue(byKey[0]) : null
    },

    async updateIssue(ref: string, input: UpdateIssueInput): Promise<Issue> {
      const db = resolveDb()
      const current = await this.getIssue(ref)
      if (!current) throw notFound("Issue not found")
      let projectId = current.projectId
      if (
        input.projectId !== undefined &&
        input.projectId !== current.projectId
      ) {
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
        // Subtask links are same-project only, so linked issues stay put.
        const linked = await db
          .select({ id: issue.id })
          .from(issue)
          .where(eq(issue.parentId, current.id))
        if (current.parentId !== null || linked.length > 0) {
          throw invalid("Cannot move an issue with subtask links")
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
      let labelNames: string[] | undefined
      let labelRows: { id: string }[] | undefined
      if (input.labels !== undefined) {
        const projectRows = await db
          .select()
          .from(project)
          .where(eq(project.id, projectId))
        const projectRow = projectRows[0]
        if (!projectRow) throw notFound("Project not found")
        labelNames = normalizeLabelNames(input.labels)
        labelRows = []
        for (const name of labelNames) {
          labelRows.push(await ensureLabelRow(db, projectRow.workspaceId, name))
        }
      }
      let parentTouched = false
      let parentId: string | null = current.parentId
      if (input.parentId !== undefined) {
        parentTouched = true
        parentId =
          input.parentId === null
            ? null
            : await resolveParentRow(db, projectId, current.id, input.parentId)
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
          ...(labelNames !== undefined ? { labels: [...labelNames] } : {}),
          ...(parentTouched ? { parentId } : {}),
          ...(projectId !== current.projectId ? { projectId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(issue.id, current.id))
        .returning()
      if (!updated) throw notFound("Issue not found")
      if (labelNames !== undefined && labelRows !== undefined) {
        await relinkIssue(
          db,
          current.id,
          labelRows.map((r) => r.id)
        )
      }
      return toIssue(updated)
    },

    async createLabel(
      workspaceId: string,
      input: CreateLabelInput
    ): Promise<Label> {
      const db = resolveDb()
      const name = input.name.trim()
      if (!name) throw invalid("Invalid label name")
      const color = input.color ?? DEFAULT_LABEL_COLOR
      if (!isValidLabelColor(color)) throw invalid("Invalid label color")
      try {
        const [row] = await db
          .insert(label)
          .values({ workspaceId, name, color })
          .returning()
        return toLabel(row)
      } catch {
        throw conflict("Label already exists")
      }
    },

    async listLabels(workspaceId: string): Promise<Label[]> {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(label)
        .where(eq(label.workspaceId, workspaceId))
        .orderBy(asc(label.name))
      return rows.map(toLabel)
    },

    async updateLabel(
      labelId: string,
      input: UpdateLabelInput
    ): Promise<Label> {
      const db = resolveDb()
      const rows = await db.select().from(label).where(eq(label.id, labelId))
      const row = rows[0]
      if (!row) throw notFound("Label not found")
      const patch: { name?: string; color?: string } = {}
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (!name) throw invalid("Invalid label name")
        if (name !== row.name) patch.name = name
      }
      if (input.color !== undefined) {
        if (!isValidLabelColor(input.color)) {
          throw invalid("Invalid label color")
        }
        patch.color = input.color
      }
      if (Object.keys(patch).length === 0) return toLabel(row)
      const nextName = patch.name
      const siblings = await db
        .select()
        .from(label)
        .where(eq(label.workspaceId, row.workspaceId))
      if (
        nextName !== undefined &&
        siblings.some(
          (s) =>
            s.id !== labelId && s.name.toLowerCase() === nextName.toLowerCase()
        )
      ) {
        throw conflict("Label already exists")
      }
      try {
        const [updated] = await db
          .update(label)
          .set(patch)
          .where(eq(label.id, labelId))
          .returning()
        if (nextName !== undefined && nextName !== row.name) {
          // Rename propagation: rewrite the T3 text[] names on linked issues.
          const links = await db
            .select()
            .from(issueLabel)
            .where(eq(issueLabel.labelId, labelId))
          for (const link of links) {
            const issueRows = await db
              .select()
              .from(issue)
              .where(eq(issue.id, link.issueId))
            const issueRow = issueRows[0]
            if (!issueRow) continue
            await db
              .update(issue)
              .set({
                labels: (issueRow.labels ?? []).map((name) =>
                  name === row.name ? nextName : name
                ),
              })
              .where(eq(issue.id, link.issueId))
          }
        }
        return toLabel(updated)
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "conflict"
        ) {
          throw error
        }
        throw conflict("Label already exists")
      }
    },

    async deleteLabel(labelId: string): Promise<void> {
      const db = resolveDb()
      const rows = await db.select().from(label).where(eq(label.id, labelId))
      const row = rows[0]
      if (!row) throw notFound("Label not found")
      const links = await db
        .select()
        .from(issueLabel)
        .where(eq(issueLabel.labelId, labelId))
      // Scrub the T3 text[] names on linked issues so filters stay correct.
      for (const link of links) {
        const issueRows = await db
          .select()
          .from(issue)
          .where(eq(issue.id, link.issueId))
        const issueRow = issueRows[0]
        if (!issueRow) continue
        await db
          .update(issue)
          .set({
            labels: (issueRow.labels ?? []).filter((name) => name !== row.name),
          })
          .where(eq(issue.id, link.issueId))
      }
      await db.delete(issueLabel).where(eq(issueLabel.labelId, labelId))
      await db.delete(label).where(eq(label.id, labelId))
    },

    async listSubtasks(parentId: string): Promise<Issue[]> {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(issue)
        .where(eq(issue.parentId, parentId))
        .orderBy(asc(issue.number))
      return rows.map(toIssue)
    },

    async deleteIssue(ref: string): Promise<void> {
      const db = resolveDb()
      const current = await this.getIssue(ref)
      if (!current) throw notFound("Issue not found")
      await db
        .update(issue)
        .set({ parentId: null })
        .where(eq(issue.parentId, current.id))
      await db.delete(issueLabel).where(eq(issueLabel.issueId, current.id))
      await db.delete(issue).where(eq(issue.id, current.id))
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
    icon: row.icon ?? DEFAULT_PROJECT_ICON,
    color: row.color ?? DEFAULT_PROJECT_COLOR,
  }
}

function toStatus(row: typeof status.$inferSelect): Status {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    category: row.category as StatusCategory,
    color: row.color ?? DEFAULT_LABEL_COLOR,
    position: row.position,
  }
}

function toLabel(row: typeof label.$inferSelect): Label {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color ?? DEFAULT_LABEL_COLOR,
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
    parentId: row.parentId,
    createdAt: row.createdAt
      ? row.createdAt.toISOString()
      : new Date().toISOString(),
    updatedAt: row.updatedAt
      ? row.updatedAt.toISOString()
      : new Date().toISOString(),
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
