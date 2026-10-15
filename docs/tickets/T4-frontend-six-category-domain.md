# T4 — Frontend: six-category domain (schema, grouping, progress)

GitCafe: #15 (`ready-for-agent`). Implements ADR-0001 (frontend domain slice).

## Background

`statusCategorySchema` (`lib/api.ts`), list grouping (`CATEGORY_ORDER` in
`issue-list.tsx`), and progress math assume three buckets. Code comments
cite the old spec decision ("grouping is by Category") and must follow the
six.

## Scope

- `statusCategorySchema` → six values (keep zod wired to the same call
  sites; no new props on shared components).
- Grouping order = roster order; progress "done" = terminal three
  (Completed/Canceled/Duplicate).
- Update spec-decision comments to ADR-0001.
- GLOSSARY entry is already amended; no doc work here.

## Acceptance

- List groups render six buckets in roster order; progress counts terminal
  three only.
- Frontend suite green with no weakened assertions.

## Dependencies

Blocks on T1 (contract: the six names). Parallel-safe with T5.

## Suggested label

`ready-for-agent` (label-ID mapping at import time).
