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
}

/** Status Category buckets per GLOSSARY.md. */
export const STATUS_CATEGORIES = ["Todo", "In Progress", "Done"] as const

export type StatusCategory = (typeof STATUS_CATEGORIES)[number]

/** Priority urgency per GLOSSARY.md. */
export const PRIORITIES = ["Urgent", "High", "Medium", "Low", "None"] as const

export type Priority = (typeof PRIORITIES)[number]

export interface Status {
  id: string
  projectId: string
  name: string
  category: StatusCategory
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
}

export interface CreateIssueInput {
  title: string
  description?: string | null
  statusId: string
  priority?: Priority
  assigneeId?: string | null
  dueDate?: string | null
  labels?: string[]
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
}

export interface IssueFilters {
  statusIds?: string[]
  priorities?: Priority[]
  assigneeId?: string | null
  labels?: string[]
  archived?: boolean
  text?: string
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
  createProject(
    workspaceId: string,
    input: { name: string; key: string }
  ): Promise<Project>
  listProjects(workspaceId: string): Promise<Project[]>
  getProject(projectId: string): Promise<Project | null>
  updateProject(
    projectId: string,
    input: { name?: string; key?: string }
  ): Promise<Project>
  /** Next issue number for the project; 1 until the first issue. */
  getNextIssueNumber(projectId: string): Promise<number>
  /** True once the project holds at least one issue (key edits lock). */
  hasIssues(projectId: string): Promise<boolean>
  createStatus(
    projectId: string,
    input: { name: string; category: StatusCategory }
  ): Promise<Status>
  /** Statuses in Kanban order (ascending position). */
  listStatuses(projectId: string): Promise<Status[]>
  getStatus(statusId: string): Promise<Status | null>
  updateStatus(
    statusId: string,
    input: { name?: string; category?: StatusCategory; position?: number }
  ): Promise<Status>
  deleteStatus(statusId: string): Promise<void>
  createIssue(projectId: string, input: CreateIssueInput): Promise<Issue>
  listIssues(projectId: string, filters?: IssueFilters): Promise<Issue[]>
  /** Resolve by human identifier (KEY-N, case-insensitive) or row id. */
  getIssue(ref: string): Promise<Issue | null>
  updateIssue(ref: string, input: UpdateIssueInput): Promise<Issue>
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

export function createMemoryWorkspaceStore(): WorkspaceStore {
  const workspaces = new Map<string, Workspace>()
  const members = new Map<string, Membership>()
  const invitations = new Map<string, Invitation>()
  const projects = new Map<string, Project>()
  const projectViewers = new Set<string>()
  const sequences = new Map<string, number>()
  const statuses = new Map<string, Status>()
  const issues = new Map<string, Issue>()
  const issueRefs: { id: string; projectId: string; statusId: string }[] = []

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
      const project: Project = {
        id: crypto.randomUUID(),
        workspaceId,
        name: input.name,
        key,
      }
      projects.set(project.id, project)
      sequences.set(project.id, 1)
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
      const position = [...statuses.values()].filter(
        (s) => s.projectId === projectId
      ).length
      const status: Status = {
        id: crypto.randomUUID(),
        projectId,
        name: input.name,
        category: input.category,
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
      const issue: Issue = {
        id: crypto.randomUUID(),
        projectId,
        number,
        keyPrefix: project.key,
        identifier: `${project.key}-${number}`,
        title,
        description: input.description ?? null,
        statusId: status.id,
        priority,
        assigneeId,
        dueDate,
        archived: false,
        labels: input.labels ? [...input.labels] : [],
      }
      issues.set(issue.id, issue)
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
            !labels || [...labels].every((label) => issue.labels.includes(label))
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
      if (input.projectId !== undefined && input.projectId !== stored.projectId) {
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
      stored.projectId = projectId
      if (input.title !== undefined) {
        const title = input.title.trim()
        if (!title) throw invalid("Invalid title")
        stored.title = title
      }
      if (input.description !== undefined) stored.description = input.description
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
      if (input.dueDate !== undefined) stored.dueDate = normalizeDueDate(input.dueDate)
      if (input.archived !== undefined) stored.archived = input.archived
      if (input.labels !== undefined) stored.labels = [...input.labels]
      return { ...stored, labels: [...stored.labels] }
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
