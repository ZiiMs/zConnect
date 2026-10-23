# ADR-0003: Comments, activity events, and notifications

Status: Accepted (grill rounds 1–4, 2026-10-20). Supersedes the “Home ships
disabled” clause of ADR-0001.

## Context

Issues could be described but not discussed. `timeline_event` existed only for
GitHub webhook output, so human history — who changed status, assignee,
priority, or body — had nowhere to live. Nothing told a person that they were
assigned, mentioned, or that a watched issue moved.

## Decision

### Comments

`comment` is its own table: `issueId`, `authorId`, `body` (markdown),
`parentId` (one level of replies), `editedAt`, `deletedAt`, `createdAt`.
Comments are not activity events and do not write activity rows; the timeline
merges both by timestamp. Soft delete clears the body and keeps a tombstone.
Authors edit and delete their own; Owner/Admin delete any. Viewers read but do
not write.

### Activity

`activity_event` replaces `timeline_event`: `issueId`, `actorType`
(`user | agent | system | github`), nullable `actorId`, `type`, `summary`,
`payload` jsonb, `createdAt`. GitHub rows keep their history as `github.*`
types. Events are written in the store layer so REST, MCP, and the GitHub
worker all emit. Payloads carry field-level changes (`from`/`to`, label
additions/removals) but never description bodies. Description autosaves are
coalesced to one event per actor per issue per 15 minutes. Comments and
activity share one cursor-paginated read endpoint.

### Watchers and notifications

`issue_watcher` is the watch state: a member watches an issue. Auto-watch on
create, assignment, comment, and mention; manual watch/unwatch; unassignment
does not unwatch. `notification` rows are per user per event with `type`,
`issueId`, `actorType`/`actorId`, `readAt`, `createdAt`. Triggers are
assignment/unassignment, mention, comment/reply on a watched issue, and status
change on a watched issue. Self-actions are suppressed; a mention wins over
watcher delivery. Email is a delivery mode (`immediate | digest | off`) on a
`user_notification_settings` row, never a separate notification store.

### Mentions

Mentions are markdown links with a `mention:` scheme, inserted by autocomplete
over members who can read the project. The server validates access on comment
create, dedupes, and notifies. Edits do not notify. Viewers cannot be
mentioned. Agents do not comment; R2 adds read-only `comment.list` to MCP.

### My Issues

`issue.createdBy` is added (nullable; legacy rows unknown; agent-created rows
null). Home becomes My Issues: Assigned, Created, Watched, cross-project. This
supersedes ADR-0001’s decision to ship Home disabled with “Dashboard (soon)”;
no dashboard is planned.

## Consequences

- One history surface instead of a GitHub-only timeline plus a human one.
- Notification fan-out is synchronous; email is queued on the existing worker.
- The browser no longer talks to Postgres directly (ADR-0002), so the inbox
  and timelines poll instead of subscribing.
- The `Milestone` term stays reserved for the deferred product concept;
  delivery cuts are Releases (R1, R2).

Implementation: [#23](https://github.com/ZiiMs/zConnect/issues/23) (R1) and
[#24](https://github.com/ZiiMs/zConnect/issues/24) (R2).
