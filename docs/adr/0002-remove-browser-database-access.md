# ADR-0002: Remove direct browser access to Postgres

Status: Accepted (grill rounds 1–4, 2026-10-20).

## Context

The frontend used `@supabase/supabase-js` with the anon key to subscribe to
`issue` changes. The attached Supabase project has RLS disabled on all 19
public tables and no policies, so anyone with the anon key — shipped in the
browser bundle — could read or modify every row. The `supabase_realtime`
publication also contains no tables, so the subscription delivered nothing.

Better Auth is the app's identity provider, not Supabase Auth. There is no
user identity for RLS to key on without a bridge.

## Decision

The browser never talks to Postgres directly. RLS is enabled deny-all on every
public table, and the app uses its authenticated HTTP API. The frontend and
backend Supabase client modules, both realtime hooks
(`use-issue-subscription`, `use-realtime`), the `@supabase/supabase-js`
dependency, and the `VITE_SUPABASE_*`/`SUPABASE_*` configuration are removed.
Issue lists and detail poll every 30 seconds and on window focus; the existing
`updatedAt` conflict banner remains.

A Better Auth → Supabase JWT bridge plus RLS policies and private channels was
rejected for now: it is a new auth surface, and live updates are not worth
blocking the collaboration loop.

## Consequences

- The security exposure closes without inventing an auth bridge.
- Live updates are no longer instant. Polling is the source of freshness.
- Reintroducing realtime later requires a backend-authenticated transport or
  the JWT bridge; it must not reintroduce anon-key table access.
- The backend must connect as the table owner (or a role with `BYPASSRLS`);
  verify this before applying the deny-all migration.

Implementation: [#25](https://github.com/ZiiMs/zConnect/issues/25).
