import { z } from "zod"

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? ""

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
  /** Display name from the auth user; absent until the API enriches it. */
  name: z.string().optional(),
  /** Avatar URL from the auth user; null when the user has none. */
  image: z.string().nullable().optional(),
})

export const invitationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string(),
  role: workspaceRoleSchema,
  /** Seven-day expiry; absent on older payloads. */
  expiresAt: z.string().optional(),
  /** True when the API actually sent the invite email. */
  mailSent: z.boolean().optional(),
  /** Copy-link fallback, always present on create responses. */
  acceptUrl: z.string().optional(),
})

export const invitationDetailsSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: workspaceRoleSchema,
  expiresAt: z.string(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  inviter: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
  }),
})

/** Enriched invitation row for the account-level inbox (GET /api/invitations). */
export const invitationInboxSchema = invitationSchema.extend({
  workspace: z.object({ id: z.string(), name: z.string() }),
  inviter: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
  }),
})

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  key: z.string(),
  icon: z.string().default("Folder"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#94a3b8"),
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
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#94a3b8"),
  position: z.number(),
  /** Optional guidance shown under the status name in Workflow settings. */
  description: z.string().nullable().optional(),
  /** The status new Issues start in. */
  isDefault: z.boolean().optional(),
  /** Issues currently in this status. */
  issueCount: z.number().optional(),
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
  /**
   * Author of the issue: the signed-in user for REST creates, null for
   * agent/system creates and older rows.
   */
  createdBy: z.string().nullable().optional(),
  /** T5 completion guardrail: present on PATCH responses that complete. */
  warnings: z.array(z.string()).optional(),
  /**
   * Creation timestamp (ISO); every issue carries it alongside `updatedAt`.
   * Optional for older payloads and fixtures; the API always sends both.
   */
  createdAt: z.string().nullable().optional(),
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
  /** Optional explanation shown in the workspace Labels table. */
  description: z.string().nullable().optional(),
  /** Optional group parent; one level only. */
  parentId: z.string().nullable().optional(),
  /** Issues carrying this label. */
  issueCount: z.number().optional(),
  /** Most recent time this label was attached to an Issue. */
  lastAppliedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
})

export const githubConnectionStatusSchema = z.enum([
  "active",
  "reconnect_required",
])

/** Safe Connection view: the server never serializes the token. */
export const githubConnectionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  connectorUserId: z.string(),
  connectorAccountId: z.string(),
  login: z.string(),
  scopes: z.array(z.string()),
  status: githubConnectionStatusSchema,
  lastSyncedAt: z.string().nullable(),
  lastManualRefreshAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Display name of the connector, resolved from the workspace roster. */
  connectorName: z.string().nullable(),
  repositoryCount: z.number(),
})

export const githubRepositorySchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  githubId: z.string(),
  fullName: z.string(),
  owner: z.string(),
  name: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  issuesEnabled: z.boolean(),
  defaultBranch: z.string().nullable(),
  pushedAt: z.string().nullable(),
  selectedAt: z.string(),
  lastSyncedAt: z.string().nullable(),
  syncError: z.string().nullable(),
})

export const githubRepositoryViewSchema = githubRepositorySchema.extend({
  unavailable: z.boolean(),
})

export const githubConnectionResponseSchema = z.object({
  connection: githubConnectionSchema.nullable(),
  repositories: z.array(githubRepositoryViewSchema),
})

/** Remote repository option shown by the allowlist picker. */
export const remoteRepositorySchema = z.object({
  githubId: z.string(),
  fullName: z.string(),
  owner: z.string(),
  name: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  issuesEnabled: z.boolean(),
  defaultBranch: z.string().nullable(),
  pushedAt: z.string().nullable(),
})

export const remoteRepositoryOptionSchema = remoteRepositorySchema.extend({
  selected: z.boolean(),
})

export const githubAllowlistResponseSchema = z.object({
  repositories: z.array(githubRepositoryViewSchema),
  removed: z.number(),
})

/** Project link row: repository metadata plus the link and sync state. */
export const projectRepositoryViewSchema = githubRepositorySchema.extend({
  unavailable: z.boolean(),
  linkedAt: z.string(),
  linkedBy: z.string(),
})

export const projectConnectionSchema = z.object({
  status: githubConnectionStatusSchema,
  login: z.string(),
})

export const projectRepositoriesResponseSchema = z.object({
  items: z.array(projectRepositoryViewSchema),
  connection: projectConnectionSchema.nullable(),
})

/** Chip shown on a GitHub Item row: one per External Link. */
export const linkedIssueRefSchema = z.object({
  linkId: z.string(),
  issueId: z.string(),
  identifier: z.string(),
  title: z.string(),
})

export const pullRequestStateSchema = z.enum(["open", "merged", "closed"])

/** Cached Pull Request plus its repository name and linked Issue chips. */
export const pullRequestRowSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number(),
  title: z.string(),
  state: pullRequestStateSchema,
  draft: z.boolean(),
  authorLogin: z.string(),
  authorAvatarUrl: z.string().nullable(),
  url: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  checksState: z.string().nullable(),
  reviewDecision: z.string().nullable(),
  commentCount: z.number(),
  bodyExcerpt: z.string().nullable(),
  githubCreatedAt: z.string(),
  githubUpdatedAt: z.string(),
  mergedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  syncedAt: z.string(),
  repository: z.string(),
  linkedIssues: z.array(linkedIssueRefSchema),
})

export const githubViewRepositorySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  issuesEnabled: z.boolean(),
  unavailable: z.boolean(),
})

export const githubViewFiltersSchema = z.object({
  authors: z.array(z.string()),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
})

export const pullRequestListResponseSchema = z.object({
  items: z.array(pullRequestRowSchema),
  nextCursor: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  connection: projectConnectionSchema.nullable(),
  repositories: z.array(githubViewRepositorySchema),
  filters: githubViewFiltersSchema,
})

export const githubRefreshResponseSchema = z.object({
  accepted: z.boolean(),
  enqueued: z.number(),
  lastSyncedAt: z.string().nullable(),
})

/** Label chip on a GitHub Issue row, colored by GitHub's hex value. */
export const githubLabelSchema = z.object({
  name: z.string(),
  color: z.string(),
})

export const githubAssigneeSchema = z.object({
  login: z.string(),
  avatarUrl: z.string().nullable(),
})

export const githubIssueStateSchema = z.enum(["open", "closed"])

/** Cached GitHub Issue plus its repository name and linked Issue chips. */
export const githubIssueRowSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  number: z.number(),
  title: z.string(),
  state: githubIssueStateSchema,
  authorLogin: z.string(),
  authorAvatarUrl: z.string().nullable(),
  url: z.string(),
  labels: z.array(githubLabelSchema),
  assignees: z.array(githubAssigneeSchema),
  commentCount: z.number(),
  bodyExcerpt: z.string().nullable(),
  githubCreatedAt: z.string(),
  githubUpdatedAt: z.string(),
  closedAt: z.string().nullable(),
  syncedAt: z.string(),
  repository: z.string(),
  linkedIssues: z.array(linkedIssueRefSchema),
})

export const githubIssueListResponseSchema = z.object({
  items: z.array(githubIssueRowSchema),
  nextCursor: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  connection: projectConnectionSchema.nullable(),
  repositories: z.array(githubViewRepositorySchema),
  filters: githubViewFiltersSchema,
})

export const commentSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  authorId: z.string(),
  /** Empty once soft-deleted; the tombstone keeps the row. */
  body: z.string(),
  parentId: z.string().nullable(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const activityActorTypeSchema = z.enum([
  "user",
  "agent",
  "system",
  "github",
])

export const activityEventSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  actorType: activityActorTypeSchema,
  actorId: z.string().nullable(),
  type: z.string(),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
})

/**
 * One Activity feed item: a Comment or an Activity Event. The server stores
 * them separately and merges them into this union at read time.
 */
export const timelineItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("comment") }).extend(commentSchema.shape),
  z.object({ kind: z.literal("activity") }).extend(activityEventSchema.shape),
])

export const timelinePageSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable(),
})

export const emailModeSchema = z.enum(["immediate", "digest", "off"])

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  issueId: z.string(),
  type: z.string(),
  actorType: activityActorTypeSchema,
  actorId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  emailedAt: z.string().nullable().optional(),
  createdAt: z.string(),
})

export const notificationsPageSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number(),
})

export const notificationSettingsSchema = z.object({
  emailMode: emailModeSchema,
})

export const watchStateSchema = z.object({ watching: z.boolean() })

/** My Issues row: the Issue plus the project/status labels its row shows. */
export const myIssueSchema = issueSchema.extend({
  workspaceId: z.string(),
  workspaceName: z.string(),
  projectName: z.string(),
  projectKey: z.string(),
  projectIcon: z.string(),
  projectColor: z.string(),
  statusName: z.string(),
  statusCategory: statusCategorySchema,
  statusColor: z.string(),
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
export type Comment = z.infer<typeof commentSchema>
export type ActivityActorType = z.infer<typeof activityActorTypeSchema>
export type ActivityEvent = z.infer<typeof activityEventSchema>
export type TimelineItem = z.infer<typeof timelineItemSchema>
export type TimelinePage = z.infer<typeof timelinePageSchema>
export type EmailMode = z.infer<typeof emailModeSchema>
export type Notification = z.infer<typeof notificationSchema>
export type NotificationsPage = z.infer<typeof notificationsPageSchema>
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>
export type InvitationDetails = z.infer<typeof invitationDetailsSchema>
export type InvitationInbox = z.infer<typeof invitationInboxSchema>
export type MyIssue = z.infer<typeof myIssueSchema>
export type GitHubConnectionStatus = z.infer<
  typeof githubConnectionStatusSchema
>
export type GitHubConnection = z.infer<typeof githubConnectionSchema>
export type GitHubRepository = z.infer<typeof githubRepositorySchema>
export type GitHubRepositoryView = z.infer<typeof githubRepositoryViewSchema>
export type GitHubConnectionResponse = z.infer<
  typeof githubConnectionResponseSchema
>
export type RemoteRepository = z.infer<typeof remoteRepositorySchema>
export type RemoteRepositoryOption = z.infer<
  typeof remoteRepositoryOptionSchema
>
export type GitHubAllowlistResponse = z.infer<
  typeof githubAllowlistResponseSchema
>
export type ProjectRepositoryView = z.infer<typeof projectRepositoryViewSchema>
export type ProjectConnection = z.infer<typeof projectConnectionSchema>
export type ProjectRepositoriesResponse = z.infer<
  typeof projectRepositoriesResponseSchema
>
export type LinkedIssueRef = z.infer<typeof linkedIssueRefSchema>
export type PullRequestState = z.infer<typeof pullRequestStateSchema>
export type PullRequestRow = z.infer<typeof pullRequestRowSchema>
export type GitHubViewRepository = z.infer<typeof githubViewRepositorySchema>
export type GitHubViewFilters = z.infer<typeof githubViewFiltersSchema>
export type PullRequestListResponse = z.infer<
  typeof pullRequestListResponseSchema
>
export type GitHubRefreshResponse = z.infer<typeof githubRefreshResponseSchema>
export type GitHubLabel = z.infer<typeof githubLabelSchema>
export type GitHubAssignee = z.infer<typeof githubAssigneeSchema>
export type GitHubIssueState = z.infer<typeof githubIssueStateSchema>
export type GitHubIssueRow = z.infer<typeof githubIssueRowSchema>
export type GitHubIssueListResponse = z.infer<
  typeof githubIssueListResponseSchema
>

/** Query accepted by the Pull Request list; empty values are skipped. */
export interface ListPullRequestsFilters {
  state?: string
  author?: string
  label?: string
  q?: string
  cursor?: string | null
  limit?: number
}

/** Query accepted by the GitHub Issue list; empty values are skipped. */
export interface ListGitHubIssuesFilters {
  state?: string
  author?: string
  label?: string
  q?: string
  cursor?: string | null
  limit?: number
}

/**
 * The subset of a Member that assignee surfaces read. Views accept this
 * looser shape so fixtures can pass a bare `{ userId }`; the API returns
 * the full Member with `name`/`image` filled in from the auth user.
 */
export type MemberRef = {
  userId: string
  name?: string
  image?: string | null
}

/** Resolve a member by id from a roster. */
export function findMember(
  members: MemberRef[],
  userId: string | null | undefined
): MemberRef | undefined {
  if (userId === null || userId === undefined) return undefined
  return members.find((member) => member.userId === userId)
}

/** Display name for a member, falling back to the raw user id. */
export function memberName(
  member: MemberRef | undefined,
  userId: string
): string {
  return member?.name ?? userId
}

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

export function isTerminalStatusCategory(category: StatusCategory): boolean {
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
      .filter((status) => isTerminalStatusCategory(status.category))
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
  description?: string | null
  parentId?: string | null
}

export interface UpdateLabelInput {
  name?: string
  color?: string
  description?: string | null
  parentId?: string | null
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

  getInvitation(invitationId: string): Promise<InvitationDetails> {
    return request(
      `/api/invitations/${encodeURIComponent(invitationId)}`,
      invitationDetailsSchema
    )
  },

  acceptInvitation(invitationId: string): Promise<Member> {
    return request(
      `/api/invitations/${encodeURIComponent(invitationId)}/accept`,
      memberSchema,
      { method: "POST" }
    )
  },

  listMyInvitations(): Promise<InvitationInbox[]> {
    return request("/api/invitations", z.array(invitationInboxSchema))
  },

  listWorkspaceInvites(workspaceId: string): Promise<Invitation[]> {
    return request(
      `/api/workspaces/${workspaceId}/invites`,
      z.array(invitationSchema)
    )
  },

  deleteInvitation(invitationId: string): Promise<void> {
    return request(
      `/api/invitations/${encodeURIComponent(invitationId)}`,
      z.void(),
      { method: "DELETE" }
    )
  },

  listProjects(workspaceId: string): Promise<Project[]> {
    return request(
      `/api/workspaces/${workspaceId}/projects`,
      z.array(projectSchema)
    )
  },

  createProject(
    workspaceId: string,
    input: { name: string; key: string; icon?: string; color?: string }
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
    input: { name?: string; key?: string; icon?: string; color?: string }
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
    input: {
      name: string
      category: StatusCategory
      color?: string
      description?: string | null
      isDefault?: boolean
    }
  ): Promise<Status> {
    return request(`/api/projects/${projectId}/statuses`, statusSchema, {
      method: "POST",
      body: input,
    })
  },

  updateStatus(
    projectId: string,
    statusId: string,
    input: {
      name?: string
      category?: StatusCategory
      color?: string
      position?: number
      description?: string | null
      isDefault?: boolean
    }
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

  listTimeline(
    ref: string,
    opts?: { limit?: number; before?: string }
  ): Promise<TimelinePage> {
    const params = new URLSearchParams()
    if (opts?.limit !== undefined) params.append("limit", String(opts.limit))
    if (opts?.before !== undefined) params.append("before", opts.before)
    const query = params.toString()
    return request(
      `/api/issues/${encodeURIComponent(ref)}/timeline${query ? `?${query}` : ""}`,
      timelinePageSchema
    )
  },

  createComment(
    ref: string,
    input: { body: string; parentId?: string | null }
  ): Promise<Comment> {
    return request(
      `/api/issues/${encodeURIComponent(ref)}/comments`,
      commentSchema,
      { method: "POST", body: input }
    )
  },

  updateComment(commentId: string, body: string): Promise<Comment> {
    return request(
      `/api/comments/${encodeURIComponent(commentId)}`,
      commentSchema,
      { method: "PATCH", body: { body } }
    )
  },

  deleteComment(commentId: string): Promise<Comment> {
    return request(
      `/api/comments/${encodeURIComponent(commentId)}`,
      commentSchema,
      { method: "DELETE" }
    )
  },

  getWatch(ref: string): Promise<{ watching: boolean }> {
    return request(
      `/api/issues/${encodeURIComponent(ref)}/watch`,
      watchStateSchema
    )
  },

  watchIssue(ref: string): Promise<{ watching: boolean }> {
    return request(
      `/api/issues/${encodeURIComponent(ref)}/watch`,
      watchStateSchema,
      { method: "POST" }
    )
  },

  unwatchIssue(ref: string): Promise<{ watching: boolean }> {
    return request(
      `/api/issues/${encodeURIComponent(ref)}/watch`,
      watchStateSchema,
      { method: "DELETE" }
    )
  },

  listNotifications(opts?: {
    filter?: "all" | "unread"
    limit?: number
    before?: string
  }): Promise<NotificationsPage> {
    const params = new URLSearchParams()
    if (opts?.filter) params.append("filter", opts.filter)
    if (opts?.limit !== undefined) params.append("limit", String(opts.limit))
    if (opts?.before !== undefined) params.append("before", opts.before)
    const query = params.toString()
    return request(
      `/api/notifications${query ? `?${query}` : ""}`,
      notificationsPageSchema
    )
  },

  markNotificationRead(notificationId: string): Promise<Notification> {
    return request(
      `/api/notifications/${encodeURIComponent(notificationId)}/read`,
      notificationSchema,
      { method: "POST" }
    )
  },

  markAllNotificationsRead(): Promise<{ updated: number }> {
    return request(
      "/api/notifications/read-all",
      z.object({ updated: z.number() }),
      { method: "POST" }
    )
  },

  unreadNotificationCount(): Promise<{ count: number }> {
    return request(
      "/api/notifications/unread-count",
      z.object({ count: z.number() })
    )
  },

  getNotificationSettings(): Promise<NotificationSettings> {
    return request("/api/me/notification-settings", notificationSettingsSchema)
  },

  updateNotificationSettings(
    emailMode: EmailMode
  ): Promise<NotificationSettings> {
    return request(
      "/api/me/notification-settings",
      notificationSettingsSchema,
      {
        method: "PATCH",
        body: { emailMode },
      }
    )
  },

  listMyIssues(tab: "assigned" | "created" | "watched"): Promise<MyIssue[]> {
    return request(
      `/api/me/issues?tab=${encodeURIComponent(tab)}`,
      z.array(myIssueSchema)
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

  getGitHubConnection(workspaceId: string): Promise<GitHubConnectionResponse> {
    return request(
      `/api/workspaces/${workspaceId}/github-connection`,
      githubConnectionResponseSchema
    )
  },

  connectGitHubConnection(
    workspaceId: string
  ): Promise<GitHubConnectionResponse> {
    return request(
      `/api/workspaces/${workspaceId}/github-connection`,
      githubConnectionResponseSchema,
      { method: "POST", body: {} }
    )
  },

  async disconnectGitHubConnection(workspaceId: string): Promise<void> {
    await request(
      `/api/workspaces/${workspaceId}/github-connection`,
      z.object({ disconnected: z.boolean() }),
      { method: "DELETE" }
    )
  },

  searchGitHubRepositories(
    workspaceId: string,
    query: string
  ): Promise<{ items: RemoteRepositoryOption[] }> {
    const params = new URLSearchParams()
    if (query.trim() !== "") params.append("query", query.trim())
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return request(
      `/api/workspaces/${workspaceId}/github-connection/repositories${suffix}`,
      z.object({ items: z.array(remoteRepositoryOptionSchema) })
    )
  },

  setGitHubAllowlist(
    workspaceId: string,
    githubIds: string[]
  ): Promise<GitHubAllowlistResponse> {
    return request(
      `/api/workspaces/${workspaceId}/github-connection/repositories`,
      githubAllowlistResponseSchema,
      { method: "PUT", body: { githubIds } }
    )
  },

  getProjectRepositories(
    projectId: string
  ): Promise<ProjectRepositoriesResponse> {
    return request(
      `/api/projects/${projectId}/repositories`,
      projectRepositoriesResponseSchema
    )
  },

  setProjectRepositories(
    projectId: string,
    repositoryIds: string[]
  ): Promise<ProjectRepositoriesResponse> {
    return request(
      `/api/projects/${projectId}/repositories`,
      projectRepositoriesResponseSchema,
      { method: "PUT", body: { repositoryIds } }
    )
  },

  listPullRequests(
    projectId: string,
    filters: ListPullRequestsFilters = {}
  ): Promise<PullRequestListResponse> {
    const params = new URLSearchParams()
    if (filters.state?.trim()) params.set("state", filters.state.trim())
    if (filters.author?.trim()) params.set("author", filters.author.trim())
    if (filters.label?.trim()) params.set("label", filters.label.trim())
    if (filters.q?.trim()) params.set("q", filters.q.trim())
    if (filters.cursor) params.set("cursor", filters.cursor)
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return request(
      `/api/projects/${projectId}/github/pull-requests${suffix}`,
      pullRequestListResponseSchema
    )
  },

  refreshGitHub(projectId: string): Promise<GitHubRefreshResponse> {
    return request(
      `/api/projects/${projectId}/github/refresh`,
      githubRefreshResponseSchema,
      { method: "POST", body: {} }
    )
  },

  listGitHubIssues(
    projectId: string,
    filters: ListGitHubIssuesFilters = {}
  ): Promise<GitHubIssueListResponse> {
    const params = new URLSearchParams()
    if (filters.state?.trim()) params.set("state", filters.state.trim())
    if (filters.author?.trim()) params.set("author", filters.author.trim())
    if (filters.label?.trim()) params.set("label", filters.label.trim())
    if (filters.q?.trim()) params.set("q", filters.q.trim())
    if (filters.cursor) params.set("cursor", filters.cursor)
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    const suffix = params.toString() ? `?${params.toString()}` : ""
    return request(
      `/api/projects/${projectId}/github/issues${suffix}`,
      githubIssueListResponseSchema
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
