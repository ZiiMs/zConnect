# ADR-0002: The browser has no direct database access

Status: Accepted (collaboration core spec, 2026-10-20). Realtime clause superseded by
ADR-0004 (Neon Realtime replaces backend-mediated SSE).

## Context

The first builds shipped `@supabase/supabase-js` to the browser with the anon key. The
attached Supabase project had RLS disabled on every `public` table and no policies, so
anyone holding the anon key could read and rewrite every workspace's private rows. The
`supabase_realtime` publication contained no tables, so the realtime hooks that motivated
the client received nothing anyway. Two code paths could mutate data: the backend (Drizzle
over Postgres) and a browser client that had no access control of its own.

## Decision

1. **RLS deny-all on every `public` table**, auth tables included. No anon policies. The
   backend connects as the table owner or a role with `BYPASSRLS`; that requirement is
   verified before a migration is applied to an environment.
2. **The backend is the only database reader.** Every read and write goes through the Hono
   API, which already owns session resolution and permission checks.
3. **Remove the browser Supabase client, both realtime hooks, the
   `@supabase/supabase-js` dependency, and the Supabase environment variables from both
   packages.** The backend's unused Supabase module goes too, so importing the app needs
   no Supabase env at all.
4. **Backend-mediated realtime, with polling as fallback.** The backend seals
   live SQL queries (Neon Realtime, ADR-0004); the browser subscribes over
   WebSocket and refetches through the API when the subscription is down.
   Issue lists/detail also refetch every 30 seconds and on window focus,
   so a dropped subscription degrades to polling. The existing `updatedAt` conflict banner
   remains the write-conflict mechanism.
5. A static test guards the decision: neither package depends on the Supabase client and
   no source imports it.

## Consequences

- Self-hosting needs only `DATABASE_URL`, not a Supabase URL or key.
- Live updates are event-driven when the stream is healthy, with a 30-second freshness
  floor when it is not.
- Any future browser-side data access must be introduced as an explicit API, not a
  database client.
- Applying RLS requires a privileged database role; the README documents the check.
