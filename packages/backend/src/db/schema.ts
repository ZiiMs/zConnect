import { sql } from "drizzle-orm"
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

/**
 * Workspace tenancy (T1 – Workspace + membership foundation).
 * Vocabulary per GLOSSARY.md: Workspace, Member (role Owner/Admin/Member),
 * Project. Per-project Viewer is a grant in `project_viewer`, not a
 * workspace role.
 */
export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: varchar("role", { length: 16 }).notNull().$type<WorkspaceRole>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })]
)

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: varchar("key", { length: 16 }).notNull(),
    icon: varchar("icon", { length: 32 }).notNull().default("Folder"),
    color: varchar("color", { length: 7 }).notNull().default("#94a3b8"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("project_workspace_key_unique").on(
      table.workspaceId,
      table.key
    ),
  ]
)

export const projectViewer = pgTable(
  "project_viewer",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
)

/**
 * Project workflow (T2 – Project + Status workflow). Vocabulary per
 * GLOSSARY.md: Status (ordered step, never Column/State), Status Category
 * (fixed bucket Backlog/Unstarted/In Progress/Completed/Canceled/Duplicate),
 * Project Key prefix.
 */
export const status = pgTable(
  "status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: varchar("category", { length: 16 })
      .notNull()
      .$type<StatusCategory>(),
    color: varchar("color", { length: 7 }).notNull().default("#94a3b8"),
    position: integer("position").notNull(),
    /** Short guidance shown under the status name in Workflow settings. */
    description: text("description"),
    /**
     * The status new Issues start in. One per Project; the partial unique
     * index below enforces that at the database level.
     */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("status_project_name_unique").on(table.projectId, table.name),
    uniqueIndex("status_project_default_unique")
      .on(table.projectId)
      .where(sql`${table.isDefault}`),
  ]
)

/**
 * Per-project issue number sequence. One row per project, starting at 1;
 * T3's issue creation consumes numbers from it so identifiers form KEY-N.
 */
export const projectSequence = pgTable("project_sequence", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => project.id, { onDelete: "cascade" }),
  nextNumber: integer("next_number").notNull().default(1),
})

/**
 * Issue lifecycle (T3 – Issue lifecycle + List view). Vocabulary per
 * GLOSSARY.md: Issue (never Task/Ticket), Priority
 * (Urgent|High|Medium|Low|None), single nullable assignee.
 *
 * `keyPrefix` + `number` + `identifier` (KEY-N) are frozen at creation:
 * moving the Issue between Projects updates `projectId` only, so the
 * human identifier stays stable for Git references.
 */
export const issue = pgTable(
  "issue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    identifier: text("identifier").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    statusId: uuid("status_id")
      .notNull()
      .references(() => status.id, { onDelete: "restrict" }),
    priority: varchar("priority", { length: 16 }).notNull().$type<Priority>(),
    assigneeId: text("assignee_id"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    labels: text("labels").array().notNull().default([]),
    /**
     * T5 Subtask link: nullable parent Issue id, one level only (a Subtask
     * cannot itself have subtasks). Cleared when the parent is hard-deleted.
     * Table-level FK (not inline) so the self reference typechecks.
     */
    parentId: uuid("parent_id"),
    /** Author of the issue; null for agent/system creates and seeds. */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("issue_identifier_unique").on(table.identifier),
    foreignKey({
      name: "issue_parent_id_issue_id_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  ]
)

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: varchar("role", { length: 16 }).notNull().$type<WorkspaceRole>(),
    invitedBy: text("invited_by").notNull(),
    /** Created + 7 days; the route rejects expired invitations. */
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("invitation_workspace_email_unique").on(
      table.workspaceId,
      table.email
    ),
  ]
)

/**
 * Workspace-shared Label registry (T5 – Labels + Subtasks + archive).
 * One row per workspace + name, reusable across Projects; `issue.labels`
 * (T3 free-form text[]) stays as the read-compatible name list while
 * `issue_label` links carry the registry identity (color, rename/delete
 * propagation).
 */
export const label = pgTable(
  "label",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: varchar("color", { length: 7 }).notNull().default("#94a3b8"),
    /** Optional explanation shown in the workspace Labels table. */
    description: text("description"),
    /**
     * Optional group parent. One level only: a child label cannot itself be
     * a parent. Deleting the parent promotes children to top level.
     */
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("label_workspace_name_unique").on(
      table.workspaceId,
      table.name
    ),
    foreignKey({
      name: "label_parent_id_label_id_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  ]
)

export const issueLabel = pgTable(
  "issue_label",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => label.id, { onDelete: "cascade" }),
    /** When this label was last attached to the issue (Settings "Last applied"). */
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.issueId, table.labelId] })]
)

/**
 * GitHub Connection (ADR-0005): one OAuth App authorization per Workspace.
 * `encryptedAccessToken` is the versioned AES-256-GCM payload; it is never
 * returned by the API. `login` is display/audit only.
 */
export const githubConnection = pgTable("github_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .unique()
    .references(() => workspace.id, { onDelete: "cascade" }),
  connectorUserId: text("connector_user_id").notNull(),
  connectorAccountId: text("connector_account_id").notNull(),
  login: text("login").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  status: varchar("status", { length: 32 })
    .notNull()
    .default("active")
    .$type<"active" | "reconnect_required">(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastManualRefreshAt: timestamp("last_manual_refresh_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

/**
 * Workspace repository allowlist. `githubId` is GitHub's immutable database
 * id; `fullName` is mutable and repaired on rename/transfer.
 */
export const githubRepository = pgTable(
  "github_repository",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => githubConnection.id, { onDelete: "cascade" }),
    githubId: text("github_id").notNull(),
    fullName: text("full_name").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    private: boolean("private").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    issuesEnabled: boolean("issues_enabled").notNull().default(true),
    defaultBranch: text("default_branch"),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    selectedAt: timestamp("selected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncError: text("sync_error"),
  },
  (table) => [
    uniqueIndex("github_repository_connection_github_id_unique").on(
      table.connectionId,
      table.githubId
    ),
  ]
)

/** Many-to-many: which allowlisted repositories each Project presents. */
export const projectRepository = pgTable(
  "project_repository",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => githubRepository.id, { onDelete: "cascade" }),
    linkedBy: text("linked_by").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.repositoryId] })]
)

/** Cached Pull Request snapshots for the read-only GitHub View. */
export const githubPullRequest = pgTable(
  "github_pull_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => githubRepository.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: varchar("state", { length: 16 })
      .notNull()
      .$type<"open" | "merged" | "closed">(),
    draft: boolean("draft").notNull().default(false),
    authorLogin: text("author_login").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    url: text("url").notNull(),
    sourceBranch: text("source_branch").notNull(),
    targetBranch: text("target_branch").notNull(),
    checksState: varchar("checks_state", { length: 16 }),
    reviewDecision: varchar("review_decision", { length: 32 }),
    commentCount: integer("comment_count").notNull().default(0),
    bodyExcerpt: text("body_excerpt"),
    githubCreatedAt: timestamp("github_created_at", {
      withTimezone: true,
    }).notNull(),
    githubUpdatedAt: timestamp("github_updated_at", {
      withTimezone: true,
    }).notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("github_pull_request_repository_number_unique").on(
      table.repositoryId,
      table.number
    ),
    index("github_pull_request_repository_state_updated_idx").on(
      table.repositoryId,
      table.state,
      table.githubUpdatedAt
    ),
  ]
)

/** Cached GitHub Issue snapshots. Never imported as zConnect Issues. */
export const githubIssue = pgTable(
  "github_issue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => githubRepository.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: varchar("state", { length: 16 })
      .notNull()
      .$type<"open" | "closed">(),
    authorLogin: text("author_login").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    url: text("url").notNull(),
    labels: jsonb("labels")
      .$type<Array<{ name: string; color: string }>>()
      .notNull()
      .default([]),
    assignees: jsonb("assignees")
      .$type<Array<{ login: string; avatarUrl: string | null }>>()
      .notNull()
      .default([]),
    commentCount: integer("comment_count").notNull().default(0),
    bodyExcerpt: text("body_excerpt"),
    githubCreatedAt: timestamp("github_created_at", {
      withTimezone: true,
    }).notNull(),
    githubUpdatedAt: timestamp("github_updated_at", {
      withTimezone: true,
    }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("github_issue_repository_number_unique").on(
      table.repositoryId,
      table.number
    ),
    index("github_issue_repository_state_updated_idx").on(
      table.repositoryId,
      table.state,
      table.githubUpdatedAt
    ),
  ]
)

export const externalLink = pgTable(
  "external_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 16 }).notNull().default("github"),
    kind: varchar("kind", { length: 16 }).notNull(),
    url: text("url").notNull(),
    title: text("title"),
    state: varchar("state", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("external_link_issue_url_unique").on(table.issueId, table.url),
    index("external_link_url_idx").on(table.url),
  ]
)

/**
 * Collaboration core (R1/R2): Comments, Activity Events, Watchers,
 * Notifications, and per-user notification settings. Comments are never
 * Activity Events; the two meet only in the merged timeline.
 */
export const comment = pgTable(
  "comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    /** "" once soft-deleted (tombstone row). */
    body: text("body").notNull(),
    /** One level only: parent must be top-level on the same issue. */
    parentId: uuid("parent_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "comment_parent_id_comment_id_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("cascade"),
  ]
)

export const activityEvent = pgTable("activity_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => issue.id, { onDelete: "cascade" }),
  actorType: varchar("actor_type", { length: 16 }).notNull(),
  actorId: text("actor_id"),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const issueWatcher = pgTable(
  "issue_watcher",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("issue_watcher_issue_user_unique").on(
      table.issueId,
      table.userId
    ),
  ]
)

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => issue.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actorType: varchar("actor_type", { length: 16 }).notNull(),
  actorId: text("actor_id"),
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  /** Set when an email covering this row was sent; drives digest dedupe. */
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const userNotificationSettings = pgTable("user_notification_settings", {
  userId: text("user_id").primaryKey(),
  emailMode: varchar("email_mode", { length: 16 }).default("digest").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

/** Processed webhook delivery ids for idempotent redelivery handling. */
export const webhookDelivery = pgTable("webhook_delivery", {
  deliveryId: text("delivery_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export type WorkspaceRole = "Owner" | "Admin" | "Member"

/** Fixed Status Category buckets per GLOSSARY.md, in roster order (ADR-0001). */
export type StatusCategory =
  | "Backlog"
  | "Unstarted"
  | "In Progress"
  | "Completed"
  | "Canceled"
  | "Duplicate"

/** Priority urgency per GLOSSARY.md. */
export type Priority = "Urgent" | "High" | "Medium" | "Low" | "None"

/**
 * Workspace-scoped agent token (T7 – MCP server). One row per token issued
 * from workspace settings: only the SHA-256 `hash` is stored (show-once
 * plaintext), `prefix` identifies the token in settings lists. A token acts
 * with Member-level access scoped to its workspace via the MCP route.
 */
export const workspaceToken = pgTable(
  "workspace_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hash: text("hash").notNull(),
    prefix: varchar("prefix", { length: 16 }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("workspace_token_hash_unique").on(table.hash)]
)
