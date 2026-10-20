# Collaboration core — implementation contracts (R1/R2)

Working agreement for the agents implementing GitHub issue #39. Every worker reads this
file first. It fixes the shared types, route shapes, and file ownership so parallel work
cannot drift. If a detail here is wrong, report it to the coordinator instead of silently
choosing a different shape.

Vocabulary is `GLOSSARY.md`: **Comment**, **Activity**, **Activity Event**, **Watcher**,
**Notification**, **Inbox**, **Mention**. Never introduce synonyms.

## 1. Domain types (`packages/backend/src/workspaces/store.ts`)

```ts
export type ActivityActorType = "user" | "agent" | "system" | "github"

/** Who performed a mutation. Every issue mutator accepts one. */
export interface Actor {
  type: "user" | "agent" | "system"
  id: string | null
  /** Display label for agent/system actors (token name, "System"). */
  name?: string | null
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null }

export interface Comment {
  id: string
  issueId: string
  authorId: string
  body: string            // "" once soft-deleted
  parentId: string | null // one level: parent must be top-level, same issue
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
```

`Issue` gains `createdBy: string | null`. `Membership` gains
`email?: string | null`. `Invitation` gains `expiresAt: string`.

### Timeline union

```ts
export type TimelineItem =
  | ({ kind: "comment" } & Comment)
  | ({ kind: "activity" } & ActivityEvent)
```

Items are returned **newest first**, sorted by `createdAt` descending and then `id`
descending (string compare). `nextCursor` is an opaque string that means "strictly older
than this item"; `null` when exhausted. Encode as base64url of `${createdAt}|${id}`.
Pages default to 20 items, max 50.

### Activity event types and payloads

Types (exact strings):

| type | when | payload |
| --- | --- | --- |
| `issue.created` | REST/MCP create (not seed) | `{ identifier, title }` |
| `issue.status_changed` | status id changed | `{ fromStatusId, toStatusId }` |
| `issue.assignee_changed` | assignee changed | `{ fromAssigneeId, toAssigneeId }` |
| `issue.priority_changed` | priority changed | `{ from, to }` |
| `issue.due_date_changed` | due date changed | `{ from, to }` (ISO or null) |
| `issue.title_changed` | title changed | `{ from, to }` |
| `issue.description_changed` | description changed | `{ changed: true }` only |
| `issue.labels_changed` | label set changed | `{ added: string[], removed: string[] }` |
| `issue.parent_changed` | parent changed | `{ from, to }` (identifiers or null) |
| `issue.moved` | project id changed | `{ fromProjectId, toProjectId }` |
| `issue.archived` / `issue.unarchived` | archived flag changed | `{ archived: boolean }` |
| `github.<kind>` | migrated/live GitHub link event | `{ kind }` and summary = old body |

`summary` is a short human phrase (`"changed status"`, `"created the issue"`,
`"changed the owner"` etc.). The UI composes old/new values from `payload`; it must not
parse `summary` for them. Description payloads never carry the body. A PATCH that changes
nothing emits nothing. Comment writes emit no Activity Event.

Description coalescing: at most one `issue.description_changed` per `(issueId, actorType,
actorId)` per 15 minutes. On a later autosave inside the window, skip the new event (the
issue row still updates). Implement with the newest matching event's `createdAt`.

### Notification types

`issue.assigned`, `issue.unassigned`, `comment.mention`, `comment.created`,
`issue.status_changed`.

`payload` always carries `{ issueIdentifier, issueTitle, workspaceId }`; comment rows add
`{ commentId, parentId, excerpt }` (excerpt max 140 chars) and `{ replyToCommentId }` when
the target is a reply; assignment/status rows carry `{ from, to }` as applicable and
`{ actorName }` when known.

## 2. Store contract additions

```ts
createIssue(projectId: string, input: CreateIssueInput, actor?: Actor): Promise<Issue>
updateIssue(ref: string, input: UpdateIssueInput, actor?: Actor): Promise<Issue>
deleteIssue(ref: string, actor?: Actor): Promise<void>
listProjects(workspaceId: string, userId?: string): Promise<Project[]>
listMembers(workspaceId: string): Promise<Membership[]> // email populated when available

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
  input: { actor: Actor; type: string; summary: string; payload?: Record<string, unknown> }
): Promise<ActivityEvent>
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
  input: Pick<Notification, "userId" | "issueId" | "type" | "actorType" | "actorId"> & {
    payload: Record<string, unknown>
  }
): Promise<Notification>
listNotifications(
  userId: string,
  opts: { filter: "all" | "unread"; limit?: number; before?: string }
): Promise<{ notifications: Notification[]; nextCursor: string | null }>
markNotificationRead(id: string, userId: string): Promise<Notification | null>
markAllNotificationsRead(userId: string): Promise<number>
unreadNotificationCount(userId: string): Promise<number>
purgeReadNotifications(olderThan: string): Promise<number>
getNotificationSettings(userId: string): Promise<NotificationSettings>
setNotificationSettings(userId: string, emailMode: EmailMode): Promise<NotificationSettings>
listDigestGroups(cutoff: string): Promise<
  { userId: string; email: string; notifications: Notification[] }[]
>
markNotificationsEmailed(ids: string[], at: string): Promise<void>

listMyIssues(userId: string, tab: "assigned" | "created" | "watched"): Promise<Issue[]>
```

`createComment` validation (throw `invalid`, mapped to 400):
unknown issue; empty/whitespace body; parent unknown, different issue, or itself a reply.
`updateComment` clears nothing else and sets `editedAt`; empty body is invalid.
`softDeleteComment` sets `deletedAt` and empties `body`, idempotent.

`createIssue` sets `createdBy = actor.type === "user" ? actor.id : null`. Seeds keep
`createdBy: null` and emit no event.

`listNotifications` returns newest first, `limit` default 30 max 100, `before` cursor same
encoding as timeline. `markNotificationRead` returns `null` when the row is not owned by
`userId` (route maps to 404, never exposes another user's row).

`listDigestGroups(cutoff)`: unread notifications with `emailedAt IS NULL` and
`createdAt < cutoff` whose owner's email mode is `digest`; group by user, join the auth
user email; skip users with no email. `markNotificationsEmailed` stamps `emailedAt`.

## 3. HTTP contracts

All routes require a session (`401`). Permission failures are `403`; missing rows `404`.
Issue read permission = workspace Member **or** a Viewer grant for that issue's project.
Issue write permission = workspace Member or above (Viewer grants are read-only).

### Comments and timeline

- `POST /api/issues/:key/comments` — body `{ body: string, parentId?: string | null }`.
  Requires issue write. `201` Comment. Empty body `400`. Bad parent `400`.
- `PATCH /api/comments/:id` — body `{ body: string }`. Author only (`403` otherwise).
  `200` Comment with `editedAt`.
- `DELETE /api/comments/:id` — author, or workspace Owner/Admin of the issue's workspace.
  `200` tombstone Comment (`body: ""`, `deletedAt` set).
- `GET /api/issues/:key/timeline?limit=&before=` — requires issue read.
  `200 { items: TimelineItem[], nextCursor: string | null }`.

Comment routes return the raw store Comment; the frontend resolves `authorId` against the
workspace member list it already loads. Timeline items likewise.

### Watch

- `GET /api/issues/:key/watch` → `{ watching: boolean }`
- `POST /api/issues/:key/watch` → `{ watching: true }` (idempotent)
- `DELETE /api/issues/:key/watch` → `{ watching: false }` (idempotent)

All require issue read for GET and issue write for POST/DELETE.

### Invitations

- `POST /api/workspaces/:id/invites` (Owner/Admin) now returns
  `{ ...invitation, expiresAt, mailSent: boolean, acceptUrl?: string }`.
  `acceptUrl` is returned whenever mail is **not** sent; it may also be returned when sent.
  Expiry = created + 7 days.
- `GET /api/invitations/:id` — session email must match (case-insensitive) else `403`;
  expired `410`; unknown `404`. Returns
  `{ id, email, role, expiresAt, workspace: { id, name }, inviter: { id, name?, email? } }`.
- `POST /api/invitations/:id/accept` — same email/expiry gates; creates membership,
  deletes the invitation, returns the Membership. Already a member: succeeds and deletes.

### Notifications

- `GET /api/notifications?filter=all|unread&limit=&before=` →
  `{ notifications: Notification[], nextCursor, unreadCount }`.
  Enrich each row with `actorName` in `payload` when the store can resolve it.
- `POST /api/notifications/:id/read` → `200` Notification, `404` for another user's row.
- `POST /api/notifications/read-all` → `{ updated: number }`.
- `GET /api/notifications/unread-count` → `{ count: number }`.

### My Issues and settings

- `GET /api/me/issues?tab=assigned|created|watched` (default `assigned`) → `MyIssue[]`,
  sorted by `updatedAt` descending. Scope: every workspace the user belongs to, plus
  granted projects for Viewers.
- `GET /api/me/notification-settings` → `{ emailMode }` (default `digest`)
- `PATCH /api/me/notification-settings` body `{ emailMode }` → `{ emailMode }`
- `GET /api/me/issues` is available to Viewers and Members; unauthenticated `401`.

### MCP

- Add `comment.list`, params `{ ref, limit?, before? }`. Resolve the issue, require
  `project.workspaceId === token.workspaceId` (`403` otherwise). Return
  `{ comments: Array<Comment & { deleted: boolean }>, nextCursor }` newest first,
  tombstone rows with `deleted: true` and `body: ""`.
- `issue.create` and `issue.update` pass
  `{ type: "agent", id: token.id, name: token.name }` to the store.
- No comment write tools.

## 4. Fan-out rules (`packages/backend/src/workspaces/notify.ts`)

Called by REST and MCP after a successful mutation; GitHub events never notify.

**Auto-watch**: issue creator, new assignee, comment author, mentioned member.

**Issue update**
- `issue.assigned` → new assignee if different from actor.
- `issue.unassigned` → old assignee if different from actor.
- `issue.status_changed` → every watcher except the actor.
- Other fields → no notification.
- Reassignment notifies both old and new. Unassignment does not remove the watcher.

**Comment create**
- Recipients in precedence order, one notification per user: mentioned (not the author,
  not unauthorized) → `comment.mention`; parent author (when a reply and not the author)
  → `comment.created` with `replyToCommentId`; then every watcher except the author →
  `comment.created`.
- Self-mentions and author notifications are dropped.
- Editing a comment never notifies.

Eligible mention = a real workspace membership of the issue's project workspace. A
Viewer-only grant is not mentionable. Mention tokens are markdown links
`[@Display Name](mention:<userId>)`; parse with
`/@?\[([^\]]+)\]\(mention:([^)\s]+)\)/g` (accept optional leading `@`), dedupe by id.

**Email** (`packages/backend/src/lib/mailer.ts`):
- `Mailer` = `{ send(message: { to, subject, text, html? }): Promise<void> }`.
- Mode `off`: no mail. Mode `immediate`: every notification mails now. Mode `digest`
  (default): `comment.mention` and `issue.assigned` mail now; everything else waits for
  the digest job. In-app rows are never suppressed by mode.
- Immediate mail failure is logged, never fails the HTTP mutation.
- Recipient addresses come from `store.listMembers(workspaceId)` (`email`).

## 5. Worker job functions

Extract processors so they can be tested without BullMQ:

```ts
// packages/backend/src/notifications/digest.ts
export async function runDigestJob(deps: {
  store: WorkspaceStore
  mailer: Mailer | null
  now?: Date
}): Promise<{ users: number; notifications: number }>
```

- Cutoff `now - 30 minutes`; skip empty groups; group a user's rows by issue; one email
  per user with per-issue sections, each carrying the issue identifier/title and a link;
  include a settings/unsubscribe link built from `FRONTEND_URL`.
- Mark only the included notifications emailed. Purge read notifications older than 90
  days in the same run.
- Wire a repeatable `digest` queue job every 30 minutes on the existing worker.
- GitHub handler writes `github.*` Activity Events through
  `workspaces.appendActivity(..., actor { type: "github", id: null })`; remove the old
  GitHubStore timeline methods and the GitHub timeline route.

## 6. Security

- No `@supabase/supabase-js` in either package manifest or source.
- Delete `packages/frontend/src/lib/supabase.ts`,
  `packages/frontend/src/hooks/use-realtime.ts`,
  `packages/frontend/src/hooks/use-issue-subscription.ts`, and
  `packages/backend/src/lib/supabase.ts`.
- Realtime is backend-sealed live SQL (Neon Realtime: `POST
  /api/realtime/queries/*` seal one deterministic query per project, issue, or user
  scope; the browser subscribes over WebSocket). Live rows are authoritative snapshots;
  the browser still has no database access. Issue lists/detail, timeline, and the unread badge keep polling at
  30 s and on window focus as the fallback; the `updatedAt` conflict banner stays.
- Migration enables RLS (deny-all, no policies) on every `public` table (auth tables
  included). The backend connects as the table owner or a `BYPASSRLS` role; document this.
- Static test asserts the dependency and import are gone from both packages.
