# T2 — Backend: `createProject` seeds workflow + sample issues

GitHub: #2 (`ready-for-agent`). Implements ADR-0001 (seeding slice).

## Background

Both `createProject` paths insert project + sequence only
(`drizzle-store.ts:283-296`, `store.ts:449-468`). New projects must open with
the default roster and six tutorial issues, atomically.

## Scope

- `createProject` (both stores) inserts, in one request:
  1. The 7 default statuses in roster order (Backlog→Backlog,
     Unstarted→Todo, In Progress→In Progress + In Review,
     Completed→Done, Canceled→Canceled, Duplicate→Duplicate).
  2. The 6 seed issues from the ADR record (verbatim titles, unassigned, no
     due dates, spread Backlog/Todo/In Progress as specified).
- Failure anywhere fails the request (no half-seeded projects).
- Always seeded, no flag.

## Acceptance

- `POST /api/workspaces/:id/projects` returns a project whose statuses and
  issues match the roster verbatim; first real issue numbers `KEY-7`.
- Failure injection (e.g. duplicate key) leaves no orphan statuses/issues.
- Backend suite green, including new waterfall tests.

## Dependencies

Blocks on T1 (needs the six-category enum).

## Suggested label

`ready-for-agent` (label-ID mapping at import time).
