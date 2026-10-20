# ADR-0003: Collaboration model — comments, activity, watchers, notifications

Status: Accepted (collaboration core spec, 2026-10-20). Supersedes the "Home ships
disabled with Dashboard (soon)" clause of ADR-0001. Realtime clause superseded by
ADR-0004 (Neon Realtime replaces backend-mediated SSE).

## Context

zConnect let a team describe work but not discuss it. There was no comment, no truthful
issue history, no way to tell someone work landed on them, and no path from an invitation
to membership. The next release turns a write-only board into a loop: a Member comments,
the issue records what changed, Watchers hear about it, and the Inbox closes the loop.

The shape has to survive three writers — the REST API, the MCP server, and the GitHub
webhook worker — without each inventing its own history or notification rules.

## Decision

### Comments

- A Comment belongs to one Issue, has a markdown body and an author, and supports exactly
  **one level of replies**. A reply's parent must be on the same Issue and must itself be
  top-level.
- Authors edit their own Comments; an edited marker is the only edit history.
- Authors and workspace Owner/Admin delete. Soft delete clears the body and keeps a
  tombstone so replies keep their place.
- Read follows Issue read (workspace Member or a Viewer grant for that project); write
  requires workspace Member or above. Viewers never write and are not mentionable.

### Activity

- `activity_event` replaces `timeline_event` and is the single history ledger. Types cover
  creation, status, assignee, priority, due date, title, description, labels, parent,
  project, archive/unarchive, and `github.*` external link events.
- The **store layer is the single emitter**: mutating methods take an explicit actor, so
  REST, MCP, and the GitHub worker converge. MCP attributes an agent token; system work
  attributes `system`; GitHub attributes `github`.
- Payloads carry scalar old/new values only — never description bodies. Description
  autosaves coalesce to at most one event per actor per issue per 15 minutes.
- Comments do not produce Activity Events.
- Existing `timeline_event` rows migrate as `github.*`; nothing else is backfilled.

### Timeline read

Comments and Activity are stored separately and merged at read time into one
cursor-paginated discriminated union, newest first. The merge is a read concern, not a
second write path. The external-link section keeps its badges and manual paste; its event
list moves into the feed.

### Watchers and notifications

- Auto-watch on create, assignment, comment, and mention. Manual watch/unwatch is
  idempotent. Unassignment does not unwatch.
- Notification triggers: assignment, unassignment, mention, comment or reply on a watched
  issue, status change on a watched issue. The actor is suppressed. A mentioned watcher
  gets one row, not two.
- Comment, priority, due date, title, description, labels, archive, and GitHub events do
  not notify.
- Fan-out is synchronous at write time; email is queued. In-app rows are the source of
  truth and are never suppressed by email mode.
- Notifications are visible only to their owner. Read rows purge after 90 days.

### Mentions

Mentions are markdown links with a `mention:` scheme, inserted by autocomplete over
workspace Members who can read the Issue. The server parses them on comment **create**,
validates membership, dedupes, notifies, and auto-watches. Self-mentions do nothing, edits
do not re-notify, and invalid or unauthorized mentions render as plain text. A Viewer or
outsider is never mentionable, so mentions cannot leak work.

### Email

A `Mailer` port with an SMTP adapter. Modes: `immediate`, `digest` (default: mentions and
assignments immediate, everything else batched every 30 minutes grouped by issue), and
`off`. Invitative email is always immediate and is not a notification. A deployment with
no SMTP configuration still works through the copy-link invite path.

### Invitations

Invitations expire after seven days. The accept page requires a session whose email
matches the invitation and shows workspace, inviter, and role. R1 adds no resend or revoke
UI.

### My Issues

The disabled Home entry becomes **My Issues**: Assigned, Created, and Watched tabs across
the user's workspaces and project grants, sorted by `updatedAt`. No dashboard, charts, or
"Recent" tab.

### MCP

Agents may read comments for an issue in their token workspace (`comment.list`), with
pagination and tombstones. They get no comment write surface until agent identity and
notification semantics exist.

## Consequences

- Both stores must implement the same collaboration surface and the same diff/fan-out
  rules, or type checking and contract tests fail.
- Read permissions on comments and activity are the Issue read permission; there is no
  separate comment ACL.
- Realtime is backend-sealed live SQL (Neon Realtime, ADR-0004); polling (30 s and on focus) remains the
  fallback for issue lists, timeline, and the unread badge.
- ADR-0001's third rail item is replaced: Home is now My Issues, not a disabled
  Dashboard.
