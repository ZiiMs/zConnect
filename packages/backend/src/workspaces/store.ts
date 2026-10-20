import {
  compareTimelineDesc,
  decodeCursor,
  diffIssueUpdate,
  encodeCursor,
  isDescriptionCoalesced,
  isOlderThanCursor,
  mergeTimeline,
} from "./activity.js"

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
  /**
   * Display name from the auth user record. Absent when the store cannot
   * resolve the user (e.g. the in-memory store without a user directory);
   * clients fall back to the raw `userId`.
   */
  name?: string
  /** Avatar URL from the auth user record; null when the user has none. */
  image?: string | null
  /** Email from the auth user record; null when the user has none. */
  email?: string | null
}

export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
  /** Created + 7 days. Expired invitations cannot be accepted. */
  expiresAt: string
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
  description: string
}[] = [
  {
    name: "Backlog",
    category: "Backlog",
    color: "#bec2c8",
    description: "Ideas and work that is not scheduled yet.",
  },
  {
    name: "Todo",
    category: "Unstarted",
    color: "#e2e2e2",
    description: "Ready to be picked up.",
  },
  {
    name: "In Progress",
    category: "In Progress",
    color: "#f2c94c",
    description: "Actively being worked on.",
  },
  {
    name: "In Review",
    category: "In Progress",
    color: "#0f783c",
    description: "Pull request is being reviewed.",
  },
  {
    name: "Done",
    category: "Completed",
    color: "#5e6ad2",
    description: "Work is complete.",
  },
  {
    name: "Canceled",
    category: "Canceled",
    color: "#95a2b3",
    description: "Won't be done.",
  },
  {
    name: "Duplicate",
    category: "Duplicate",
    color: "#95a2b3",
    description: "Already tracked elsewhere.",
  },
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
  createdBy: null
  createdAt: string
  updatedAt: string
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
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  /** Optional guidance shown under the status name in Workflow settings. */
  description: string | null
  /** The status new Issues start in; at most one per Project. */
  isDefault: boolean
  /** Issues currently in this status (including archived ones). */
  issueCount: number
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
  /**
   * Author of the issue: the acting user id, or null for agent/system
   * creates and seeded sample issues.
   */
  createdBy: string | null
  /** Creation timestamp (ISO); every issue carries it alongside `updatedAt`. */
  createdAt: string
  /** Last-write marker for realtime conflict resolution (T4). */
  updatedAt: string
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

/*
 * Collaboration core (R1/R2) domain types. Vocabulary is GLOSSARY.md:
 * Comment, Activity Event, Watcher, Notification, Inbox, Mention.
 */

/** Every Activity Event actor kind; `github` rows come from link mappings. */
export type ActivityActorType = "user" | "agent" | "system" | "github"

/** Who performed a mutation. Every issue mutator accepts one. */
export interface Actor {
  type: "user" | "agent" | "system"
  id: string | null
  /** Display label for agent/system actors (token name, "System"). */
  name?: string | null
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null }

/**
 * Activity Event actor input. Mutations use `Actor`; the GitHub handler
 * records migrated/live link events with the synthetic `github` kind.
 */
export type ActivityActor =
  | Actor
  | { type: "github"; id: string | null; name?: string | null }

export interface Comment {
  id: string
  issueId: string
  authorId: string
  /** "" once soft-deleted (tombstone row). */
  body: string
  /** One level: parent must be top-level and on the same issue. */
  parentId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
}

export interface ActivityEvent {
  id: string
  issueId: string
  actorType: ActivityActorType
  actorId: string | null
  type: string
  summary: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface Watcher {
  issueId: string
  userId: string
  createdAt: string
}

export interface Notification {
  id: string
  userId: string
  issueId: string
  type: string
  actorType: ActivityActorType
  actorId: string | null
  payload: Record<string, unknown>
  readAt: string | null
  /** Set when an email covering this row has been sent; drives digest dedupe. */
  emailedAt: string | null
  createdAt: string
}

export type EmailMode = "immediate" | "digest" | "off"

export interface NotificationSettings {
  userId: string
  emailMode: EmailMode
}

/** Cross-project My Issues row: the issue plus the labels its row needs. */
export interface MyIssue extends Issue {
  workspaceId: string
  workspaceName: string
  projectName: string
  projectKey: string
  projectIcon: string
  projectColor: string
  statusName: string
  statusCategory: StatusCategory
  statusColor: string
}

/** Timeline union: Activity Events and Comments merged newest first. */
export type TimelineItem =
  | ({ kind: "comment" } & Comment)
  | ({ kind: "activity" } & ActivityEvent)

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
  /** Optional explanation shown in the workspace Labels table. */
  description: string | null
  /** Optional group parent; one level only. */
  parentId: string | null
  /** Issues carrying this label. */
  issueCount: number
  /** Most recent time this label was attached to an Issue, if ever. */
  lastAppliedAt: string | null
  createdAt: string
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
 * the Drizzle store over Neon Postgres.
 */
export interface WorkspaceStore {
  createWorkspace(ownerId: string, name: string): Promise<Workspace>
  listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]>
  /** Workspace row by id, for invite/email content and scoped lookups. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>
  getMembership(workspaceId: string, userId: string): Promise<Membership | null>
  listMembers(workspaceId: string): Promise<Membership[]>
  createInvitation(input: {
    workspaceId: string
    email: string
    role: WorkspaceRole
    invitedBy: string
  }): Promise<Invitation>
  listInvitationsForEmail(email: string): Promise<Invitation[]>
  /** Pending invitations for one workspace, for the members tab. */
  listInvitationsForWorkspace(workspaceId: string): Promise<Invitation[]>
  /** Delete one invitation by id; true when a row was removed. */
  deleteInvitation(invitationId: string): Promise<boolean>
  /** One invitation by id, for the accept page's mismatch/expiry gates. */
  getInvitation(invitationId: string): Promise<Invitation | null>
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
  /**
   * With `userId`, scope to what that user may read: a Member sees every
   * project in the workspace, a Viewer only the projects granted to them.
   * Without `userId`, keep the unscoped workspace listing.
   */
  listProjects(workspaceId: string, userId?: string): Promise<Project[]>
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
    input: {
      name: string
      category: StatusCategory
      color?: string
      description?: string | null
      isDefault?: boolean
    }
  ): Promise<Status>
  /** Statuses in Kanban order (ascending position), with issue counts. */
  listStatuses(projectId: string): Promise<Status[]>
  getStatus(statusId: string): Promise<Status | null>
  updateStatus(
    statusId: string,
    input: {
      name?: string
      category?: StatusCategory
      color?: string
      position?: number
      description?: string | null
      isDefault?: boolean
    }
  ): Promise<Status>
  deleteStatus(statusId: string): Promise<void>
  createIssue(
    projectId: string,
    input: CreateIssueInput,
    actor?: Actor
  ): Promise<Issue>
  listIssues(projectId: string, filters?: IssueFilters): Promise<Issue[]>
  /** Resolve by human identifier (KEY-N, case-insensitive) or row id. */
  getIssue(ref: string): Promise<Issue | null>
  updateIssue(
    ref: string,
    input: UpdateIssueInput,
    actor?: Actor
  ): Promise<Issue>
  /**
   * T5 hard delete (Owner/Admin only at the route layer). Subtasks of the
   * deleted issue become top-level; label links drop with the row. Deleting
   * emits no Activity Event.
   */
  deleteIssue(ref: string, actor?: Actor): Promise<void>
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

  /*
   * Collaboration core (R1/R2). Comments are never Activity Events;
   * watchers and Notifications are per-user rows owned by exactly one
   * Member. Timeline cursors are opaque and shared by comments,
   * notifications, and the merged timeline.
   */

  createComment(input: {
    issueId: string
    authorId: string
    body: string
    parentId?: string | null
  }): Promise<Comment>
  getComment(commentId: string): Promise<Comment | null>
  updateComment(commentId: string, body: string): Promise<Comment>
  softDeleteComment(commentId: string): Promise<Comment>
  listComments(
    issueId: string,
    opts?: { limit?: number; before?: string }
  ): Promise<{ comments: Comment[]; nextCursor: string | null }>

  appendActivity(
    issueId: string,
    input: {
      actor: ActivityActor
      type: string
      summary: string
      payload?: Record<string, unknown>
    }
  ): Promise<ActivityEvent>
  /** Ascending by createdAt, then id. */
  listActivity(issueId: string): Promise<ActivityEvent[]>
  listTimeline(
    issueId: string,
    opts?: { limit?: number; before?: string }
  ): Promise<{ items: TimelineItem[]; nextCursor: string | null }>

  addWatcher(issueId: string, userId: string): Promise<void>
  removeWatcher(issueId: string, userId: string): Promise<void>
  isWatching(issueId: string, userId: string): Promise<boolean>
  listWatcherIds(issueId: string): Promise<string[]>

  createNotification(
    input: Pick<
      Notification,
      "userId" | "issueId" | "type" | "actorType" | "actorId"
    > & {
      payload: Record<string, unknown>
    }
  ): Promise<Notification>
  listNotifications(
    userId: string,
    opts: { filter: "all" | "unread"; limit?: number; before?: string }
  ): Promise<{ notifications: Notification[]; nextCursor: string | null }>
  /** `null` when the row is missing or owned by another user. */
  markNotificationRead(id: string, userId: string): Promise<Notification | null>
  markAllNotificationsRead(userId: string): Promise<number>
  unreadNotificationCount(userId: string): Promise<number>
  purgeReadNotifications(olderThan: string): Promise<number>
  getNotificationSettings(userId: string): Promise<NotificationSettings>
  setNotificationSettings(
    userId: string,
    emailMode: EmailMode
  ): Promise<NotificationSettings>
  listDigestGroups(
    cutoff: string
  ): Promise<{ userId: string; email: string; notifications: Notification[] }[]>
  markNotificationsEmailed(ids: string[], at: string): Promise<void>

  /** Issue rows for one My Issues tab, scoped to readable workspaces. */
  listMyIssues(
    userId: string,
    tab: "assigned" | "created" | "watched"
  ): Promise<Issue[]>
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
  /**
   * Auth users keyed by id, so `listMembers` can echo the display name,
   * avatar, and email the real store joins from the user table. Omitted in
   * tests that do not care about member identity.
   */
  users?: Record<
    string,
    { name: string; image?: string | null; email?: string | null }
  >
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
  /** Per-issue label attach timestamps (Settings "Last applied"). */
  const issueLabelTimes = new Map<string, Map<string, string>>()
  /** Collaboration core rows. */
  const comments = new Map<string, Comment>()
  const activityEvents = new Map<string, ActivityEvent>()
  const watchers = new Map<string, Watcher>()
  const notifications = new Map<string, Notification>()
  const notificationSettings = new Map<string, EmailMode>()

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
        description: null,
        parentId: null,
        issueCount: 0,
        lastAppliedAt: null,
        createdAt: new Date().toISOString(),
      }
      labels.set(row.id, row)
      return row
    })
  }

  /**
   * Resolve an optional group parent: same workspace, one level only, and
   * never the label itself. Returns null for an explicit top-level label.
   */
  function resolveLabelParent(
    workspaceId: string,
    selfId: string | null,
    parentId: string | null | undefined
  ): string | null | undefined {
    if (parentId === undefined) return undefined
    if (parentId === null) return null
    const parent = labels.get(parentId)
    if (!parent || parent.workspaceId !== workspaceId) {
      throw invalid("Label group not found")
    }
    if (selfId !== null && parent.id === selfId) {
      throw invalid("A label cannot be its own group")
    }
    if (parent.parentId) {
      throw invalid("Label groups cannot nest more than one level")
    }
    if (selfId !== null) {
      const hasChildren = [...labels.values()].some(
        (l) => l.parentId === selfId
      )
      if (hasChildren) {
        throw invalid("A label with children cannot become a child")
      }
    }
    return parent.id
  }

  function relinkIssue(issueId: string, rows: Label[]): string[] {
    const previous = issueLabelTimes.get(issueId) ?? new Map<string, string>()
    const appliedAt = new Map<string, string>()
    const now = new Date().toISOString()
    for (const row of rows) {
      appliedAt.set(row.id, previous.get(row.id) ?? now)
    }
    issueLinks.set(issueId, new Set(rows.map((row) => row.id)))
    issueLabelTimes.set(issueId, appliedAt)
    return rows.map((row) => row.name)
  }

  /** Attach live Issue counts and the most recent apply time to a Label row. */
  function withLabelStats(label: Label): Label {
    let issueCount = 0
    let lastAppliedAt: string | null = null
    for (const [issueId, ids] of issueLinks) {
      if (!ids.has(label.id)) continue
      issueCount += 1
      const applied = issueLabelTimes.get(issueId)?.get(label.id)
      if (applied && (!lastAppliedAt || applied > lastAppliedAt)) {
        lastAppliedAt = applied
      }
    }
    return { ...label, issueCount, lastAppliedAt }
  }

  function childCount(issueId: string): number {
    let count = 0
    for (const issue of issues.values()) {
      if (issue.parentId === issueId) count += 1
    }
    return count
  }

  function statusIssueCount(statusId: string): number {
    let count = issueRefs.filter((r) => r.statusId === statusId).length
    for (const issue of issues.values()) {
      if (issue.statusId === statusId) count += 1
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

  function notFound(message: string): Error {
    const error = new Error(message)
    ;(error as { code?: string }).code = "not_found"
    return error
  }

  const watcherKey = (issueId: string, userId: string) => `${issueId}:${userId}`

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

  function cloneIssue(issue: Issue): Issue {
    return { ...issue, labels: [...issue.labels] }
  }

  function recordActivity(
    issueId: string,
    actor: ActivityActor,
    type: string,
    summary: string,
    payload: Record<string, unknown> = {},
    createdAt = new Date().toISOString()
  ): ActivityEvent {
    const event: ActivityEvent = {
      id: crypto.randomUUID(),
      issueId,
      actorType: actor.type,
      actorId: actor.id,
      type,
      summary,
      payload: { ...payload },
      createdAt,
    }
    activityEvents.set(event.id, event)
    return { ...event, payload: { ...event.payload } }
  }

  /** Newest matching description event for the coalescing window. */
  function newestDescriptionEvent(
    issueId: string,
    actor: Actor
  ): string | null {
    let newest: string | null = null
    for (const event of activityEvents.values()) {
      if (
        event.issueId !== issueId ||
        event.type !== "issue.description_changed" ||
        event.actorType !== actor.type ||
        event.actorId !== actor.id
      ) {
        continue
      }
      if (newest === null || event.createdAt > newest) newest = event.createdAt
    }
    return newest
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
    input: CreateIssueInput,
    actor: Actor = SYSTEM_ACTOR
  ): Issue {
    const now = new Date().toISOString()
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
      // Only a signed-in user owns authorship; agent/system creates and
      // seeded samples stay null.
      createdBy: actor.type === "user" ? actor.id : null,
      createdAt: now,
      updatedAt: now,
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

    async getWorkspace(workspaceId) {
      const found = workspaces.get(workspaceId)
      return found ? { ...found } : null
    },

    async getMembership(workspaceId, userId) {
      return members.get(memberKey(workspaceId, userId)) ?? null
    },

    async listMembers(workspaceId) {
      return [...members.values()]
        .filter((m) => m.workspaceId === workspaceId)
        .map((m) => {
          const profile = options.users?.[m.userId]
          return profile
            ? {
                ...m,
                name: profile.name,
                image: profile.image ?? null,
                email: profile.email ?? null,
              }
            : m
        })
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
        // Contract: expiry = created + 7 days.
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
      invitations.set(invitation.id, invitation)
      return invitation
    },

    async listInvitationsForEmail(email) {
      const lower = email.toLowerCase()
      return [...invitations.values()].filter((i) => i.email === lower)
    },

    async listInvitationsForWorkspace(workspaceId) {
      return [...invitations.values()].filter(
        (i) => i.workspaceId === workspaceId
      )
    },

    async deleteInvitation(invitationId) {
      return invitations.delete(invitationId)
    },

    async getInvitation(invitationId) {
      const found = invitations.get(invitationId)
      return found ? { ...found } : null
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
          description: entry.description,
          isDefault: entry.name === "Todo",
          issueCount: 0,
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
        description: input.description?.trim() || null,
        isDefault: input.isDefault === true,
        issueCount: 0,
      }
      const currentDefault = [...statuses.values()].find(
        (s) => s.projectId === projectId && s.isDefault
      )
      if (!currentDefault) status.isDefault = true
      if (status.isDefault) {
        for (const other of statuses.values()) {
          if (other.projectId === projectId) other.isDefault = false
        }
      }
      statuses.set(status.id, status)
      return { ...status }
    },

    async listStatuses(projectId) {
      return [...statuses.values()]
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ ...s, issueCount: statusIssueCount(s.id) }))
    },

    async getStatus(statusId) {
      const status = statuses.get(statusId)
      return status
        ? { ...status, issueCount: statusIssueCount(statusId) }
        : null
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
      if (input.description !== undefined) {
        status.description = input.description?.trim() || null
      }
      if (input.isDefault === true) {
        for (const other of statuses.values()) {
          if (other.projectId === status.projectId) other.isDefault = false
        }
        status.isDefault = true
      } else if (input.isDefault === false) {
        status.isDefault = false
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
      return { ...status, issueCount: statusIssueCount(statusId) }
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
      const remaining = [...statuses.values()]
        .filter((s) => s.projectId === status.projectId)
        .sort((a, b) => a.position - b.position)
      remaining.forEach((s, index) => {
        s.position = index
      })
      if (status.isDefault && remaining.length > 0) {
        remaining[0].isDefault = true
      }
    },

    async createIssue(
      projectId,
      input: CreateIssueInput,
      actor: Actor = SYSTEM_ACTOR
    ): Promise<Issue> {
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
      const issue = newIssueRow(
        project,
        number,
        {
          ...input,
          title,
          statusId: status.id,
          priority,
          assigneeId,
          dueDate,
          labels: labelRows.map((row) => row.name),
          parentId,
        },
        actor
      )
      issues.set(issue.id, issue)
      relinkIssue(issue.id, labelRows)
      recordActivity(issue.id, actor, "issue.created", "created the issue", {
        identifier: issue.identifier,
        title: issue.title,
      })
      return cloneIssue(issue)
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

    async updateIssue(
      ref,
      input: UpdateIssueInput,
      actor: Actor = SYSTEM_ACTOR
    ): Promise<Issue> {
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
      const before = cloneIssue(stored)
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
      const now = new Date()
      stored.updatedAt = now.toISOString()
      const after = cloneIssue(stored)
      const parentIdentifier = (id: string | null): string | null =>
        id === null ? null : (issues.get(id)?.identifier ?? id)
      const drafts = diffIssueUpdate(before, after, input, {
        fromParentIdentifier: parentIdentifier(before.parentId),
        toParentIdentifier: parentIdentifier(after.parentId),
      }).filter(
        (draft) =>
          draft.type !== "issue.description_changed" ||
          !isDescriptionCoalesced(newestDescriptionEvent(stored.id, actor), now)
      )
      for (const draft of drafts) {
        recordActivity(
          stored.id,
          actor,
          draft.type,
          draft.summary,
          draft.payload,
          now.toISOString()
        )
      }
      return after
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
      const parentId = resolveLabelParent(workspaceId, null, input.parentId)
      const label: Label = {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        color,
        description: input.description?.trim() || null,
        parentId: parentId ?? null,
        issueCount: 0,
        lastAppliedAt: null,
        createdAt: new Date().toISOString(),
      }
      labels.set(label.id, label)
      return withLabelStats(label)
    },

    async listLabels(workspaceId) {
      return [...labels.values()]
        .filter((l) => l.workspaceId === workspaceId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(withLabelStats)
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
      if (input.description !== undefined) {
        label.description = input.description?.trim() || null
      }
      if (input.parentId !== undefined) {
        const parentId = resolveLabelParent(
          label.workspaceId,
          label.id,
          input.parentId
        )
        label.parentId = parentId ?? null
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
      return withLabelStats(label)
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
      // Promote children to top level instead of cascading the parent.
      for (const child of labels.values()) {
        if (child.parentId === labelId) child.parentId = null
      }
      // Scrub the T3 text[] names on linked issues so filters stay correct.
      for (const [issueId, ids] of issueLinks) {
        if (!ids.delete(labelId)) continue
        issueLabelTimes.get(issueId)?.delete(labelId)
        const stored = issues.get(issueId)
        if (stored) stored.labels = stored.labels.filter((n) => n !== name)
        if (ids.size === 0) issueLinks.delete(issueId)
      }
      issueLabelTimes.forEach((times, issueId) => {
        if (times.size === 0) issueLabelTimes.delete(issueId)
      })
    },

    async listSubtasks(parentId) {
      return [...issues.values()]
        .filter((issue) => issue.parentId === parentId)
        .sort((a, b) => a.number - b.number)
        .map((issue) => ({ ...issue, labels: [...issue.labels] }))
    },

    async deleteIssue(ref, _actor?: Actor) {
      const issue = issues.get(ref) ?? (await this.getIssue(ref))
      const stored = issue ? issues.get(issue.id) : undefined
      if (!stored) {
        const error = new Error("Issue not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      issues.delete(stored.id)
      issueLinks.delete(stored.id)
      issueLabelTimes.delete(stored.id)
      // Collaboration rows cascade with the issue, matching the Drizzle FKs.
      for (const [id, comment] of comments) {
        if (comment.issueId === stored.id) comments.delete(id)
      }
      for (const [id, event] of activityEvents) {
        if (event.issueId === stored.id) activityEvents.delete(id)
      }
      for (const [key, watcher] of watchers) {
        if (watcher.issueId === stored.id) watchers.delete(key)
      }
      for (const [id, notification] of notifications) {
        if (notification.issueId === stored.id) notifications.delete(id)
      }
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

    async listProjects(workspaceId, userId?) {
      const rows = [...projects.values()].filter(
        (p) => p.workspaceId === workspaceId
      )
      if (!userId) return rows
      // Members see the whole workspace; Viewer grants scope to their rows.
      if (members.has(memberKey(workspaceId, userId))) return rows
      return rows.filter((p) => projectViewers.has(`${p.id}:${userId}`))
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

    async createComment(input) {
      if (!issues.has(input.issueId)) throw invalid("Issue not found")
      const body = input.body.trim()
      if (!body) throw invalid("Comment body is required")
      const parentId = input.parentId ?? null
      if (parentId !== null) {
        const parent = comments.get(parentId)
        if (!parent) throw invalid("Parent comment not found")
        if (parent.issueId !== input.issueId) {
          throw invalid("Parent comment belongs to another issue")
        }
        if (parent.parentId !== null) {
          throw invalid("Replies cannot nest more than one level")
        }
      }
      const comment: Comment = {
        id: crypto.randomUUID(),
        issueId: input.issueId,
        authorId: input.authorId,
        body,
        parentId,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
      }
      comments.set(comment.id, comment)
      return { ...comment }
    },

    async getComment(commentId) {
      const comment = comments.get(commentId)
      return comment ? { ...comment } : null
    },

    async updateComment(commentId, body) {
      const comment = comments.get(commentId)
      if (!comment) throw notFound("Comment not found")
      if (comment.deletedAt !== null) {
        throw invalid("Cannot edit a deleted comment")
      }
      const trimmed = body.trim()
      if (!trimmed) throw invalid("Comment body is required")
      comment.body = trimmed
      comment.editedAt = new Date().toISOString()
      return { ...comment }
    },

    async softDeleteComment(commentId) {
      const comment = comments.get(commentId)
      if (!comment) throw notFound("Comment not found")
      if (comment.deletedAt !== null) return { ...comment }
      comment.body = ""
      comment.deletedAt = new Date().toISOString()
      return { ...comment }
    },

    async listComments(issueId, opts) {
      const limit = pageLimit(opts?.limit, 20, 50)
      const cursor = decodeCursor(opts?.before)
      const rows = [...comments.values()]
        .filter((comment) => comment.issueId === issueId)
        .filter((comment) => !cursor || isOlderThanCursor(comment, cursor))
        .sort(compareTimelineDesc)
      const page = rows.slice(0, limit)
      const last = page[page.length - 1]
      return {
        comments: page.map((comment) => ({ ...comment })),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      }
    },

    async appendActivity(issueId, input) {
      if (!issues.has(issueId)) throw notFound("Issue not found")
      return recordActivity(
        issueId,
        input.actor,
        input.type,
        input.summary,
        input.payload ?? {}
      )
    },

    async listActivity(issueId) {
      return [...activityEvents.values()]
        .filter((event) => event.issueId === issueId)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) {
            return a.createdAt < b.createdAt ? -1 : 1
          }
          if (a.id === b.id) return 0
          return a.id < b.id ? -1 : 1
        })
        .map((event) => ({ ...event, payload: { ...event.payload } }))
    },

    async listTimeline(issueId, opts) {
      const limit = pageLimit(opts?.limit, 20, 50)
      const cursor = decodeCursor(opts?.before)
      const issueComments = [...comments.values()]
        .filter((comment) => comment.issueId === issueId)
        .filter((comment) => !cursor || isOlderThanCursor(comment, cursor))
        .map((comment) => ({ ...comment }))
      const events = [...activityEvents.values()]
        .filter((event) => event.issueId === issueId)
        .filter((event) => !cursor || isOlderThanCursor(event, cursor))
        .map((event) => ({ ...event, payload: { ...event.payload } }))
      return mergeTimeline(issueComments, events, limit)
    },

    async addWatcher(issueId, userId) {
      if (!issues.has(issueId)) throw notFound("Issue not found")
      const key = watcherKey(issueId, userId)
      if (watchers.has(key)) return
      watchers.set(key, {
        issueId,
        userId,
        createdAt: new Date().toISOString(),
      })
    },

    async removeWatcher(issueId, userId) {
      watchers.delete(watcherKey(issueId, userId))
    },

    async isWatching(issueId, userId) {
      return watchers.has(watcherKey(issueId, userId))
    },

    async listWatcherIds(issueId) {
      return [...watchers.values()]
        .filter((watcher) => watcher.issueId === issueId)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) {
            return a.createdAt < b.createdAt ? -1 : 1
          }
          return a.userId < b.userId ? -1 : 1
        })
        .map((watcher) => watcher.userId)
    },

    async createNotification(input) {
      const notification: Notification = {
        id: crypto.randomUUID(),
        userId: input.userId,
        issueId: input.issueId,
        type: input.type,
        actorType: input.actorType,
        actorId: input.actorId,
        payload: { ...input.payload },
        readAt: null,
        emailedAt: null,
        createdAt: new Date().toISOString(),
      }
      notifications.set(notification.id, notification)
      return { ...notification, payload: { ...notification.payload } }
    },

    async listNotifications(userId, opts) {
      const limit = pageLimit(opts.limit, 30, 100)
      const cursor = decodeCursor(opts.before)
      const rows = [...notifications.values()]
        .filter((notification) => notification.userId === userId)
        .filter(
          (notification) =>
            opts.filter === "all" || notification.readAt === null
        )
        .filter(
          (notification) => !cursor || isOlderThanCursor(notification, cursor)
        )
        .sort(compareTimelineDesc)
      const page = rows.slice(0, limit)
      const last = page[page.length - 1]
      return {
        notifications: page.map((notification) => ({
          ...notification,
          payload: { ...notification.payload },
        })),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      }
    },

    async markNotificationRead(id, userId) {
      const notification = notifications.get(id)
      if (!notification || notification.userId !== userId) return null
      if (notification.readAt === null) {
        notification.readAt = new Date().toISOString()
      }
      return { ...notification, payload: { ...notification.payload } }
    },

    async markAllNotificationsRead(userId) {
      const at = new Date().toISOString()
      let updated = 0
      for (const notification of notifications.values()) {
        if (notification.userId !== userId || notification.readAt !== null) {
          continue
        }
        notification.readAt = at
        updated += 1
      }
      return updated
    },

    async unreadNotificationCount(userId) {
      let count = 0
      for (const notification of notifications.values()) {
        if (notification.userId === userId && notification.readAt === null) {
          count += 1
        }
      }
      return count
    },

    async purgeReadNotifications(olderThan) {
      const cutoff = new Date(olderThan).getTime()
      let removed = 0
      for (const [id, notification] of notifications) {
        if (
          notification.readAt !== null &&
          new Date(notification.createdAt).getTime() < cutoff
        ) {
          notifications.delete(id)
          removed += 1
        }
      }
      return removed
    },

    async getNotificationSettings(userId) {
      return {
        userId,
        emailMode: notificationSettings.get(userId) ?? "digest",
      }
    },

    async setNotificationSettings(userId, emailMode) {
      notificationSettings.set(userId, emailMode)
      return { userId, emailMode }
    },

    async listDigestGroups(cutoff) {
      const cutoffTime = new Date(cutoff).getTime()
      const grouped = new Map<string, Notification[]>()
      for (const notification of notifications.values()) {
        if (notification.readAt !== null || notification.emailedAt !== null) {
          continue
        }
        if (new Date(notification.createdAt).getTime() >= cutoffTime) continue
        // Default digest, and skip owners whose mode opted out.
        if (
          (notificationSettings.get(notification.userId) ?? "digest") !==
          "digest"
        ) {
          continue
        }
        if (!options.users?.[notification.userId]?.email) continue
        const rows = grouped.get(notification.userId) ?? []
        rows.push({ ...notification, payload: { ...notification.payload } })
        grouped.set(notification.userId, rows)
      }
      return [...grouped.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([userId, rows]) => ({
          userId,
          email: options.users?.[userId]?.email ?? "",
          notifications: rows.sort(compareTimelineDesc).reverse(),
        }))
    },

    async markNotificationsEmailed(ids, at) {
      for (const id of ids) {
        const notification = notifications.get(id)
        if (notification) notification.emailedAt = at
      }
    },

    async listMyIssues(userId, tab) {
      // Read scope: every project in a workspace the user belongs to, plus
      // only the Viewer-granted projects themselves.
      const workspaceIds = new Set<string>()
      for (const membership of members.values()) {
        if (membership.userId === userId) {
          workspaceIds.add(membership.workspaceId)
        }
      }
      const projectIds = new Set<string>()
      for (const project of projects.values()) {
        if (
          workspaceIds.has(project.workspaceId) ||
          projectViewers.has(`${project.id}:${userId}`)
        ) {
          projectIds.add(project.id)
        }
      }
      return [...issues.values()]
        .filter((issue) => projectIds.has(issue.projectId))
        .filter((issue) => {
          if (tab === "assigned") return issue.assigneeId === userId
          if (tab === "created") return issue.createdBy === userId
          return watchers.has(watcherKey(issue.id, userId))
        })
        .sort((a, b) => {
          if (a.updatedAt !== b.updatedAt) {
            return a.updatedAt < b.updatedAt ? 1 : -1
          }
          return a.id < b.id ? -1 : 1
        })
        .map(cloneIssue)
    },
  }
}
