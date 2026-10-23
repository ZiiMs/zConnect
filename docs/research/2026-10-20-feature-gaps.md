# Feature gap analysis: zConnect vs Linear, Plane, and Jira

Date: 2026-10-20
Scope: `packages/backend`, `packages/frontend` at `88a42ce` plus the working tree.
Method: code audit of this repo, compared against first-party product documentation
for Linear, Plane, and Jira. Every competitor claim below links to the official page
that owns it; no blogs or third-party comparisons were used.

## Verdict

zConnect is already a **good issue tracker**. It has the hard parts most clones skip:
a real workflow model, three working views, realtime conflict handling, GitHub links,
and an MCP server.

It is not yet a **team coordination tool**. The missing pieces are not more fields or
more views — they are the social layer (discussion, notification, belonging) and the
cross-project layer (find my work, search everything, save a shared lens). Every one
of Linear, Plane, and Jira ships those, and their absence is what makes a tracker feel
like a demo instead of a place a team works.

The single most valuable next feature is **comments with an activity timeline**.
The second is **notifications and an inbox**. The third is **My Issues plus workspace
search**. Build those three before cycles, roadmaps, or automation.

## What ships today

| Area | Implemented | Evidence |
| --- | --- | --- |
| Tenancy | Workspace, Owner/Admin/Member, invites, per-project Viewer grants | `db/schema.ts:20-79`, `workspaces/routes.ts:177-258` |
| Projects | Name, key, icon, color, per-project workflow | `db/schema.ts:44-65` |
| Workflow | Six status categories, custom statuses, delete guardrails | `db/schema.ts:87-107`, ADR-0001 |
| Issues | Title, markdown body, status, priority, assignee, due date, labels, archive/restore, hard delete | `db/schema.ts:129-170`, `workspaces/routes.ts:538-668` |
| Subtasks | One level, completion warnings | `issue.parentId`, `routes.ts:599-607` |
| Views | List, Table, Kanban (drag-drop), filters, presets | `project-issues.tsx:34-57`, `kanban-board.tsx:166` |
| Filter persistence | Per-user, per-project `localStorage` | `issue-filter-bar.tsx:93-98` |
| Realtime | Per-project Supabase subscription, last-write-wins, conflict banner | `use-issue-subscription.ts:51` |
| GitHub | App installs, PR/branch/commit links, webhook worker, idempotency | `github/*`, `worker.ts` |
| Agent access | MCP server with workspace tokens: `issue.list/get/create/update`, `project.list` | `mcp/routes.ts:66-84` |
| Auth | Better Auth, email/password + Google | `lib/auth.ts` |
| Quality | 55 test files, ~482 tests | `rg` over `packages/**/*.test.*` |

Deliberately deferred per `GLOSSARY.md`: Epic, Sprint, Milestone, Automation, Report.
That decision is reasonable. The gaps below are outside that deferred list.

## Table stakes: what all three competitors ship

These are capabilities confirmed in the official docs of all three products. They are
the minimum bar for "a team can adopt this", not differentiators.

| Capability | Linear | Plane | Jira |
| --- | --- | --- | --- |
| Comments, threads, reactions | [Comments](https://linear.app/docs/comment-on-issues) | [Comments & activity](https://docs.plane.so/communication-and-collaboration/comments-and-activity) | [Watch, share, comment](https://support.atlassian.com/jira-software-cloud/docs/watch-share-and-comment-on-a-work-item/) |
| Mentions and subscriptions | [Notifications](https://linear.app/docs/notifications) | [Comments](https://docs.plane.so/communication-and-collaboration/comments-and-activity) | [Watch, share, comment](https://support.atlassian.com/jira-software-cloud/docs/watch-share-and-comment-on-a-work-item/) |
| Notification inbox | [Inbox](https://linear.app/docs/inbox) | [Inbox](https://docs.plane.so/communication-and-collaboration/inbox) | [For you](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/) |
| Saved/shared filtered views | [Custom views](https://linear.app/docs/custom-views) | [Views](https://docs.plane.so/core-concepts/views) | [Saved filters](https://support.atlassian.com/jira-software-cloud/docs/save-your-search-as-a-filter/) |
| Personal cross-project view | [My issues](https://linear.app/docs/my-issues) | [Your work](https://docs.plane.so/your-work) | [For you](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/) |
| Workspace search | [Search](https://linear.app/docs/search) (title, body, comments) | [Search workspace](https://docs.plane.so/workspaces-and-users/search-workspace) | [Search](https://support.atlassian.com/jira-software-cloud/docs/search-issues-projects-and-more-with-the-your-keyboard/) |
| Issue relations / dependencies | [Docs index](https://linear.app/docs) (blocked, blocking, related, duplicate) | [Relations](https://docs.plane.so/work-items/custom-relations) | [Link work items](https://support.atlassian.com/jira-software-cloud/docs/link-issues/) (`blocks`, `is blocked by`, `duplicates`, …) |
| Attachments | [Comments](https://linear.app/docs/comment-on-issues) (files on comments) | [Comments & activity](https://docs.plane.so/communication-and-collaboration/comments-and-activity) | [Attachments](https://support.atlassian.com/jira-software-cloud/docs/add-an-attachment-to-an-issue/) |
| Sub-issues | [Parent & sub-issues](https://linear.app/docs/parent-and-sub-issues) | [Work items](https://docs.plane.so/work-items/overview) | [Work item + subtask](https://support.atlassian.com/jira-software-cloud/docs/create-a-work-item-and-a-subtask/) |
| Bulk edit | [Select issues](https://linear.app/docs/select-issues) | [Bulk ops](https://docs.plane.so/core-concepts/issues/bulk-ops) (Pro) | [Edit multiple](https://support.atlassian.com/jira-software-cloud/docs/edit-multiple-issues/) (up to 1,000) |
| Command palette / shortcuts | [Select issues](https://linear.app/docs/select-issues) (`Cmd/Ctrl K`) | [Power K](https://docs.plane.so/core-concepts/power-k) | [Command palette](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-command-palette/) |
| Cycles / sprints | [Cycles](https://linear.app/docs/use-cycles) | [Cycles](https://docs.plane.so/core-concepts/cycles) | [Sprints](https://support.atlassian.com/jira-software-cloud/docs/what-is-a-sprint/) |
| Projects, milestones, timeline | [Projects](https://linear.app/docs/projects), [Milestones](https://linear.app/docs/project-milestones) | [Modules](https://docs.plane.so/core-concepts/modules), [Milestones](https://docs.plane.so/projects/milestones) | [Timeline](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-roadmap/) |
| Initiatives / program level | [Initiatives](https://linear.app/docs/initiatives) | [Initiatives](https://docs.plane.so/core-concepts/projects/initiatives) | [Plans](https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-roadmaps/) (Premium+) |
| Reports / dashboards | [Dashboards](https://linear.app/docs/dashboards), [Insights](https://linear.app/docs/insights) | [Analytics](https://docs.plane.so/core-concepts/analytics), [Dashboards](https://docs.plane.so/dashboards) | [Reports](https://support.atlassian.com/jira-software-cloud/docs/track-and-analyze-your-teams-work-with-reports/) |
| Templates | [Issue templates](https://linear.app/docs/issue-templates) | [Work item templates](https://docs.plane.so/templates/work-item-templates) | [Block templates](https://support.atlassian.com/jira-software-cloud/docs/use-block-templates-in-jira/) (partial) |
| Roles and permissions | [Members & roles](https://linear.app/docs/members-roles) | [Roles](https://docs.plane.so/roles-and-permissions/overview) | [Permissions](https://support.atlassian.com/jira-software-cloud/docs/next-gen-permissions/) |
| Import from other tools | [Import issues](https://linear.app/docs/import-issues) | [Importers](https://docs.plane.so/importers/overview) | [Import data](https://support.atlassian.com/jira-software-cloud/docs/import-data-into-jira/) |
| Audit log | [Audit log](https://linear.app/docs/audit-log) | [Audit logs](https://docs.plane.so/workspaces-and-users/audit-logs) | Atlassian admin audit log |
| API + webhooks | [API & webhooks](https://linear.app/docs/api-and-webhooks) | [Developer docs](https://developers.plane.so) | Jira REST API / webhooks |
| MCP | [MCP](https://linear.app/docs/mcp) | [MCP server](https://docs.plane.so/ai/mcp-server) | [Atlassian Rovo MCP](https://www.atlassian.com/platform/rovo-mcp) |

Two consequences worth internalising:

1. **MCP is no longer a differentiator.** All three ship it. It is table stakes in 2026.
   Keep it, but do not treat it as the reason someone picks zConnect.
2. **Comments are not a "nice to have".** They are the substrate for mentions,
   subscriptions, notifications, activity history, and search. Almost every item in the
   table above depends on them.

### What the competitors paywall

Useful signal for sequencing: the collaboration core is free everywhere; the things they
charge for are the ones to defer.

- **Free on all three:** comments, mentions, notifications, saved views, relations,
  sub-items, search, cycles, GitHub integration, basic importers, API.
- **Free in two of three:** bulk edit (Plane gates it behind Pro), native recurring issues
  (Jira needs automation), and custom fields (Linear has none).
- **Paid on all three:** audit log (Linear Enterprise, Plane Enterprise, Jira Standard+),
  SAML/SCIM (Enterprise/Guard), and SLAs (Linear Business+, Plane Enterprise, Jira only
  in Service Management).
- **Paid at the cross-project level:** Jira's cross-space Plans (Premium+), Linear
  Insights/Dashboards (Business+/Enterprise), Plane advanced dashboards and private views.
- **Not universal:** native recurring issues (Linear + Plane; Jira needs automation) and
  custom fields (Jira + Plane). **Linear is the market leader with no custom-field
  builder.** Your fixed six-category model is a deliberate design position, not a gap.

## Gap list, ranked

Effort is a rough shape, not an estimate: **S** = one schema + one route + one surface,
**M** = new table(s) + realtime + tests, **L** = new domain concept.

### Tier 1 — the collaboration core (blocks team adoption)

| # | Gap | Why it matters | Effort |
| --- | --- | --- | --- |
| 1 | **Comments + activity timeline** | An issue can currently be *described* but not *discussed*. `timeline_event` exists but only GitHub webhooks write to it. No human history: who changed status, assignee, priority, or body. Linear, Plane, and Jira all treat this as the centre of the issue. | M |
| 2 | **Notifications + inbox + watchers** | Nothing tells anyone that they were assigned, mentioned, or that an issue they care about moved. There is no `notification` table, no unread state, no subscription model. Auto-subscribe on create/assign/mention is the expected default. | L |
| 3 | **Email delivery** | Not just a missing feature — the invite flow is a dead end today. `POST /api/workspaces/:id/invites` writes a row, and the invitee only discovers it by signing in and calling `GET /api/invitations`. There is no mail transport anywhere in the repo. | S–M |
| 4 | **@mentions** | Follows from 1, but needs its own resolver, autocomplete, and notification fan-out. | S (after 1) |

### Tier 2 — retrieval and navigation

| # | Gap | Why it matters | Effort |
| --- | --- | --- | --- |
| 5 | **My Issues / Home** | `App.tsx:466-478` ships a disabled "Home — Dashboard (soon)" button. Every competitor has a personal cross-project view. Yours is one query away: assigned / created / subscribed / recent. | S |
| 6 | **Workspace search** | Search is project-scoped and matches identifier + title only, in memory (`drizzle-store.ts:651-696`). Linear searches title, description, and comments across the workspace; Plane and Jira do equivalent. | M |
| 7 | **Command palette (`Cmd/Ctrl+K`)** | There is no global keyboard navigation or shortcut layer. Linear, Plane (Power K), and Jira all have one. It is also the cheapest way to make the app feel fast. | M |
| 8 | **Saved / shared views** | Filters persist only in `localStorage` per user per project. You cannot name a view, pin it to the rail, or share "Bugs assigned to me" with the team. | M |
| 9 | **Bulk edit** | Table has inline single-row edits, but no selection model, no bulk status/assignee/priority/label/archive. Jira edits 1,000 at once; Plane and Linear both ship it. | M |

### Tier 3 — relationships and content

| # | Gap | Why it matters | Effort |
| --- | --- | --- | --- |
| 10 | **Issue relations** | Only parent/child exists. No `blocks`, `blocked by`, `relates to`, `duplicates`. You have a **Duplicate** status category but no link to the issue it duplicates, so the category is a label with no data behind it. | M |
| 11 | **Attachments** | `lib/r2.ts` is fully wired (put/get/delete) and unused. No upload route, no attachment surface. Every competitor supports files. | M |
| 12 | **Project metadata + project page** | `project` has only name/key/icon/color. No description, lead, target date, or status — so no project page, no roadmap, no "what is this project" answer. This is the cheapest path to a Home/Dashboard that isn't fake. | S–M |
| 13 | **Multi-level sub-issues** | Glossary pins subtasks to one level — which matches Jira (sub-tasks cannot have children). Linear's docs do not state a depth limit, but only Plane documents nested sub-work-items and configurable type levels. You are already near parity here; leave it. | M |
| 14 | **Deferred: cycles / estimates** | `GLOSSARY.md` defers Sprint. That is defensible until the collaboration loop exists; after that, cycles become the reason teams stay. Jira's sprint and Plane/Linear cycle docs all tie planning to time-boxes. | L |
| 15 | **Deferred: timeline / roadmap / milestones** | Depends on project metadata (12). Jira's timeline, Linear's projects/timeline, Plane's modules/milestones. | L |
| 16 | **Deferred: reports / dashboards** | Also depends on history, which gap 1 creates. Without activity events you cannot compute created-vs-completed, cycle time, or burndown. | L |

### Tier 4 — platform and admin

| # | Gap | Why it matters | Effort |
| --- | --- | --- | --- |
| 17 | **Pagination + server-side filter** | `listIssues` returns every row, then filters labels and text in JS. Fine at 500 issues, wrong at 50,000. Add cursor pagination before search and saved views multiply query shapes. | S–M |
| 18 | **Audit log** | `timeline_event` is issue-scoped only. Admins will ask who deleted what, changed a role, or edited a workflow. | M |
| 19 | **Public API + outbound webhooks** | MCP exists, but there is no documented REST API, OpenAPI schema, or outbound webhook. Inbound GitHub webhooks exist; the other direction does not. | M |
| 20 | **Importers** | No Jira/Linear/CSV import. This is an adoption blocker for anyone with existing data. | L |
| 21 | **Guest / viewer model cleanup** | `project_viewer` grants surface as a synthetic workspace role `"Viewer"` (`store.ts:13`, `drizzle-store.ts:221`). This conflates "guest on one project" with "read-only in the workspace" and will break the moment comments and activity need permissions. | S–M |
| 22 | **Rate limiting / quotas** | No limits on issue creation, comments, or webhook fan-out. | S |

## Seams already in the code

The good news: most of this attaches to structures that already exist rather than
requiring a rewrite.

- **`timeline_event` (`db/schema.ts:273-283`)** — `kind` + `body`, issue-scoped. It is
  the natural home for a unified activity feed. It needs `actorId`, a structured
  `payload` (jsonb), and a `comment` sibling table; comments should not be smuggled
  into `kind`.
- **`issue` (`schema.ts:129-170`)** — already carries `createdAt`/`updatedAt`, which is
  what the frontend conflict logic uses. Comments and activity should reuse the same
  optimistic + last-write-wins pattern as `use-issue-subscription`. The existing
  conflict banner is a real asset here.
- **Realtime (`use-issue-subscription.ts:51`)** — scoped to one project's `issue` table.
  Comments need the `comment` table added to the publication; notifications need a
  **user-scoped** channel, not a project one.
- **`workspace_token` + `mcp/routes.ts`** — a public REST API is mostly a second
  adapter over the same store methods. The MCP tool list is already the API surface in
  disguise.
- **`lib/r2.ts`** — put/get/delete object helpers are complete. Attachments are an
  upload route, an `attachment` table, and a file list in the issue detail.
- **`project_viewer`** — this is the guest-role seam. Resolve it before adding
  comment-level permissions.
- **`issue-filter-bar.tsx:93-98`** — the persisted filter shape is already serialisable.
  A `view` table is "save this JSON + a name + a scope".

## Recommended sequence

### Milestone 1 — "Team loop" (do this next)

Comments, activity, mentions, notifications, inbox, email. This is one milestone, not
five features, because each part is unusable without the others.

Suggested shape:

- `comment`: `id`, `issueId`, `authorId`, `body`, `parentId` (one level of threading),
  `editedAt`, `createdAt`, `deletedAt`.
- `activity_event`: generalise `timeline_event` with `actorId`, `type`, `payload` jsonb.
  Write an event on create, status/assignee/priority/label/due-date change, archive,
  delete, and comment.
- `issue_subscription`: `(issueId, userId)`, auto-insert on create, assign, and mention.
- `notification`: `id`, `userId`, `issueId`, `type`, `actorId`, `readAt`, `createdAt`.
- Routes: `GET/POST/PATCH/DELETE /api/issues/:key/comments`, `GET /api/issues/:key/activity`,
  `GET /api/notifications`, `POST /api/notifications/:id/read`.
- UI: comment composer with markdown (reuse the TipTap setup), threaded replies,
  edit/delete, unified Activity section under the description.
- Email: add a provider (Resend/Postmark/SES) and a BullMQ digest job. The worker and
  queue already exist. Send invites immediately; batch the rest.
- Realtime: add `comment` and `activity_event` to the Supabase publication; add a
  user-scoped channel for the inbox badge.

Acceptance: two people can hold a conversation on an issue without leaving the app; a
mentioned user sees an unread badge, an inbox row, and an email; an invited user
receives an email they can act on.

### Milestone 2 — "Find your work"

- Home = My Issues (assigned / created / subscribed / recent), replacing the dead rail
  entry without pretending to be a dashboard.
- Workspace search endpoint (title, description, comments) + `Cmd/Ctrl+K` palette for
  search, navigation, and create.
- Saved views: `view` table with workspace/project scope, owner, shared flag, filter JSON,
  layout. Pin to rail.
- Bulk selection + one bulk-update endpoint; reuse the filter query so "select all
  matching" is well-defined.

Acceptance: a returning user can answer "what should I work on?" in one click, and
"where is that issue?" in one keystroke.

### Milestone 3 — "Plan and relate"

- Project metadata (description, lead, target date, status) + a real project page.
- Issue relations (`blocks`, `blocked by`, `relates to`, `duplicates`) with the inverse
  rendered on the other issue.
- Attachments (R2), with image preview and drag-drop.
- Then, and only then, cycles/estimates and a timeline.

Acceptance: dependencies are visible from both sides; a project has a page worth
visiting; files live next to the work.

## What not to build yet

- **SSO/SAML/SCIM.** Enterprise checklist, not a user problem at this stage.
- **AI summaries, triage agents, coding agents.** Linear, Plane, and Jira all ship them,
  but they are layered on top of comments and history. You have neither yet. Anything
  AI here would summarise an empty room.
- **A custom-field / workflow engine.** This is how Jira clones collapse under their own
  weight. Your six-category model is a feature, not a limitation.
- **Multi-level sub-issues.** One level is fine until someone asks twice.
- **Mobile/desktop apps.** The web app has more important gaps.
- **An automation rule builder.** The BullMQ worker is enough to ship the three
  automations people actually want (auto-close parent, stale issue reminder, assignment
  notification) as fixed behaviours.
- **Recurring issues.** Linear and Plane ship them; Jira fakes them with scheduled
  automation. It only makes sense once cycles and an automation surface exist.

## Strategic note

Parity with Linear is not a winnable goal and probably not the goal. zConnect's credible
edges are: self-hosted/data ownership, an opinionated six-category workflow, GitHub as a
first-class citizen, and agent-native access via MCP.

But every one of those edges is *invisible* to a team that cannot comment on an issue or
get notified when they are assigned one. The collaboration loop is not a feature to
compete on — it is the entry fee for the features you already have being used.

## Sources

Linear (official docs):
- <https://linear.app/docs>
- <https://linear.app/docs/comment-on-issues>
- <https://linear.app/docs/notifications>
- <https://linear.app/docs/inbox>
- <https://linear.app/docs/my-issues>
- <https://linear.app/docs/custom-views>
- <https://linear.app/docs/use-cycles>
- <https://linear.app/docs/search>
- <https://linear.app/docs/select-issues>
- <https://linear.app/docs/parent-and-sub-issues>
- <https://linear.app/docs/projects>
- <https://linear.app/docs/project-milestones>
- <https://linear.app/docs/initiatives>
- <https://linear.app/docs/dashboards>
- <https://linear.app/docs/insights>
- <https://linear.app/docs/members-roles>
- <https://linear.app/docs/issue-templates>
- <https://linear.app/docs/audit-log>
- <https://linear.app/docs/api-and-webhooks>
- <https://linear.app/docs/import-issues>
- <https://linear.app/docs/mcp>

Plane (official docs):
- <https://docs.plane.so/>
- <https://docs.plane.so/communication-and-collaboration/comments-and-activity>
- <https://docs.plane.so/communication-and-collaboration/inbox>
- <https://docs.plane.so/core-concepts/views>
- <https://docs.plane.so/core-concepts/cycles>
- <https://docs.plane.so/core-concepts/issues/bulk-ops>
- <https://docs.plane.so/core-concepts/power-k>
- <https://docs.plane.so/work-items/custom-relations>
- <https://docs.plane.so/core-concepts/modules>
- <https://docs.plane.so/projects/milestones>
- <https://docs.plane.so/core-concepts/projects/initiatives>
- <https://docs.plane.so/your-work>
- <https://docs.plane.so/core-concepts/analytics>
- <https://docs.plane.so/templates/work-item-templates>
- <https://docs.plane.so/roles-and-permissions/overview>
- <https://docs.plane.so/workspaces-and-users/audit-logs>
- <https://docs.plane.so/workspaces-and-users/search-workspace>
- <https://docs.plane.so/importers/overview>
- <https://docs.plane.so/ai/mcp-server>

Jira (Atlassian official docs):
- <https://support.atlassian.com/jira-software-cloud/>
- <https://support.atlassian.com/jira-software-cloud/docs/watch-share-and-comment-on-a-work-item/>
- <https://support.atlassian.com/jira-software-cloud/docs/link-issues/>
- <https://support.atlassian.com/jira-software-cloud/docs/save-your-search-as-a-filter/>
- <https://support.atlassian.com/jira-software-cloud/docs/save-and-share-views-from-your-list/>
- <https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/>
- <https://support.atlassian.com/jira-software-cloud/docs/what-is-a-sprint/>
- <https://support.atlassian.com/jira-software-cloud/docs/edit-multiple-issues/>
- <https://support.atlassian.com/jira-software-cloud/docs/add-an-attachment-to-an-issue/>
- <https://support.atlassian.com/jira-software-cloud/docs/track-and-analyze-your-teams-work-with-reports/>
- <https://support.atlassian.com/jira-software-cloud/docs/what-is-the-roadmap/>
- <https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-roadmaps/>
- <https://support.atlassian.com/jira-software-cloud/docs/what-is-the-command-palette/>
- <https://support.atlassian.com/jira-software-cloud/docs/import-data-into-jira/>
- <https://support.atlassian.com/jira-software-cloud/docs/next-gen-permissions/>
- <https://www.atlassian.com/software/jira/features>
- <https://www.atlassian.com/platform/rovo-mcp>

Repository references:
- `packages/backend/src/db/schema.ts`
- `packages/backend/src/workspaces/routes.ts`
- `packages/backend/src/workspaces/drizzle-store.ts`
- `packages/backend/src/mcp/routes.ts`
- `packages/frontend/src/App.tsx`
- `packages/frontend/src/hooks/use-issue-subscription.ts`
- `packages/frontend/src/components/issue-filter-bar.tsx`
- `GLOSSARY.md`, `docs/adr/0001-six-status-categories-and-rail-ia.md`

## Grilling addendum (2026-10-20)

The analysis above was kept intact and checked against the code and the
attached Supabase project during a grilling session. Corrections and one
priority change:

- **Supabase is exposed.** All 19 public tables have RLS disabled and no
  policies; the frontend ships the anon key. Anyone with that key can read or
  modify every row. See ADR-0002.
- **Realtime is inert.** The `supabase_realtime` publication contains no
  tables, so `use-issue-subscription` receives nothing even where the UI
  suggests it is live. Direct browser access is removed; polling replaces it.
- **Viewer access leaks.** `readableProject` (`routes.ts:265-271`) checks only
  workspace visibility, and `listProjects` does not filter by user, so a
  Viewer granted one project can read every project in that workspace. Fix
  before comments ship.
- **Invites have no acceptance surface.** There is no frontend call to list or
  accept invitations, so email alone would not complete the flow. R1 adds the
  acceptance page, expiry, and a copy-link fallback.
- **`issue` has no creator.** `createdBy` is added for My Issues; legacy rows
  stay unknown.

**Repackaging.** Security and the Viewer leak come first. **R1** (comments,
activity, invite email, acceptance) makes two people able to join and talk.
**R2** (watchers, notifications, inbox, mentions, email, My Issues) makes the
team hear about it. Retrieval and the rest of Tier 2 move to R3; Tiers 3–4
remain backlog.

**MCP.** Table stakes in capability, an edge only in execution. R2 adds
read-only `comment.list`; no agent comments.

Decisions: [ADR-0002](../adr/0002-remove-browser-database-access.md) (browser
database access) and [ADR-0003](../adr/0003-collaboration-core.md)
(collaboration core).
