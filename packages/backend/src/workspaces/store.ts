/** Workspace roles per GLOSSARY.md Member vocabulary. */
export const WORKSPACE_ROLES = ["Owner", "Admin", "Member"] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export interface Workspace {
  id: string
  name: string
  createdBy: string
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole | "Viewer"
}

export interface Membership {
  workspaceId: string
  userId: string
  role: WorkspaceRole
}

export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  key: string
  /** Mandatory project mark: lucide icon name, colored by `color`. */
  icon: string
  /** Icon display color (hex). */
  color: string
}

/**
 * Curated lucide icon names a project may use. The default is the
 * file/folder mark; the create form offers this list as its selector.
 */
export const PROJECT_ICONS = [
  "Folder",
  "File",
  "Rocket",
  "Globe",
  "Star",
  "Zap",
  "Target",
  "Layers",
  "Box",
  "Compass",
  "Flag",
  "Heart",
] as const

export type ProjectIcon = (typeof PROJECT_ICONS)[number]

/** File/folder default every project starts with unless one is picked. */
export const DEFAULT_PROJECT_ICON: ProjectIcon = "Folder"

/** Neutral icon color when none is picked. */
export const DEFAULT_PROJECT_COLOR = "#94a3b8"

export function isValidProjectIcon(icon: string): boolean {
  return (PROJECT_ICONS as readonly string[]).includes(icon)
}

export function isValidProjectColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color)
}

/** Status Category buckets per GLOSSARY.md, in roster order (ADR-0001). */
export const STATUS_CATEGORIES = [
  "Backlog",
  "Unstarted",
  "In Progress",
  "Completed",
  "Canceled",
  "Duplicate",
] as const

export type StatusCategory = (typeof STATUS_CATEGORIES)[number]

/**
 * Default Status roster every new Project opens with, in Kanban order
 * (ADR-0001). `createProject` seeds these before any sample Issue.
 */
export const DEFAULT_STATUS_ROSTER: readonly {
  name: string
  category: StatusCategory
  color: string
}[] = [
  { name: "Backlog", category: "Backlog", color: "#bec2c8" },
  { name: "Todo", category: "Unstarted", color: "#e2e2e2" },
  { name: "In Progress", category: "In Progress", color: "#f2c94c" },
  { name: "In Review", category: "In Progress", color: "#0f783c" },
  { name: "Done", category: "Completed", color: "#5e6ad2" },
  { name: "Canceled", category: "Canceled", color: "#95a2b3" },
  { name: "Duplicate", category: "Duplicate", color: "#95a2b3" },
]

/**
 * Sample Issues every new Project opens with (ADR-0001 seeding). Titles and
 * statuses are verbatim; they are created through the normal issue path, so
 * they consume the project sequence and the first real Issue is `KEY-7`.
 */
export const DEFAULT_SEED_ISSUES: readonly {
  title: string
  statusName: string
}[] = [
  { title: "Tour the List, Table, and Kanban views", statusName: "Todo" },
  {
    title: "Invite your teammates to this workspace",
    statusName: "Backlog",
  },
  {
    title: "Define statuses that match your workflow",
    statusName: "Backlog",
  },
  { title: "Break a large issue into subtasks", statusName: "Todo" },
  {
    title: "Link a pull request by its issue identifier",
    statusName: "In Progress",
  },
  { title: "Archive work you no longer need", statusName: "In Progress" },
]

/**
 * Persisted fields of one seeded Issue, the single description both stores
 * build from so the memory and Drizzle seeding waterfalls cannot drift.
 * Matches what `CreateIssue` would store: the title verbatim, unassigned,
 * no due date, no labels, no parent, and priority None.
 */
export interface SeedIssueFields {
  number: number
  keyPrefix: string
  identifier: string
  title: string
  description: null
  statusId: string
  priority: "None"
  assigneeId: null
  dueDate: null
  archived: false
  labels: string[]
  parentId: null
}

/**
 * The seeded-Issue field set for one `DEFAULT_SEED_ISSUES` entry: given the
 * Project Key, the issue number, the resolved status id and the seed, both
 * stores insert these identical fields.
 */
export function seedIssueFields(
  projectKey: string,
  number: number,
  statusId: string,
  seed: { title: string }
): SeedIssueFields {
  return {
    number,
    keyPrefix: projectKey,
    identifier: `${projectKey}-${number}`,
    title: seed.title,
    description: null,
    statusId,
    priority: "None",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
    parentId: null,
  }
}

/**
 * Categories that count as done everywhere: list grouping, progress math, and
 * the completion guardrail (ADR-0001). `archived` stays orthogonal — it means
 * hidden, not canceled.
 */
export const TERMINAL_STATUS_CATEGORIES = [
  "Completed",
  "Canceled",
  "Duplicate",
] as const satisfies readonly StatusCategory[]

/** Whether a status category is one of the terminal three (done) buckets. */
export function isTerminalStatusCategory(
  category: StatusCategory | undefined
): boolean {
  return (
    category !== undefined &&
    TERMINAL_STATUS_CATEGORIES.some((terminal) => terminal === category)
  )
}

/** Priority urgency per GLOSSARY.md. */
export const PRIORITIES = ["Urgent", "High", "Medium", "Low", "None"] as const

export type Priority = (typeof PRIORITIES)[number]

export interface Status {
  id: string
  projectId: string
  name: string
  category: StatusCategory
  color: string
  position: number
}

export interface Issue {
  id: string
  projectId: string
  number: number
  /** Original Project Key prefix, frozen at creation (identifier stability). */
  keyPrefix: string
  /** Human identifier KEY-N, immutable across Project moves. */
  identifier: string
  title: string
  description: string | null
  statusId: string
  priority: Priority
  /** Single assignee user id, null when unassigned. */
  assigneeId: string | null
  dueDate: string | null
  archived: boolean
  /** Free-form Labels per GLOSSARY.md (workspace-shared registry deferred). */
  labels: string[]
  /**
   * T5 Subtask link: parent Issue row id, null for top-level Issues.
   * One level only — a Subtask cannot itself have subtasks, and an Issue
   * with subtasks cannot become a subtask.
   */
  parentId: string | null
}

export interface CreateIssueInput {
  title: string
  description?: string | null
  statusId: string
  priority?: Priority
  assigneeId?: string | null
  dueDate?: string | null
  labels?: string[]
  parentId?: string | null
}

export interface UpdateIssueInput {
  title?: string
  description?: string | null
  statusId?: string
  priority?: Priority
  assigneeId?: string | null
  dueDate?: string | null
  archived?: boolean
  labels?: string[]
  /** Move target: identifier, keyPrefix and number stay frozen. */
  projectId?: string
  /** Relink (id) or unlink (null) the Subtask parent. */
  parentId?: string | null
}

export interface IssueFilters {
  statusIds?: string[]
  priorities?: Priority[]
  assigneeId?: string | null
  labels?: string[]
  archived?: boolean
  text?: string
}

/** Workspace-shared Label per GLOSSARY.md, with a display color. */
export interface Label {
  id: string
  workspaceId: string
  name: string
  color: string
}

export interface CreateLabelInput {
  name: string
  color?: string
}

export interface UpdateLabelInput {
  name?: string
  color?: string
}

/** Default swatch for registry rows auto-created from free-form names. */
export const DEFAULT_LABEL_COLOR = "#94a3b8"

const LABEL_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function isValidLabelColor(color: string): boolean {
  return LABEL_COLOR_PATTERN.test(color)
}

/** Status colors use the same hex shape as label colors. */
export const DEFAULT_STATUS_COLOR = "#94a3b8"

export function isValidStatusColor(color: string): boolean {
  return LABEL_COLOR_PATTERN.test(color)
}

export function defaultStatusColorForName(name: string): string {
  const entry = DEFAULT_STATUS_ROSTER.find((item) => item.name === name)
  return entry?.color ?? DEFAULT_STATUS_COLOR
}

/**
 * T5 label-name normalization shared by both stores: trim, drop blanks,
 * dedupe case-insensitively keeping first-seen casing and order.
 */
export function normalizeLabelNames(names: string[]): string[] {
  const seen = new Map<string, string>()
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()]
}

/**
 * Persistence boundary for workspace tenancy. The Hono routes depend only on
 * this interface: contract tests inject the memory store, production injects
 * the Drizzle store over Supabase Postgres.
 */
export interface WorkspaceStore {
  createWorkspace(ownerId: string, name: string): Promise<Workspace>
  listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]>
  getMembership(workspaceId: string, userId: string): Promise<Membership | null>
  listMembers(workspaceId: string): Promise<Membership[]>
  createInvitation(input: {
    workspaceId: string
    email: string
    role: WorkspaceRole
    invitedBy: string
  }): Promise<Invitation>
  listInvitationsForEmail(email: string): Promise<Invitation[]>
  acceptInvitation(invitationId: string, userId: string): Promise<Membership>
  /**
   * Creates the Project already seeded (ADR-0001), always, in one atomic
   * step: the 7 default statuses in roster order, then the 6 sample Issues
   * through the normal issue path as `KEY-1`…`KEY-6`. A failure anywhere
   * fails the whole request, so no half-seeded Project is ever left behind.
   * The first user-created Issue is therefore `KEY-7`.
   */
  createProject(
    workspaceId: string,
    input: { name: string; key: string; icon?: string; color?: string }
  ): Promise<Project>
  listProjects(workspaceId: string): Promise<Project[]>
  getProject(projectId: string): Promise<Project | null>
  updateProject(
    projectId: string,
    input: { name?: string; key?: string; icon?: string; color?: string }
  ): Promise<Project>
  /** Next issue number for the project; 1 until the first issue. */
  getNextIssueNumber(projectId: string): Promise<number>
  /** True once the project holds at least one issue (key edits lock). */
  hasIssues(projectId: string): Promise<boolean>
  createStatus(
    projectId: string,
    input: { name: string; category: StatusCategory; color?: string }
  ): Promise<Status>
  /** Statuses in Kanban order (ascending position). */
  listStatuses(projectId: string): Promise<Status[]>
  getStatus(statusId: string): Promise<Status | null>
  updateStatus(
    statusId: string,
    input: {
      name?: string
      category?: StatusCategory
      color?: string
      position?: number
    }
  ): Promise<Status>
  deleteStatus(statusId: string): Promise<void>
  createIssue(projectId: string, input: CreateIssueInput): Promise<Issue>
  listIssues(projectId: string, filters?: IssueFilters): Promise<Issue[]>
  /** Resolve by human identifier (KEY-N, case-insensitive) or row id. */
  getIssue(ref: string): Promise<Issue | null>
  updateIssue(ref: string, input: UpdateIssueInput): Promise<Issue>
  /**
   * T5 hard delete (Owner/Admin only at the route layer). Subtasks of the
   * deleted issue become top-level; label links drop with the row.
   */
  deleteIssue(ref: string): Promise<void>
  /**
   * T5 direct subtasks of a parent Issue, in number order (archived
   * included; callers decide what counts as open).
   */
  listSubtasks(parentId: string): Promise<Issue[]>
  /**
   * Workspace-shared Label registry (T5). Any workspace membership
   * (Owner/Admin/Member) may manage labels; names are unique per workspace,
   * compared case-insensitively.
   */
  createLabel(workspaceId: string, input: CreateLabelInput): Promise<Label>
  /** Labels in name order, reusable across the workspace's projects. */
  listLabels(workspaceId: string): Promise<Label[]>
  updateLabel(labelId: string, input: UpdateLabelInput): Promise<Label>
  deleteLabel(labelId: string): Promise<void>
  /**
   * Minimal issue-presence probe: consumes the next sequence number for the
   * status. T2 contract tests seed through it; T3's real issue creation
   * consumes the same sequence. Production routes never call it directly.
   */
  recordIssue(projectId: string, statusId: string): Promise<{ number: number }>
  countIssuesInStatus(statusId: string): Promise<number>
  addProjectViewer(projectId: string, userId: string): Promise<void>
  isProjectViewer(projectId: string, userId: string): Promise<boolean>
  hasProjectGrantInWorkspace(
    workspaceId: string,
    userId: string
  ): Promise<boolean>
}

/**
 * Test-only fault injection for the `createProject` seeding waterfall. The
 * contract tests use it to prove the waterfall is atomic; production callers
 * pass nothing.
 */
export interface MemoryWorkspaceStoreOptions {
  /**
   * Called as each seeded row is staged, before anything is committed.
   * Throwing aborts the whole waterfall with no orphan statuses or issues.
   */
  onSeedStep?: (step: {
    kind: "status" | "issue"
    index: number
    projectId: string
  }) => void
}

export function createMemoryWorkspaceStore(
  options: MemoryWorkspaceStoreOptions = {}
): WorkspaceStore {
  const workspaces = new Map<string, Workspace>()
  const members = new Map<string, Membership>()
  const invitations = new Map<string, Invitation>()
  const projects = new Map<string, Project>()
  const projectViewers = new Set<string>()
  const sequences = new Map<string, number>()
  const statuses = new Map<string, Status>()
  const issues = new Map<string, Issue>()
  const issueRefs: { id: string; projectId: string; statusId: string }[] = []
  /** T5 registry rows by id; issue links by issue id. */
  const labels = new Map<string, Label>()
  const issueLinks = new Map<string, Set<string>>()

  function findLabel(workspaceId: string, name: string): Label | undefined {
    const key = name.toLowerCase()
    for (const label of labels.values()) {
      if (
        label.workspaceId === workspaceId &&
        label.name.toLowerCase() === key
      ) {
        return label
      }
    }
    return undefined
  }

  /** Resolve names to registry rows, auto-creating missing ones. */
  function ensureLabelRows(workspaceId: string, names: string[]): Label[] {
    return normalizeLabelNames(names).map((name) => {
      const existing = findLabel(workspaceId, name)
      if (existing) return existing
      const row: Label = {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        color: DEFAULT_LABEL_COLOR,
      }
      labels.set(row.id, row)
      return row
    })
  }

  function relinkIssue(issueId: string, rows: Label[]): string[] {
    issueLinks.set(issueId, new Set(rows.map((row) => row.id)))
    return rows.map((row) => row.name)
  }

  function childCount(issueId: string): number {
    let count = 0
    for (const issue of issues.values()) {
      if (issue.parentId === issueId) count += 1
    }
    return count
  }

  /**
   * T5 one-level rule: a subtask cannot itself have subtasks, and an issue
   * that already has subtasks cannot become a subtask. `parentId` is a row
   * id; unknown ids are invalid (400), matching the T3 foreign-status rule.
   */
  function resolveParentId(
    projectId: string,
    selfId: string | null,
    parentId: string | null | undefined
  ): string | null | undefined {
    if (parentId === undefined) return undefined
    if (parentId === null) return null
    const parent = issues.get(parentId)
    if (!parent) throw invalid("Parent issue not found")
    if (parent.projectId !== projectId) {
      throw invalid("A subtask must live in the same project as its parent")
    }
    if (selfId !== null && parent.id === selfId) {
      throw invalid("An issue cannot be its own parent")
    }
    if (parent.parentId) {
      throw invalid("Subtasks cannot nest more than one level")
    }
    if (selfId !== null && childCount(selfId) > 0) {
      throw invalid("An issue with subtasks cannot become a subtask")
    }
    return parent.id
  }

  const memberKey = (workspaceId: string, userId: string) =>
    `${workspaceId}:${userId}`

  function locked(message: string): Error {
    const error = new Error(message)
    ;(error as { code?: string }).code = "locked"
    return error
  }

  function invalid(message: string): Error {
    const error = new Error(message)
    ;(error as { code?: string }).code = "invalid"
    return error
  }

  function normalizeDueDate(dueDate: string | null | undefined): string | null {
    if (dueDate === undefined || dueDate === null) return null
    const parsed = new Date(dueDate)
    if (Number.isNaN(parsed.getTime())) throw invalid("Invalid due date")
    return parsed.toISOString()
  }

  async function checkedAssignee(
    getMember: (userId: string) => boolean,
    assigneeId: string | null | undefined
  ): Promise<string | null> {
    if (assigneeId === undefined || assigneeId === null) return null
    if (!getMember(assigneeId)) throw invalid("Assignee is not a member")
    return assigneeId
  }

  /**
   * Shape one Issue row the way CreateIssue always does. The `createProject`
   * waterfall seeds through `seedIssueFields`, which mirrors these fields, so
   * a seeded Issue is indistinguishable from a user-created one.
   */
  function newIssueRow(
    project: Project,
    number: number,
    input: CreateIssueInput
  ): Issue {
    return {
      id: crypto.randomUUID(),
      projectId: project.id,
      number,
      keyPrefix: project.key,
      identifier: `${project.key}-${number}`,
      title: input.title.trim(),
      description: input.description ?? null,
      statusId: input.statusId,
      priority: input.priority ?? "Medium",
      assigneeId: input.assigneeId ?? null,
      dueDate: normalizeDueDate(input.dueDate),
      archived: false,
      labels: normalizeLabelNames(input.labels ?? []),
      parentId: input.parentId ?? null,
    }
  }

  return {
    async createWorkspace(ownerId, name) {
      const workspace = { id: crypto.randomUUID(), name, createdBy: ownerId }
      workspaces.set(workspace.id, workspace)
      members.set(memberKey(workspace.id, ownerId), {
        workspaceId: workspace.id,
        userId: ownerId,
        role: "Owner",
      })
      return workspace
    },

    async listWorkspacesForUser(userId) {
      const visible: WorkspaceWithRole[] = []
      for (const workspace of workspaces.values()) {
        const membership = members.get(memberKey(workspace.id, userId))
        if (membership) {
          visible.push({ ...workspace, role: membership.role })
          continue
        }
        let viewer = false
        for (const project of projects.values()) {
          if (
            project.workspaceId === workspace.id &&
            projectViewers.has(`${project.id}:${userId}`)
          ) {
            viewer = true
            break
          }
        }
        if (viewer) visible.push({ ...workspace, role: "Viewer" })
      }
      return visible
    },

    async getMembership(workspaceId, userId) {
      return members.get(memberKey(workspaceId, userId)) ?? null
    },

    async listMembers(workspaceId) {
      return [...members.values()].filter((m) => m.workspaceId === workspaceId)
    },

    async createInvitation(input) {
      const email = input.email.toLowerCase()
      const existing = [...invitations.values()].find(
        (i) => i.workspaceId === input.workspaceId && i.email === email
      )
      if (existing) {
        const error = new Error("Invitation already exists")
        ;(error as { code?: string }).code = "conflict"
        throw error
      }
      const invitation: Invitation = {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        email,
        role: input.role,
        invitedBy: input.invitedBy,
      }
      invitations.set(invitation.id, invitation)
      return invitation
    },

    async listInvitationsForEmail(email) {
      const lower = email.toLowerCase()
      return [...invitations.values()].filter((i) => i.email === lower)
    },

    async acceptInvitation(invitationId, userId) {
      const invitation = invitations.get(invitationId)
      if (!invitation) {
        const error = new Error("Invitation not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const current = members.get(memberKey(invitation.workspaceId, userId))
      if (current) {
        invitations.delete(invitationId)
        return current
      }
      const membership: Membership = {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      }
      members.set(memberKey(invitation.workspaceId, userId), membership)
      invitations.delete(invitationId)
      return membership
    },

    async createProject(workspaceId, input) {
      const key = input.key.toUpperCase()
      const duplicate = [...projects.values()].some(
        (p) => p.workspaceId === workspaceId && p.key === key
      )
      if (duplicate) {
        const error = new Error("Project key already exists")
        ;(error as { code?: string }).code = "conflict"
        throw error
      }
      const icon = input.icon ?? DEFAULT_PROJECT_ICON
      if (!isValidProjectIcon(icon)) throw invalid("Invalid project icon")
      const color = input.color ?? DEFAULT_PROJECT_COLOR
      if (!isValidProjectColor(color)) throw invalid("Invalid project color")
      const project: Project = {
        id: crypto.randomUUID(),
        workspaceId,
        name: input.name,
        key,
        icon,
        color,
      }
      // ADR-0001 seeding: build the whole waterfall against the new project
      // in staging and commit only once every step succeeded, so a failure
      // anywhere leaves no orphan statuses or issues behind.
      const stagedStatuses: Status[] = []
      for (const [position, entry] of DEFAULT_STATUS_ROSTER.entries()) {
        options.onSeedStep?.({
          kind: "status",
          index: position,
          projectId: project.id,
        })
        stagedStatuses.push({
          id: crypto.randomUUID(),
          projectId: project.id,
          name: entry.name,
          category: entry.category,
          color: entry.color,
          position,
        })
      }
      const statusIdByName = new Map(
        stagedStatuses.map((s) => [s.name, s.id] as const)
      )
      const stagedIssues: Issue[] = []
      let nextNumber = 1
      for (const [index, seed] of DEFAULT_SEED_ISSUES.entries()) {
        options.onSeedStep?.({ kind: "issue", index, projectId: project.id })
        const statusId = statusIdByName.get(seed.statusName)
        if (!statusId) {
          throw invalid(`Seed status ${seed.statusName} is missing`)
        }
        // Same persisted fields as CreateIssue: consumes the sequence and
        // KEY-N identifiers, unassigned with no due date and priority None.
        stagedIssues.push({
          id: crypto.randomUUID(),
          projectId: project.id,
          ...seedIssueFields(project.key, nextNumber, statusId, seed),
        })
        nextNumber += 1
      }
      projects.set(project.id, project)
      sequences.set(project.id, nextNumber)
      for (const staged of stagedStatuses) statuses.set(staged.id, staged)
      for (const staged of stagedIssues) issues.set(staged.id, staged)
      return project
    },

    async updateProject(projectId, input) {
      const project = projects.get(projectId)
      if (!project) {
        const error = new Error("Project not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      if (input.key !== undefined) {
        const key = input.key.toUpperCase()
        if (key !== project.key) {
          if (await this.hasIssues(projectId)) {
            throw locked("Project key is locked once issues exist")
          }
          const duplicate = [...projects.values()].some(
            (p) =>
              p.workspaceId === project.workspaceId &&
              p.key === key &&
              p.id !== projectId
          )
          if (duplicate) {
            const error = new Error("Project key already exists")
            ;(error as { code?: string }).code = "conflict"
            throw error
          }
          project.key = key
        }
      }
      if (input.name !== undefined) project.name = input.name
      if (input.icon !== undefined) {
        if (!isValidProjectIcon(input.icon)) {
          throw invalid("Invalid project icon")
        }
        project.icon = input.icon
      }
      if (input.color !== undefined) {
        if (!isValidProjectColor(input.color)) {
          throw invalid("Invalid project color")
        }
        project.color = input.color
      }
      return { ...project }
    },

    async getNextIssueNumber(projectId) {
      const next = sequences.get(projectId)
      if (next === undefined) {
        const error = new Error("Project not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      return next
    },

    async hasIssues(projectId) {
      if (issueRefs.some((r) => r.projectId === projectId)) return true
      for (const issue of issues.values()) {
        if (issue.projectId === projectId) return true
      }
      return false
    },

    async createStatus(projectId, input) {
      if (!projects.has(projectId)) {
        const error = new Error("Project not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const duplicate = [...statuses.values()].some(
        (s) => s.projectId === projectId && s.name === input.name
      )
      if (duplicate) {
        const error = new Error("Status already exists")
        ;(error as { code?: string }).code = "conflict"
        throw error
      }
      if (input.color !== undefined && !isValidStatusColor(input.color)) {
        throw invalid("Invalid status color")
      }
      const position = [...statuses.values()].filter(
        (s) => s.projectId === projectId
      ).length
      const status: Status = {
        id: crypto.randomUUID(),
        projectId,
        name: input.name,
        category: input.category,
        color: input.color ?? defaultStatusColorForName(input.name),
        position,
      }
      statuses.set(status.id, status)
      return { ...status }
    },

    async listStatuses(projectId) {
      return [...statuses.values()]
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ ...s }))
    },

    async getStatus(statusId) {
      const status = statuses.get(statusId)
      return status ? { ...status } : null
    },

    async updateStatus(statusId, input) {
      const status = statuses.get(statusId)
      if (!status) {
        const error = new Error("Status not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      if (input.name !== undefined && input.name !== status.name) {
        const duplicate = [...statuses.values()].some(
          (s) =>
            s.projectId === status.projectId &&
            s.name === input.name &&
            s.id !== statusId
        )
        if (duplicate) {
          const error = new Error("Status already exists")
          ;(error as { code?: string }).code = "conflict"
          throw error
        }
        status.name = input.name
      }
      if (input.category !== undefined) status.category = input.category
      if (input.color !== undefined) {
        if (!isValidStatusColor(input.color))
          throw invalid("Invalid status color")
        status.color = input.color
      }
      if (input.position !== undefined) {
        const ordered = [...statuses.values()]
          .filter((s) => s.projectId === status.projectId)
          .sort((a, b) => a.position - b.position)
          .filter((s) => s.id !== statusId)
        const at = Math.max(0, Math.min(input.position, ordered.length))
        ordered.splice(at, 0, status)
        ordered.forEach((s, index) => {
          s.position = index
        })
      }
      return { ...status }
    },

    async deleteStatus(statusId) {
      const status = statuses.get(statusId)
      if (!status) {
        const error = new Error("Status not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      if ((await this.countIssuesInStatus(statusId)) > 0) {
        throw locked("Cannot delete a status that holds issues")
      }
      statuses.delete(statusId)
      ;[...statuses.values()]
        .filter((s) => s.projectId === status.projectId)
        .sort((a, b) => a.position - b.position)
        .forEach((s, index) => {
          s.position = index
        })
    },

    async createIssue(projectId, input: CreateIssueInput): Promise<Issue> {
      const project = projects.get(projectId)
      if (!project) {
        const error = new Error("Project not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const title = input.title.trim()
      if (!title) throw invalid("Invalid title")
      const status = statuses.get(input.statusId)
      if (!status || status.projectId !== projectId) {
        throw invalid("Invalid status")
      }
      const priority: Priority = input.priority ?? "Medium"
      const assigneeId = await checkedAssignee(
        (userId) => members.has(memberKey(project.workspaceId, userId)),
        input.assigneeId
      )
      const dueDate = normalizeDueDate(input.dueDate)
      const number = sequences.get(projectId) ?? 1
      sequences.set(projectId, number + 1)
      const labelRows = ensureLabelRows(project.workspaceId, input.labels ?? [])
      const parentId = resolveParentId(projectId, null, input.parentId) ?? null
      const issue = newIssueRow(project, number, {
        ...input,
        title,
        statusId: status.id,
        priority,
        assigneeId,
        dueDate,
        labels: labelRows.map((row) => row.name),
        parentId,
      })
      issues.set(issue.id, issue)
      relinkIssue(issue.id, labelRows)
      return { ...issue, labels: [...issue.labels] }
    },

    async listIssues(projectId, filters?: IssueFilters): Promise<Issue[]> {
      const statusIds =
        filters?.statusIds !== undefined && filters.statusIds.length > 0
          ? new Set(filters.statusIds)
          : undefined
      const priorities =
        filters?.priorities !== undefined && filters.priorities.length > 0
          ? new Set(filters.priorities)
          : undefined
      const labels =
        filters?.labels !== undefined && filters.labels.length > 0
          ? new Set(filters.labels)
          : undefined
      const text = filters?.text?.toLowerCase()
      const archived = filters?.archived ?? false
      return [...issues.values()]
        .filter((issue) => issue.projectId === projectId)
        .filter((issue) => issue.archived === archived)
        .filter((issue) => !statusIds || statusIds.has(issue.statusId))
        .filter((issue) => !priorities || priorities.has(issue.priority))
        .filter(
          (issue) =>
            filters?.assigneeId === undefined ||
            issue.assigneeId === filters.assigneeId
        )
        .filter(
          (issue) =>
            !labels ||
            [...labels].every((label) => issue.labels.includes(label))
        )
        .filter(
          (issue) =>
            !text ||
            issue.identifier.toLowerCase().includes(text) ||
            issue.title.toLowerCase().includes(text)
        )
        .sort((a, b) => a.number - b.number)
        .map((issue) => ({ ...issue, labels: [...issue.labels] }))
    },

    async getIssue(ref): Promise<Issue | null> {
      const direct = issues.get(ref)
      if (direct) return { ...direct, labels: [...direct.labels] }
      const upper = ref.toUpperCase()
      for (const issue of issues.values()) {
        if (issue.identifier.toUpperCase() === upper) {
          return { ...issue, labels: [...issue.labels] }
        }
      }
      return null
    },

    async updateIssue(ref, input: UpdateIssueInput): Promise<Issue> {
      const issue = issues.get(ref) ?? (await this.getIssue(ref))
      if (!issue) {
        const error = new Error("Issue not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const stored = issues.get(issue.id)
      if (!stored) {
        const error = new Error("Issue not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      let projectId = stored.projectId
      if (
        input.projectId !== undefined &&
        input.projectId !== stored.projectId
      ) {
        const target = projects.get(input.projectId)
        if (!target) {
          const error = new Error("Project not found")
          ;(error as { code?: string }).code = "not_found"
          throw error
        }
        const current = projects.get(stored.projectId)
        if (!current || current.workspaceId !== target.workspaceId) {
          throw invalid("Cannot move an issue to another workspace")
        }
        // Subtask links are same-project only, so linked issues stay put.
        if (stored.parentId || childCount(stored.id) > 0) {
          throw invalid("Cannot move an issue with subtask links")
        }
        projectId = target.id
      }
      const statusTarget = projectId
      if (input.statusId !== undefined) {
        const status = statuses.get(input.statusId)
        if (!status || status.projectId !== statusTarget) {
          throw invalid("Invalid status")
        }
        stored.statusId = status.id
      } else if (projectId !== stored.projectId) {
        const status = statuses.get(stored.statusId)
        if (!status || status.projectId !== projectId) {
          throw invalid("A status in the target project is required")
        }
      }
      if (input.parentId !== undefined) {
        stored.parentId =
          resolveParentId(projectId, stored.id, input.parentId) ?? null
      }
      stored.projectId = projectId
      if (input.title !== undefined) {
        const title = input.title.trim()
        if (!title) throw invalid("Invalid title")
        stored.title = title
      }
      if (input.description !== undefined)
        stored.description = input.description
      if (input.priority !== undefined) stored.priority = input.priority
      if (input.assigneeId !== undefined) {
        const project = projects.get(stored.projectId)
        if (!project) {
          const error = new Error("Project not found")
          ;(error as { code?: string }).code = "not_found"
          throw error
        }
        stored.assigneeId = await checkedAssignee(
          (userId) => members.has(memberKey(project.workspaceId, userId)),
          input.assigneeId
        )
      }
      if (input.dueDate !== undefined)
        stored.dueDate = normalizeDueDate(input.dueDate)
      if (input.archived !== undefined) stored.archived = input.archived
      if (input.labels !== undefined) {
        const project = projects.get(stored.projectId)
        if (!project) {
          const error = new Error("Project not found")
          ;(error as { code?: string }).code = "not_found"
          throw error
        }
        stored.labels = relinkIssue(
          stored.id,
          ensureLabelRows(project.workspaceId, input.labels)
        )
      }
      return { ...stored, labels: [...stored.labels] }
    },

    async createLabel(workspaceId, input) {
      const name = input.name.trim()
      if (!name) throw invalid("Invalid label name")
      const color = input.color ?? DEFAULT_LABEL_COLOR
      if (!isValidLabelColor(color)) throw invalid("Invalid label color")
      const duplicate = [...labels.values()].some(
        (l) =>
          l.workspaceId === workspaceId &&
          l.name.toLowerCase() === name.toLowerCase()
      )
      if (duplicate) {
        const error = new Error("Label already exists")
        ;(error as { code?: string }).code = "conflict"
        throw error
      }
      const label: Label = {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        color,
      }
      labels.set(label.id, label)
      return { ...label }
    },

    async listLabels(workspaceId) {
      return [...labels.values()]
        .filter((l) => l.workspaceId === workspaceId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => ({ ...l }))
    },

    async updateLabel(labelId, input) {
      const label = labels.get(labelId)
      if (!label) {
        const error = new Error("Label not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      let oldName: string | undefined
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (!name) throw invalid("Invalid label name")
        const duplicate = [...labels.values()].some(
          (l) =>
            l.id !== labelId &&
            l.workspaceId === label.workspaceId &&
            l.name.toLowerCase() === name.toLowerCase()
        )
        if (duplicate) {
          const error = new Error("Label already exists")
          ;(error as { code?: string }).code = "conflict"
          throw error
        }
        oldName = label.name
        label.name = name
      }
      if (input.color !== undefined) {
        if (!isValidLabelColor(input.color))
          throw invalid("Invalid label color")
        label.color = input.color
      }
      if (oldName !== undefined && oldName !== label.name) {
        // Rename propagation: linked issues keep the T3 text[] names in sync.
        for (const [issueId, ids] of issueLinks) {
          if (!ids.has(labelId)) continue
          const stored = issues.get(issueId)
          if (stored) {
            stored.labels = stored.labels.map((name) =>
              name === oldName ? label.name : name
            )
          }
        }
      }
      return { ...label }
    },

    async deleteLabel(labelId) {
      const label = labels.get(labelId)
      if (!label) {
        const error = new Error("Label not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const name = label.name
      labels.delete(labelId)
      // Scrub the T3 text[] names on linked issues so filters stay correct.
      for (const [issueId, ids] of issueLinks) {
        if (!ids.delete(labelId)) continue
        const stored = issues.get(issueId)
        if (stored) stored.labels = stored.labels.filter((n) => n !== name)
        if (ids.size === 0) issueLinks.delete(issueId)
      }
    },

    async listSubtasks(parentId) {
      return [...issues.values()]
        .filter((issue) => issue.parentId === parentId)
        .sort((a, b) => a.number - b.number)
        .map((issue) => ({ ...issue, labels: [...issue.labels] }))
    },

    async deleteIssue(ref) {
      const issue = issues.get(ref) ?? (await this.getIssue(ref))
      const stored = issue ? issues.get(issue.id) : undefined
      if (!stored) {
        const error = new Error("Issue not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      issues.delete(stored.id)
      issueLinks.delete(stored.id)
      // Children become top-level instead of disappearing with the parent.
      for (const child of issues.values()) {
        if (child.parentId === stored.id) child.parentId = null
      }
    },

    async recordIssue(projectId, statusId) {
      const project = projects.get(projectId)
      const status = statuses.get(statusId)
      if (!project || !status || status.projectId !== projectId) {
        const error = new Error("Project or status not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const number = sequences.get(projectId) ?? 1
      sequences.set(projectId, number + 1)
      issueRefs.push({ id: crypto.randomUUID(), projectId, statusId })
      return { number }
    },

    async countIssuesInStatus(statusId) {
      const probed = issueRefs.filter((r) => r.statusId === statusId).length
      let stored = 0
      for (const issue of issues.values()) {
        if (issue.statusId === statusId) stored += 1
      }
      return probed + stored
    },

    async listProjects(workspaceId) {
      return [...projects.values()].filter((p) => p.workspaceId === workspaceId)
    },

    async getProject(projectId) {
      return projects.get(projectId) ?? null
    },

    async addProjectViewer(projectId, userId) {
      projectViewers.add(`${projectId}:${userId}`)
    },

    async isProjectViewer(projectId, userId) {
      return projectViewers.has(`${projectId}:${userId}`)
    },

    async hasProjectGrantInWorkspace(workspaceId, userId) {
      for (const project of projects.values()) {
        if (
          project.workspaceId === workspaceId &&
          projectViewers.has(`${project.id}:${userId}`)
        ) {
          return true
        }
      }
      return false
    },
  }
}
