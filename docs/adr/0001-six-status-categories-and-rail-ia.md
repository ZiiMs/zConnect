# ADR-0001: Six status categories, rail IA, and project seeding

Status: Accepted (grill rounds 1–2, 2026-10-15).

## Context

The MVP shipped a fixed 3-bucket Status Category rollup (Todo / In Progress /
Done) with per-project custom statuses, a flat rail (workspace list, project
buttons), and empty projects. Reviewing the app against the layout mockups
raised three gaps: the workflow cannot represent backlog, canceled, or
duplicate work as first-class states; the rail does not scale past one
project; and new projects open onto a blank tracker with no path forward.

## Decision

### Six categories, terminal three count as done

Status Category becomes: Backlog, Unstarted, In Progress, Completed,
Canceled, Duplicate. Completed, Canceled, and Duplicate are terminal and
count as done everywhere: list grouping order, progress math, and the
completion guardrail (which previously fired on Done only).

Default roster for new projects, in order:

- Backlog → Backlog
- Unstarted → Todo
- In Progress → In Progress, In Review
- Completed → Done
- Canceled → Canceled
- Duplicate → Duplicate

`archived` keeps meaning hidden (default `archived=false` queries unchanged);
Canceled stays a visible workflow state. Whether Canceled should auto-archive
is intentionally left open.

Migration: dev status table is dropped and recreated; `GLOSSARY.md` and spec
references are amended to six.

### Rail IA

- Workspace dropdown top-left (icon + name, switches, holds "New workspace");
  the Workspaces rail section is deleted.
- Projects become accordion groups: expanding selects, exactly one selected.
- Home ships disabled with "Dashboard (soon)"; no dead links.
- Board and Table stay as content view-tabs, never rail children.

### Issues screen

- Breadcrumb `{Project} › Issues[ › View]`, extending to `› WEB-123` on
  detail, crumbs clickable.
- Filter row: Active (Backlog + Unstarted + In Progress buckets, default),
  Backlog (category only), All Issues (everything except archived).
  List / Table / Kanban remain as the view row.

### Seeding

`createProject` inserts the 7 default statuses then 6 tutorial sample
issues in one backend waterfall, always (no flag): unassigned, no due
dates, titles per the grill record. First real issue is `KEY-7` by design.

## Consequences

- Backend: category enum + migration, `createProject` waterfall,
  terminal-three guardrail, contract tests adjusted.
- Frontend: category schema, six-group ordering, progress math, rail
  rebuild, breadcrumb, filter tabs.
- Spec and glossary follow the six; `canceled vs archived` stays open.
