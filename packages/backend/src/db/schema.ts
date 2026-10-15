import {
  boolean,
  integer,
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
 * (fixed bucket Todo/In Progress/Done), Project Key prefix.
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("issue_identifier_unique").on(table.identifier)]
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

export const timelineEvent = pgTable("timeline_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => issue.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
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

/** Fixed Status Category buckets per GLOSSARY.md. */
export type StatusCategory = "Todo" | "In Progress" | "Done"

/** Priority urgency per GLOSSARY.md. */
export type Priority = "Urgent" | "High" | "Medium" | "Low" | "None"
