# T5 — Frontend: rail IA (dropdown, accordion projects, dead Home)

GitHub: #5 (`ready-for-agent`). Implements ADR-0001 (rail slice).

## Background

The rail still stacks a Workspaces section, flat project buttons, and an
unlabelled nav. The verdict: top-left workspace dropdown, accordion project
groups, disabled Home.

## Scope (`App.tsx` + rail-local helpers only)

- Workspace dropdown top-left (icon + selected name; switches; "New
  workspace" item); delete the Workspaces rail section (keep
  `WorkspaceSwitcher` component file untouched for now).
- Projects become accordion groups: expanding selects, exactly one
  selected; selected project shows Issues/Home children per T6's roster
  (coordinate the child-row contract with T6, or render placeholder rows).
- Home renders disabled with "Dashboard (soon)" tooltip — never a live
  dead link.
- Keep distinct collapsible section surfaces from the current rail; no
  prop changes on shared components.

## Acceptance

- Switch workspaces from the dropdown; create one from inside it.
- Expand/collapse projects; main column always tracks the selected one.
- Home is visibly disabled with its tooltip.
- Frontend suite green with no weakened assertions.

## Dependencies

None (parallel-safe with T1–T4; agree the project child-row contract
with T6).

## Suggested label

`ready-for-agent` (label-ID mapping at import time).
