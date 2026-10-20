import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm"
import { user } from "../db/auth-schema.js"
import type { getDb } from "../db/index.js"
import {
  activityEvent,
  comment,
  invitation,
  issue,
  issueLabel,
  issueWatcher,
  label,
  notification as notificationTable,
  project,
  projectSequence,
  projectViewer,
  status,
  userNotificationSettings,
  workspace,
  workspaceMember,
} from "../db/schema.js"
import {
  decodeCursor,
  diffIssueUpdate,
  encodeCursor,
  isDescriptionCoalesced,
  mergeTimeline,
} from "./activity.js"
import type {
  ActivityActor,
  ActivityActorType,
  ActivityEvent,
  Actor,
  Comment,
  CreateIssueInput,
  CreateLabelInput,
  EmailMode,
  Invitation,
  Issue,
  IssueFilters,
  Label,
  Membership,
  Notification,
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
  SYSTEM_ACTOR,
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

/** Page sizes documented by the collaboration contracts. */
function pageLimit(
  limit: number | undefined,
  fallback: number,
  max: number
): number {
  const value = Math.floor(limit ?? fallback)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(value, max)
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function toComment(row: typeof comment.$inferSelect): Comment {
  return {
    id: row.id,
    issueId: row.issueId,
    authorId: row.authorId,
    body: row.body,
    parentId: row.parentId,
    editedAt: iso(row.editedAt),
    deletedAt: iso(row.deletedAt),
    createdAt: row.createdAt.toISOString(),
  }
}

function toActivityEvent(
  row: typeof activityEvent.$inferSelect
): ActivityEvent {
  return {
    id: row.id,
    issueId: row.issueId,
    actorType: row.actorType as ActivityActorType,
    actorId: row.actorId,
    type: row.type,
    summary: row.summary,
    payload: { ...(row.payload ?? {}) },
    createdAt: row.createdAt.toISOString(),
  }
}

function toNotification(
  row: typeof notificationTable.$inferSelect
): Notification {
  return {
    id: row.id,
    userId: row.userId,
    issueId: row.issueId,
    type: row.type,
    actorType: row.actorType as ActivityActorType,
    actorId: row.actorId,
    payload: { ...(row.payload ?? {}) },
    readAt: iso(row.readAt),
    emailedAt: iso(row.emailedAt),
    createdAt: row.createdAt.toISOString(),
  }
}

/** Insert one Activity Event row; shared by mutators and appendActivity. */
async function insertActivity(
  db: Db,
  issueId: string,
  actor: ActivityActor,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  createdAt: Date
): Promise<ActivityEvent> {
  const [row] = await db
    .insert(activityEvent)
    .values({
      issueId,
      actorType: actor.type,
      actorId: actor.id,
      type,
      summary,
      payload,
      createdAt,
    })
    .returning()
  return toActivityEvent(row)
}
/**
 * Production WorkspaceStore over Neon Postgres. The database connection
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

    async getWorkspace(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(workspace)
        .where(eq(workspace.id, workspaceId))
      const row = rows[0]
      return row ? toWorkspace(row) : null
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
          email: user.email,
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
        email: row.email ?? null,
      }))
    },

    async createInvitation(input) {
      const db = resolveDb()
      const email = input.email.toLowerCase()
      try {
        const [row] = await db
          .insert(invitation)
          .values({
            ...input,
            email,
            // Contract: expiry = created + 7 days.
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          })
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

    async listInvitationsForWorkspace(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(invitation)
        .where(eq(invitation.workspaceId, workspaceId))
      return rows.map(toInvitation)
    },

    async deleteInvitation(invitationId) {
      const db = resolveDb()
      const deleted = await db
        .delete(invitation)
        .where(eq(invitation.id, invitationId))
        .returning({ id: invitation.id })
      return deleted.length > 0
    },

    async getInvitation(invitationId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(invitation)
        .where(eq(invitation.id, invitationId))
      const row = rows[0]
      return row ? toInvitation(row) : null
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

    async listProjects(workspaceId, userId?) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(project)
        .where(eq(project.workspaceId, workspaceId))
      if (!userId) return rows.map(toProject)
      // Members see the whole workspace; Viewer grants scope to their rows.
      const membership = await this.getMembership(workspaceId, userId)
      if (membership) return rows.map(toProject)
      const grants = await db
        .select({ projectId: projectViewer.projectId })
        .from(projectViewer)
        .where(eq(projectViewer.userId, userId))
      const granted = new Set(grants.map((grant) => grant.projectId))
      return rows.filter((row) => granted.has(row.id)).map(toProject)
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
      input: CreateIssueInput,
      actor: Actor = SYSTEM_ACTOR
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
          // Only a signed-in user owns authorship; agent/system creates and
          // seeded samples stay null.
          createdBy: actor.type === "user" ? actor.id : null,
        })
        .returning()
      await relinkIssue(
        db,
        row.id,
        labelRows.map((r) => r.id)
      )
      await insertActivity(
        db,
        row.id,
        actor,
        "issue.created",
        "created the issue",
        { identifier: row.identifier, title: row.title },
        new Date()
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

    async updateIssue(
      ref: string,
      input: UpdateIssueInput,
      actor: Actor = SYSTEM_ACTOR
    ): Promise<Issue> {
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
      const after = toIssue(updated)
      const parentIds = [current.parentId, after.parentId].filter(
        (id): id is string => id !== null
      )
      const parentIdentifiers = new Map<string, string>()
      if (parentIds.length > 0) {
        const parents = await db
          .select({ id: issue.id, identifier: issue.identifier })
          .from(issue)
          .where(inArray(issue.id, parentIds))
        for (const parent of parents) {
          parentIdentifiers.set(parent.id, parent.identifier)
        }
      }
      const identifierOf = (id: string | null): string | null =>
        id === null ? null : (parentIdentifiers.get(id) ?? id)
      const now = new Date()
      let drafts = diffIssueUpdate(current, after, input, {
        fromParentIdentifier: identifierOf(current.parentId),
        toParentIdentifier: identifierOf(after.parentId),
      })
      if (drafts.some((draft) => draft.type === "issue.description_changed")) {
        const latest = await db
          .select({ createdAt: activityEvent.createdAt })
          .from(activityEvent)
          .where(
            and(
              eq(activityEvent.issueId, current.id),
              eq(activityEvent.type, "issue.description_changed"),
              eq(activityEvent.actorType, actor.type),
              actor.id === null
                ? isNull(activityEvent.actorId)
                : eq(activityEvent.actorId, actor.id)
            )
          )
          .orderBy(desc(activityEvent.createdAt))
          .limit(1)
        if (
          isDescriptionCoalesced(
            latest[0]?.createdAt?.toISOString() ?? null,
            now
          )
        ) {
          drafts = drafts.filter(
            (draft) => draft.type !== "issue.description_changed"
          )
        }
      }
      for (const draft of drafts) {
        await insertActivity(
          db,
          current.id,
          actor,
          draft.type,
          draft.summary,
          draft.payload,
          now
        )
      }
      return after
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

    async deleteIssue(ref: string, _actor?: Actor): Promise<void> {
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

    async createComment(input) {
      const db = resolveDb()
      const issueRows = await db
        .select({ id: issue.id })
        .from(issue)
        .where(eq(issue.id, input.issueId))
      if (!issueRows[0]) throw invalid("Issue not found")
      const body = input.body.trim()
      if (!body) throw invalid("Comment body is required")
      const parentId = input.parentId ?? null
      if (parentId !== null) {
        const parents = await db
          .select()
          .from(comment)
          .where(eq(comment.id, parentId))
        const parent = parents[0]
        if (!parent) throw invalid("Parent comment not found")
        if (parent.issueId !== input.issueId) {
          throw invalid("Parent comment belongs to another issue")
        }
        if (parent.parentId !== null) {
          throw invalid("Replies cannot nest more than one level")
        }
      }
      const [row] = await db
        .insert(comment)
        .values({
          issueId: input.issueId,
          authorId: input.authorId,
          body,
          parentId,
          createdAt: new Date(),
        })
        .returning()
      return toComment(row)
    },

    async getComment(commentId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(comment)
        .where(eq(comment.id, commentId))
      return rows[0] ? toComment(rows[0]) : null
    },

    async updateComment(commentId, body) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(comment)
        .where(eq(comment.id, commentId))
      const row = rows[0]
      if (!row) throw notFound("Comment not found")
      if (row.deletedAt !== null) {
        throw invalid("Cannot edit a deleted comment")
      }
      const trimmed = body.trim()
      if (!trimmed) throw invalid("Comment body is required")
      const [updated] = await db
        .update(comment)
        .set({ body: trimmed, editedAt: new Date() })
        .where(eq(comment.id, commentId))
        .returning()
      return toComment(updated)
    },

    async softDeleteComment(commentId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(comment)
        .where(eq(comment.id, commentId))
      const row = rows[0]
      if (!row) throw notFound("Comment not found")
      if (row.deletedAt !== null) return toComment(row)
      const [updated] = await db
        .update(comment)
        .set({ body: "", deletedAt: new Date() })
        .where(eq(comment.id, commentId))
        .returning()
      return toComment(updated)
    },

    async listComments(issueId, opts) {
      const db = resolveDb()
      const limit = pageLimit(opts?.limit, 20, 50)
      const cursor = decodeCursor(opts?.before)
      const conditions = [eq(comment.issueId, issueId)]
      if (cursor) {
        const at = new Date(cursor.createdAt)
        conditions.push(
          or(
            lt(comment.createdAt, at),
            and(eq(comment.createdAt, at), lt(comment.id, cursor.id))
          ) as NonNullable<ReturnType<typeof or>>
        )
      }
      const rows = await db
        .select()
        .from(comment)
        .where(and(...conditions))
        .orderBy(desc(comment.createdAt), desc(comment.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit).map(toComment)
      const last = page[page.length - 1]
      return {
        comments: page,
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      }
    },

    async appendActivity(issueId, input) {
      const db = resolveDb()
      const issueRows = await db
        .select({ id: issue.id })
        .from(issue)
        .where(eq(issue.id, issueId))
      if (!issueRows[0]) throw notFound("Issue not found")
      return insertActivity(
        db,
        issueId,
        input.actor,
        input.type,
        input.summary,
        input.payload ?? {},
        new Date()
      )
    },

    async listActivity(issueId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(activityEvent)
        .where(eq(activityEvent.issueId, issueId))
        .orderBy(asc(activityEvent.createdAt), asc(activityEvent.id))
      return rows.map(toActivityEvent)
    },

    async listTimeline(issueId, opts) {
      const db = resolveDb()
      const limit = pageLimit(opts?.limit, 20, 50)
      const cursor = decodeCursor(opts?.before)
      const commentConditions = [eq(comment.issueId, issueId)]
      const eventConditions = [eq(activityEvent.issueId, issueId)]
      if (cursor) {
        const at = new Date(cursor.createdAt)
        commentConditions.push(
          or(
            lt(comment.createdAt, at),
            and(eq(comment.createdAt, at), lt(comment.id, cursor.id))
          ) as NonNullable<ReturnType<typeof or>>
        )
        eventConditions.push(
          or(
            lt(activityEvent.createdAt, at),
            and(
              eq(activityEvent.createdAt, at),
              lt(activityEvent.id, cursor.id)
            )
          ) as NonNullable<ReturnType<typeof or>>
        )
      }
      // Fetch one extra per side, then let the shared merge decide the page.
      const [commentRows, eventRows] = await Promise.all([
        db
          .select()
          .from(comment)
          .where(and(...commentConditions))
          .orderBy(desc(comment.createdAt), desc(comment.id))
          .limit(limit + 1),
        db
          .select()
          .from(activityEvent)
          .where(and(...eventConditions))
          .orderBy(desc(activityEvent.createdAt), desc(activityEvent.id))
          .limit(limit + 1),
      ])
      return mergeTimeline(
        commentRows.map(toComment),
        eventRows.map(toActivityEvent),
        limit
      )
    },

    async addWatcher(issueId, userId) {
      const db = resolveDb()
      const issueRows = await db
        .select({ id: issue.id })
        .from(issue)
        .where(eq(issue.id, issueId))
      if (!issueRows[0]) throw notFound("Issue not found")
      await db
        .insert(issueWatcher)
        .values({ issueId, userId, createdAt: new Date() })
        .onConflictDoNothing()
    },

    async removeWatcher(issueId, userId) {
      const db = resolveDb()
      await db
        .delete(issueWatcher)
        .where(
          and(
            eq(issueWatcher.issueId, issueId),
            eq(issueWatcher.userId, userId)
          )
        )
    },

    async isWatching(issueId, userId) {
      const db = resolveDb()
      const rows = await db
        .select({ issueId: issueWatcher.issueId })
        .from(issueWatcher)
        .where(
          and(
            eq(issueWatcher.issueId, issueId),
            eq(issueWatcher.userId, userId)
          )
        )
      return rows.length > 0
    },

    async listWatcherIds(issueId) {
      const db = resolveDb()
      const rows = await db
        .select({ userId: issueWatcher.userId })
        .from(issueWatcher)
        .where(eq(issueWatcher.issueId, issueId))
        .orderBy(asc(issueWatcher.createdAt), asc(issueWatcher.userId))
      return rows.map((row) => row.userId)
    },

    async createNotification(input) {
      const db = resolveDb()
      const [row] = await db
        .insert(notificationTable)
        .values({
          userId: input.userId,
          issueId: input.issueId,
          type: input.type,
          actorType: input.actorType,
          actorId: input.actorId,
          payload: input.payload,
          createdAt: new Date(),
        })
        .returning()
      return toNotification(row)
    },

    async listNotifications(userId, opts) {
      const db = resolveDb()
      const limit = pageLimit(opts.limit, 30, 100)
      const cursor = decodeCursor(opts.before)
      const conditions = [eq(notificationTable.userId, userId)]
      if (opts.filter === "unread") {
        conditions.push(isNull(notificationTable.readAt))
      }
      if (cursor) {
        const at = new Date(cursor.createdAt)
        conditions.push(
          or(
            lt(notificationTable.createdAt, at),
            and(
              eq(notificationTable.createdAt, at),
              lt(notificationTable.id, cursor.id)
            )
          ) as NonNullable<ReturnType<typeof or>>
        )
      }
      const rows = await db
        .select()
        .from(notificationTable)
        .where(and(...conditions))
        .orderBy(desc(notificationTable.createdAt), desc(notificationTable.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit).map(toNotification)
      const last = page[page.length - 1]
      return {
        notifications: page,
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      }
    },

    async markNotificationRead(id, userId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(notificationTable)
        .where(eq(notificationTable.id, id))
      const row = rows[0]
      // Never expose another user's row: ownership failures are a 404.
      if (!row || row.userId !== userId) return null
      if (row.readAt !== null) return toNotification(row)
      const [updated] = await db
        .update(notificationTable)
        .set({ readAt: new Date() })
        .where(eq(notificationTable.id, id))
        .returning()
      return toNotification(updated)
    },

    async markAllNotificationsRead(userId) {
      const db = resolveDb()
      const rows = await db
        .update(notificationTable)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notificationTable.userId, userId),
            isNull(notificationTable.readAt)
          )
        )
        .returning({ id: notificationTable.id })
      return rows.length
    },

    async unreadNotificationCount(userId) {
      const db = resolveDb()
      const rows = await db
        .select({ id: notificationTable.id })
        .from(notificationTable)
        .where(
          and(
            eq(notificationTable.userId, userId),
            isNull(notificationTable.readAt)
          )
        )
      return rows.length
    },

    async purgeReadNotifications(olderThan) {
      const db = resolveDb()
      const rows = await db
        .delete(notificationTable)
        .where(
          and(
            isNotNull(notificationTable.readAt),
            lt(notificationTable.createdAt, new Date(olderThan))
          )
        )
        .returning({ id: notificationTable.id })
      return rows.length
    },

    async getNotificationSettings(userId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, userId))
      const row = rows[0]
      return {
        userId,
        emailMode: (row?.emailMode as EmailMode | undefined) ?? "digest",
      }
    },

    async setNotificationSettings(userId, emailMode) {
      const db = resolveDb()
      await db
        .insert(userNotificationSettings)
        .values({ userId, emailMode, createdAt: new Date() })
        .onConflictDoUpdate({
          target: userNotificationSettings.userId,
          set: { emailMode },
        })
      return { userId, emailMode }
    },

    async listDigestGroups(cutoff) {
      const db = resolveDb()
      const rows = await db
        .select({ notification: notificationTable, email: user.email })
        .from(notificationTable)
        .innerJoin(user, eq(user.id, notificationTable.userId))
        // LEFT JOIN: a user without a settings row uses the default digest.
        .leftJoin(
          userNotificationSettings,
          eq(userNotificationSettings.userId, notificationTable.userId)
        )
        .where(
          and(
            isNull(notificationTable.readAt),
            isNull(notificationTable.emailedAt),
            lt(notificationTable.createdAt, new Date(cutoff)),
            or(
              isNull(userNotificationSettings.emailMode),
              eq(userNotificationSettings.emailMode, "digest")
            )
          )
        )
        .orderBy(asc(notificationTable.createdAt), asc(notificationTable.id))
      const grouped = new Map<
        string,
        { email: string; notifications: Notification[] }
      >()
      for (const row of rows) {
        // Skip members the auth user join cannot email.
        if (!row.email) continue
        const group = grouped.get(row.notification.userId) ?? {
          email: row.email,
          notifications: [],
        }
        group.notifications.push(toNotification(row.notification))
        grouped.set(row.notification.userId, group)
      }
      return [...grouped.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([userId, group]) => ({ userId, ...group }))
    },

    async markNotificationsEmailed(ids, at) {
      if (ids.length === 0) return
      const db = resolveDb()
      await db
        .update(notificationTable)
        .set({ emailedAt: new Date(at) })
        .where(inArray(notificationTable.id, ids))
    },

    async listMyIssues(userId, tab) {
      const db = resolveDb()
      const memberships = await db
        .select({ workspaceId: workspaceMember.workspaceId })
        .from(workspaceMember)
        .where(eq(workspaceMember.userId, userId))
      const grants = await db
        .select({ projectId: projectViewer.projectId })
        .from(projectViewer)
        .where(eq(projectViewer.userId, userId))
      const workspaceIds = [
        ...new Set(memberships.map((row) => row.workspaceId)),
      ]
      const projectRows =
        workspaceIds.length === 0
          ? []
          : await db
              .select({ id: project.id })
              .from(project)
              .where(inArray(project.workspaceId, workspaceIds))
      // Viewer grants add exactly those projects, not their whole workspace.
      const projectIds = [
        ...new Set([
          ...projectRows.map((row) => row.id),
          ...grants.map((row) => row.projectId),
        ]),
      ]
      if (projectIds.length === 0) return []
      const scoped = inArray(issue.projectId, projectIds)
      if (tab === "watched") {
        const rows = await db
          .select({ issue })
          .from(issue)
          .innerJoin(
            issueWatcher,
            and(
              eq(issueWatcher.issueId, issue.id),
              eq(issueWatcher.userId, userId)
            )
          )
          .where(scoped)
          .orderBy(desc(issue.updatedAt), asc(issue.id))
        return rows.map((row) => toIssue(row.issue))
      }
      const condition =
        tab === "assigned"
          ? eq(issue.assigneeId, userId)
          : eq(issue.createdBy, userId)
      const rows = await db
        .select()
        .from(issue)
        .where(and(scoped, condition))
        .orderBy(desc(issue.updatedAt), asc(issue.id))
      return rows.map(toIssue)
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
    expiresAt: row.expiresAt.toISOString(),
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
    createdBy: row.createdBy,
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
