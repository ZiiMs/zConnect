# T6 — Frontend: breadcrumb + Active/Backlog/All tabs

GitCafe: #17 (`ready-for-agent`). Implements ADR-0001 (issues-screen slice).

## Background

The issues screen needs orientation (breadcrumb) and the three filter tabs
from the verdict, coexisting with the List/Table/Kanban view row.

## Scope

- Breadcrumb atop the issues screen: `{Project} › Issues[ › View]`,
  extending to `› WEB-123` on detail; every crumb clickable.
- Filter row above the view row: Active (Backlog + Unstarted + In Progress
  buckets, default), Backlog (category only), All Issues (everything except
  archived — standing default kept). Wire into the existing
  `IssueFilterBar` value (statusIds presets), preserving localStorage
  persistence and all current filter controls.
- Agree the project child-row contract with T5 (what the Issues row
  selects/shows).

## Acceptance

- Default landing is Active; Backlog shows the category only; All Issues
  includes terminal states, never archived.
- Breadcrumb navigates on every screen including detail.
- Frontend suite green with no weakened assertions; close with a
  screenshot pass over the new IA.

## Dependencies

Blocks on T4 (needs the six-category domain). Coordinate child rows
with T5.

## Suggested label

`ready-for-agent` (label-ID mapping at import time).
