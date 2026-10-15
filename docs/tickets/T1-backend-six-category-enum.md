# T1 — Backend: six-category enum + migration

Implements ADR-0001 (domain slice 1).

## Background

`STATUS_CATEGORIES` (`packages/backend/src/workspaces/store.ts:38`) is
`["Todo", "In Progress", "Done"]`, enforced by zod (`routes.ts:60,66`) and the
Drizzle schema. The verdict moves to six: Backlog, Unstarted, In Progress,
Completed, Canceled, Duplicate.

## Scope

- `store.ts`: extend `STATUS_CATEGORIES`; both stores (memory + drizzle).
- Drizzle schema + migration for the category column.
- Dev migration: drop and recreate the status table (authorized; dev only —
  must never run against real data).
- Update contract tests that pin the old three (`issues.test.ts`,
  `projects.test.ts`, `subtasks.test.ts` reference `["Shipped", "Done"]`-style
  fixtures — keep them passing against the new enum).

## Acceptance

- `createStatus` accepts all six, rejects anything else with the existing
  validation error shape.
- Existing statuses are gone post-migration (drop, not alter) in dev.
- Backend suite green.

## Dependencies

None. Blocks T2, T3, T4.

## Suggested label

`ready-for-agent` (spec'd by ADR-0001; needs a GitCafe label-ID mapping entry
at import time — see `docs/agents/triage-labels.md`).
