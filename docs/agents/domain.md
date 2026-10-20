# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a **single-context** repo: one `GLOSSARY.md` and one `docs/adr/` at the root, shared by
both `packages/backend` and `packages/frontend`. The domain — users, workspaces, boards — is one
product described in one vocabulary, so the two packages must not drift apart on terminology.

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
├── packages/backend/
└── packages/frontend/
```

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Note for this stack

Terminology here crosses a client/server boundary and several third-party products that use
overlapping words — "user" (Better Auth vs. the database vs. Supabase), "session" (Better Auth
session vs. a browser session), "realtime" (Supabase Realtime vs. plain HTTP). When a glossary
term is ambiguous across that boundary, say which layer you mean rather than assuming the reader
resolves it the same way.

