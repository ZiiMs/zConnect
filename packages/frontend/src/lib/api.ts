import { z } from "zod"

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ""

export const workspaceRoleSchema = z.enum(["Owner", "Admin", "Member"])

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.union([workspaceRoleSchema, z.literal("Viewer")]),
})

export const memberSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  role: workspaceRoleSchema,
})

export const invitationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string(),
  role: workspaceRoleSchema,
})

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  key: z.string(),
})

/**
 * The six fixed Status Categories in roster order (ADR-0001): Backlog,
 * Unstarted, In Progress, Completed, Canceled, Duplicate. Completed,
 * Canceled, and Duplicate are terminal and count as done everywhere
 * (grouping, progress, guardrails).
 */
export const STATUS_CATEGORIES = [
  "Backlog",
  "Unstarted",
  "In Progress",
  "Completed",
  "Canceled",
  "Duplicate",
] as const

export const statusCategorySchema = z.enum(STATUS_CATEGORIES)

export const statusSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  category: statusCategorySchema,
  position: z.number(),
})

export const prioritySchema = z.enum([
  "Urgent",
  "High",
  "Medium",
  "Low",
  "None",
])

export const issueSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  number: z.number(),
  keyPrefix: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  statusId: z.string(),
  priority: prioritySchema,
  assigneeId: z.string().nullable(),
  dueDate: z.string().nullable(),
  archived: z.boolean(),
  labels: z.array(z.string()),
  /** T5 subtask parent row id; absent on older payloads and test fixtures. */
  parentId: z.string().nullable().optional(),
  /** T5 completion guardrail: present on PATCH responses that complete. */
  warnings: z.array(z.string()).optional(),
  /**
   * Last-write marker for realtime conflict resolution (T4). The Issue
   * API predates it, so it stays optional: payloads without it still parse,
   * and `applyRemoteIssue` falls back to last-received-wins.
   */
  updatedAt: z.string().nullable().optional(),
})

export const labelSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  color: z.string(),
})

export type Priority = z.infer<typeof prioritySchema>
export type Issue = z.infer<typeof issueSchema>

export interface IssueFilters {
  statusIds?: string[]
  priorities?: Priority[]
  assigneeId?: string | null
  labels?: string[]
  text?: string
  archived?: boolean
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
  projectId?: string
  parentId?: string | null
}

export type Workspace = z.infer<typeof workspaceSchema>
export type Member = z.infer<typeof memberSchema>
export type Invitation = z.infer<typeof invitationSchema>
export type Project = z.infer<typeof projectSchema>
export type StatusCategory = z.infer<typeof statusCategorySchema>
export type Status = z.infer<typeof statusSchema>
export type Label = z.infer<typeof labelSchema>

/**
 * Terminal Status Categories (ADR-0001): Completed, Canceled, and Duplicate
 * count as done everywhere. Statuses in these categories are finished work;
 * the open three (Backlog, Unstarted, In Progress) are not.
 */
export const TERMINAL_STATUS_CATEGORIES = [
  "Completed",
  "Canceled",
  "Duplicate",
] as const satisfies readonly StatusCategory[]

export function isTerminalCategory(category: StatusCategory): boolean {
  return TERMINAL_STATUS_CATEGORIES.some((terminal) => terminal === category)
}

/**
 * Progress rollup for a project's issues: `done` counts issues sitting in a
 * terminal Status Category (ADR-0001), `total` counts every issue given.
 * Issues whose status is unknown still count toward `total`, never `done`.
 */
export function issueProgress(
  issues: Issue[],
  statuses: Status[]
): { total: number; done: number } {
  const terminalStatusIds = new Set(
    statuses
      .filter((status) => isTerminalCategory(status.category))
      .map((status) => status.id)
  )
  return {
    total: issues.length,
    done: issues.filter((issue) => terminalStatusIds.has(issue.statusId))
      .length,
  }
}

export interface CreateLabelInput {
  name: string
  color?: string
}

export interface UpdateLabelInput {
  name?: string
  color?: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : res.statusText
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return schema.parse(undefined)
  return schema.parse(json)
}

export const api = {
  listWorkspaces(): Promise<Workspace[]> {
    return request("/api/workspaces", z.array(workspaceSchema))
  },

  createWorkspace(name: string): Promise<Workspace> {
    return request("/api/workspaces", workspaceSchema, {
      method: "POST",
      body: { name },
    })
  },

  listMembers(workspaceId: string): Promise<Member[]> {
    return request(
      `/api/workspaces/${workspaceId}/members`,
      z.array(memberSchema)
    )
  },

  inviteMember(
    workspaceId: string,
    input: { email: string; role: z.infer<typeof workspaceRoleSchema> }
  ): Promise<Invitation> {
    return request(`/api/workspaces/${workspaceId}/invites`, invitationSchema, {
      method: "POST",
      body: input,
    })
  },

  listProjects(workspaceId: string): Promise<Project[]> {
    return request(
      `/api/workspaces/${workspaceId}/projects`,
      z.array(projectSchema)
    )
  },

  createProject(
    workspaceId: string,
    input: { name: string; key: string }
  ): Promise<Project> {
    return request(`/api/workspaces/${workspaceId}/projects`, projectSchema, {
      method: "POST",
      body: input,
    })
  },

  getProject(projectId: string): Promise<Project> {
    return request(`/api/projects/${projectId}`, projectSchema)
  },

  updateProject(
    projectId: string,
    input: { name?: string; key?: string }
  ): Promise<Project> {
    return request(`/api/projects/${projectId}`, projectSchema, {
      method: "PATCH",
      body: input,
    })
  },

  listStatuses(projectId: string): Promise<Status[]> {
    return request(`/api/projects/${projectId}/statuses`, z.array(statusSchema))
  },

  createStatus(
    projectId: string,
    input: { name: string; category: StatusCategory }
  ): Promise<Status> {
    return request(`/api/projects/${projectId}/statuses`, statusSchema, {
      method: "POST",
      body: input,
    })
  },

  updateStatus(
    projectId: string,
    statusId: string,
    input: { name?: string; category?: StatusCategory; position?: number }
  ): Promise<Status> {
    return request(
      `/api/projects/${projectId}/statuses/${statusId}`,
      statusSchema,
      { method: "PATCH", body: input }
    )
  },

  deleteStatus(projectId: string, statusId: string): Promise<void> {
    return request(
      `/api/projects/${projectId}/statuses/${statusId}`,
      z.void(),
      { method: "DELETE" }
    )
  },

  listIssues(projectId: string, filters?: IssueFilters): Promise<Issue[]> {
    const params = new URLSearchParams()
    for (const statusId of filters?.statusIds ?? []) {
      params.append("status", statusId)
    }
    for (const priority of filters?.priorities ?? []) {
      params.append("priority", priority)
    }
    if (filters?.assigneeId !== undefined) {
      params.append(
        "assignee",
        filters.assigneeId === null ? "none" : filters.assigneeId
      )
    }
    for (const label of filters?.labels ?? []) {
      params.append("label", label)
    }
    if (filters?.text) params.append("q", filters.text)
    if (filters?.archived !== undefined) {
      params.append("archived", String(filters.archived))
    }
    const query = params.toString()
    const path = `/api/projects/${projectId}/issues${query ? `?${query}` : ""}`
    return request(path, z.array(issueSchema))
  },

  createIssue(projectId: string, input: CreateIssueInput): Promise<Issue> {
    return request(`/api/projects/${projectId}/issues`, issueSchema, {
      method: "POST",
      body: input,
    })
  },

  getIssue(ref: string): Promise<Issue> {
    return request(`/api/issues/${encodeURIComponent(ref)}`, issueSchema)
  },

  updateIssue(ref: string, input: UpdateIssueInput): Promise<Issue> {
    return request(`/api/issues/${encodeURIComponent(ref)}`, issueSchema, {
      method: "PATCH",
      body: input,
    })
  },

  deleteIssue(ref: string): Promise<void> {
    return request(`/api/issues/${encodeURIComponent(ref)}`, z.void(), {
      method: "DELETE",
    })
  },

  listSubtasks(ref: string): Promise<Issue[]> {
    return request(
      `/api/issues/${encodeURIComponent(ref)}/subtasks`,
      z.array(issueSchema)
    )
  },

  listLabels(workspaceId: string): Promise<Label[]> {
    return request(
      `/api/workspaces/${workspaceId}/labels`,
      z.array(labelSchema)
    )
  },

  createLabel(workspaceId: string, input: CreateLabelInput): Promise<Label> {
    return request(`/api/workspaces/${workspaceId}/labels`, labelSchema, {
      method: "POST",
      body: input,
    })
  },

  updateLabel(
    workspaceId: string,
    labelId: string,
    input: UpdateLabelInput
  ): Promise<Label> {
    return request(
      `/api/workspaces/${workspaceId}/labels/${labelId}`,
      labelSchema,
      { method: "PATCH", body: input }
    )
  },

  deleteLabel(workspaceId: string, labelId: string): Promise<void> {
    return request(
      `/api/workspaces/${workspaceId}/labels/${labelId}`,
      z.void(),
      { method: "DELETE" }
    )
  },
}

/**
 * Client-side mirror of the server Issue query semantics (T4). The List,
 * Table, and Kanban views share one filtered query; this keeps realtime
 * inserts consistent with it: an incoming Issue joins the visible set only
 * when it matches the active filter bar.
 */
export function matchesIssueFilters(
  issue: Issue,
  filters: {
    statusIds: string[]
    priorities: Priority[]
    assigneeId?: string | null
    text: string
  }
): boolean {
  if (
    filters.statusIds.length > 0 &&
    !filters.statusIds.includes(issue.statusId)
  ) {
    return false
  }
  if (
    filters.priorities.length > 0 &&
    !filters.priorities.includes(issue.priority)
  ) {
    return false
  }
  if (
    filters.assigneeId !== undefined &&
    issue.assigneeId !== filters.assigneeId
  ) {
    return false
  }
  const text = filters.text.trim().toLowerCase()
  if (text.length > 0) {
    const haystack = `${issue.identifier} ${issue.title}`.toLowerCase()
    if (!haystack.includes(text)) return false
  }
  return true
}

/**
 * Last-write-wins merge for realtime Issue events (T4). Inserts append in
 * issue-number order; updates replace by id. When both sides carry
 * `updatedAt`, an older incoming write loses and `applied` is false so the
 * caller can surface the conflict; without timestamps the incoming event
 * wins.
 */
export function applyRemoteIssue(
  current: Issue[],
  incoming: Issue
): { issues: Issue[]; applied: boolean } {
  const existing = current.find((item) => item.id === incoming.id)
  if (!existing) {
    return {
      issues: [...current, incoming].sort((a, b) => a.number - b.number),
      applied: true,
    }
  }
  if (
    existing.updatedAt != null &&
    incoming.updatedAt != null &&
    incoming.updatedAt < existing.updatedAt
  ) {
    return { issues: current, applied: false }
  }
  return {
    issues: current.map((item) => (item.id === incoming.id ? incoming : item)),
    applied: true,
  }
}
