import { pgParam, rawSql, type RawSqlQuery } from "@neon/realtime/server"
import type {
  ActivityActorType,
  Issue,
  IssueFilters,
  Notification,
} from "../workspaces/store.js"

/**
 * Live SQL for the collaboration surfaces. Every query is read-only and
 * deterministic, and every one carries the signed-in user's authorization in
 * the SQL itself: the API checks the session before sealing, then the live
 * query joins through membership / Viewer grants so revoked access drops rows
 * immediately.
 *
 * The aliases are camelCase because the browser expects the same row shape as
 * the REST API. Realtime returns the PostgreSQL result names verbatim, so the
 * SQL aliases, not an ORM, define the wire shape.
 */

export interface TimelineRow {
  kind: "comment" | "activity"
  id: string
  issueId: string
  authorId: string | null
  body: string | null
  parentId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  actorType: ActivityActorType | null
  actorId: string | null
  type: string | null
  summary: string | null
  payload: Record<string, unknown> | null
}

export interface UnreadCountRow {
  count: number
}

/** Project issues, optionally narrowed by the filter bar. */
export function issuesQuery(
  userId: string,
  projectId: string,
  filters: IssueFilters = {}
): RawSqlQuery<Issue> {
  const statusIds =
    filters.statusIds && filters.statusIds.length > 0
      ? pgParam.array("uuid", filters.statusIds)
      : null
  const priorities =
    filters.priorities && filters.priorities.length > 0
      ? pgParam.array("text", filters.priorities)
      : null
  const labels =
    filters.labels && filters.labels.length > 0
      ? pgParam.array("text", filters.labels)
      : null
  const filterAssignee = filters.assigneeId !== undefined
  const assigneeId = filters.assigneeId ?? null
  const text = filters.text?.trim() ? filters.text.trim() : null

  return rawSql<Issue>(
    `SELECT ${ISSUE_COLUMNS}
     FROM issue i
     JOIN project p ON p.id = i.project_id
     WHERE i.project_id = $2
       AND i.archived = false
       AND ${PROJECT_ACCESS}
       AND ($3::uuid[] IS NULL OR i.status_id = ANY($3::uuid[]))
       AND ($4::text[] IS NULL OR i.priority = ANY($4::text[]))
       AND ($5::boolean = false OR i.assignee_id IS NOT DISTINCT FROM $6::text)
       AND ($7::text[] IS NULL OR i.labels @> $7::text[])
       AND (
         $8::text IS NULL
         OR i.identifier ILIKE '%' || $8::text || '%'
         OR i.title ILIKE '%' || $8::text || '%'
       )
     ORDER BY i.number, i.id`,
    [userId, projectId, statusIds, priorities, filterAssignee, assigneeId, labels, text]
  )
}

/** One issue row by database id, for a deep-linked or archived issue. */
export function issueQuery(userId: string, issueId: string): RawSqlQuery<Issue> {
  return rawSql<Issue>(
    `SELECT ${ISSUE_COLUMNS}
     FROM issue i
     JOIN project p ON p.id = i.project_id
     WHERE i.id = $2
       AND ${PROJECT_ACCESS}`,
    [userId, issueId]
  )
}

/** Newest timeline page: Comments and Activity Events merged by the caller. */
export function timelineQuery(
  userId: string,
  issueId: string,
  limit: number
): RawSqlQuery<TimelineRow> {
  return rawSql<TimelineRow>(
    `SELECT
       'comment'::text AS "kind",
       c.id AS "id",
       c.issue_id AS "issueId",
       c.author_id AS "authorId",
       c.body AS "body",
       c.parent_id AS "parentId",
       c.edited_at AS "editedAt",
       c.deleted_at AS "deletedAt",
       c.created_at AS "createdAt",
       NULL::varchar(16) AS "actorType",
       NULL::text AS "actorId",
       NULL::text AS "type",
       NULL::text AS "summary",
       NULL::jsonb AS "payload"
     FROM comment c
     JOIN issue i ON i.id = c.issue_id
     JOIN project p ON p.id = i.project_id
     WHERE c.issue_id = $2
       AND ${PROJECT_ACCESS}
     UNION ALL
     SELECT
       'activity'::text AS "kind",
       e.id AS "id",
       e.issue_id AS "issueId",
       NULL::text AS "authorId",
       NULL::text AS "body",
       NULL::uuid AS "parentId",
       NULL::timestamptz AS "editedAt",
       NULL::timestamptz AS "deletedAt",
       e.created_at AS "createdAt",
       e.actor_type AS "actorType",
       e.actor_id AS "actorId",
       e.type AS "type",
       e.summary AS "summary",
       e.payload AS "payload"
     FROM activity_event e
     JOIN issue i ON i.id = e.issue_id
     JOIN project p ON p.id = i.project_id
     WHERE e.issue_id = $2
       AND ${PROJECT_ACCESS}
     ORDER BY "createdAt" DESC, "id" DESC
     LIMIT $3::int`,
    [userId, issueId, limit]
  )
}

/** Newest notifications owned by the signed-in user. */
export function notificationsQuery(
  userId: string,
  limit: number
): RawSqlQuery<Notification> {
  return rawSql<Notification>(
    `SELECT
       n.id AS "id",
       n.user_id AS "userId",
       n.issue_id AS "issueId",
       n.type AS "type",
       n.actor_type AS "actorType",
       n.actor_id AS "actorId",
       n.payload AS "payload",
       n.read_at AS "readAt",
       n.emailed_at AS "emailedAt",
       n.created_at AS "createdAt"
     FROM notification n
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $2::int`,
    [userId, limit]
  )
}

/** Rail badge count; the live query keeps it in step with every read/write. */
export function unreadCountQuery(userId: string): RawSqlQuery<UnreadCountRow> {
  return rawSql<UnreadCountRow>(
    `SELECT count(*)::int AS "count"
     FROM notification n
     WHERE n.user_id = $1
       AND n.read_at IS NULL`,
    [userId]
  )
}

const ISSUE_COLUMNS = `i.id AS "id",
       i.project_id AS "projectId",
       i.number AS "number",
       i.key_prefix AS "keyPrefix",
       i.identifier AS "identifier",
       i.title AS "title",
       i.description AS "description",
       i.status_id AS "statusId",
       i.priority AS "priority",
       i.assignee_id AS "assigneeId",
       i.due_date AS "dueDate",
       i.archived AS "archived",
       i.labels AS "labels",
       i.parent_id AS "parentId",
       i.created_by AS "createdBy",
       i.created_at AS "createdAt",
       i.updated_at AS "updatedAt"`

/**
 * Workspace Member or a Viewer grant for this project. Realtime has no RLS
 * support, so this predicate is the authorization boundary for live reads.
 */
const PROJECT_ACCESS = `(
       EXISTS (
         SELECT 1 FROM workspace_member wm
         WHERE wm.workspace_id = p.workspace_id
           AND wm.user_id = $1
       )
       OR EXISTS (
         SELECT 1 FROM project_viewer pv
         WHERE pv.project_id = i.project_id
           AND pv.user_id = $1
       )
     )`
