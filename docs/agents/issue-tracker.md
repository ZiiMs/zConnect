# Issue tracker: GitCafe

Issues and specs for this repo live in **GitCafe** at [`ziim/zConnect`](https://git.cafe/ziim/zConnect).
Use the **`git-cafe` MCP tools** for all operations — there is no CLI equivalent configured here.

> **This repo uses GitCafe, not Plane.** Some agents carry a personal `AGENTS.md` that
> mandates Plane for work items. For this repository, the guidance below wins.

## Precondition: sign in

The `git-cafe` MCP connection **must be OAuth-signed-in** before any of this works.
`zConnect` is private, and without sign-in:

- read tools cover public repositories only — a private repo looks identical to a missing one
- every write tool (and `get_me`) returns HTTP 401

Sign in with `get_me`, which triggers the OAuth flow. Do this first; don't mistake a 401 or a
"does not exist or is not public" error for a missing issue.

## Conventions

All issue tools take `owner: "ziim"` and `repo: "zConnect"`.

- **Create an issue**: `create_issue` with `title`, `description`, optional `state`,
  `priority` (0–4), `labelIds`, `assigneeIds`, `milestoneId`, `dueDate`.
- **Read an issue**: `issue_read` with `issue` (number) and `facet: "detail"`, or
  `facet: "comments"` for its conversation.
- **List issues**: `list_issues` with optional `state` and `q` (text search). Pages are
  bounded (max 50); follow the `after` cursor for more.
- **Edit / close / reopen**: `update_issue` with `action: "edit" | "close" | "reopen"`.
- **Comment**: `add_comment` with `target: "issue"` and `input.body`.
- **Edit a comment**: `update_comment`.

### States

GitCafe's issue state is Linear-shaped, not GitHub-shaped:

`triage` → `backlog` → `unstarted` → `started` → `completed` | `canceled`

`create_issue` may open in `triage`, `backlog`, `unstarted`, or `started`.
Only `update_issue` with `action: "close"` sets `completed` or `canceled`.

### Concurrency: `expectedVersion` is required

Every `update_issue` call must pass `input.expectedVersion`. This is optimistic locking — the
write fails if the issue changed since you read it. Read the issue immediately before editing,
and on a version conflict re-read rather than retrying blindly.

### Do not auto-retry

The write tools are documented as "Do not automatically retry an unknown outcome." If a
create/update/comment call fails in a way that leaves its result unclear, **stop and check**
(`issue_read`, `list_issues`) before issuing it again. Duplicate issues and comments are worse
than a slow confirmation.

## Labels and milestones

There is **no MCP tool for creating or listing labels or milestones.** They are managed in the
GitCafe web UI, and the API references them by **ID** (`labelIds`, `assigneeIds`, `milestoneId`),
not by name. See `triage-labels.md` for the triage vocabulary and its ID mapping.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same triage labels via `list_pull_requests`,
`pull_request_read`, `get_pull_request_diff`, `submit_review`, and `add_comment` with a
`target` of `"pull"`, `"pull_inline"`, or `"pull_reply"`.

## When a skill says "publish to the issue tracker"

Create a GitCafe issue with `create_issue`, then return its number.

## When a skill says "fetch the relevant ticket"

Read it with `issue_read` (add `facet: "comments"` when the conversation matters).

## Wayfinding operations

Used by `/wayfinder`. GitCafe exposes no sub-issue or dependency tools, so the **map** and its
**children** are linked by body convention.

- **Map**: a single issue titled after the effort, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue whose body opens with `Part of #<map>` and carries a `Type:` line
  (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: a `Blocked by: #<n>, #<n>` line near the top of the child body. A ticket is
  unblocked when every issue it lists is `completed` or `canceled`.
- **Frontier**: list open children of the map, drop any that are blocked or already assigned;
  lowest issue number wins.
- **Claim**: assign the ticket to yourself with `update_issue` (pass the current
  `expectedVersion`). This is the session's first write.
- **Resolve**: `add_comment` with the answer, then `update_issue` with `action: "close"`, then
  append a context pointer (gist + link) to the map's Decisions-so-far.
