import {
  boolean,
  foreignKey,
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
    priority: varchar("priority", { length: 16 })
      .notNull()
      .$type<Priority>(),
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

export type WorkspaceRole = "Owner" | "Admin" | "Member"

/** Fixed Status Category buckets per GLOSSARY.md. */
export type StatusCategory = "Todo" | "In Progress" | "Done"

/** Priority urgency per GLOSSARY.md. */
export type Priority = "Urgent" | "High" | "Medium" | "Low" | "None"
