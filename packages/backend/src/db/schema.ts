import { sql } from "drizzle-orm"
import {
  boolean,
  foreignKey,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("status_project_name_unique").on(table.projectId, table.name),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("label_workspace_name_unique").on(
      table.workspaceId,
      table.name
    ),
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
  },
  (table) => [primaryKey({ columns: [table.issueId, table.labelId] })]
)

/**
 * GitHub App installs + External Links (T6). Vocabulary per GLOSSARY.md:
 * External Link (never Integration/Sync). An install is workspace-level and
 * scoped to chosen `owner/repo` names; links cache PR title/state from
 * webhook payloads only (no live GitHub reads); merge is badge-only.
 */
export const githubInstall = pgTable("github_install", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  repos: text("repos").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

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
