# T3 — Backend: terminal-three completion guardrail

Implements ADR-0001 (done-semantics slice).

## Background

`completionWarnings` (`routes.ts:640-669`) fires only for `Done`-category
targets. The verdict counts Completed, Canceled, and Duplicate as done.

## Scope

- Guardrail fires on all three terminal categories; warning copy stays
  ("open subtask" semantics unchanged).
- `archived` keeps meaning hidden — no coupling to Canceled (auto-archive
  left open in ADR-0001; do not implement it here).
- Extend `subtasks.test.ts` guardrail cases to a Canceled/Duplicate target.

## Acceptance

- Moving to Completed/Canceled/Duplicate with open subtasks warns but
  allows; to Backlog/Unstarted/In Progress warns nothing.
- Backend suite green.

## Dependencies

Blocks on T1 (needs the six-category enum).

## Suggested label

`ready-for-agent` (label-ID mapping at import time).
