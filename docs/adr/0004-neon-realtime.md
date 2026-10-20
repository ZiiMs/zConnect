# ADR-0004: Neon Realtime replaces backend-mediated SSE

Status: Accepted (2026-10-20). Supersedes the realtime clauses of ADR-0002
(§Decision 4) and ADR-0003 (§Consequences, realtime bullet).

## Context

ADR-0002/0003 specified realtime as backend-mediated Server-Sent Events
(`GET /api/events`): the backend published change signals and the browser
refetched through the API. That transport was never built — no `/api/events`
route exists — and Neon Realtime reached public beta (October 2026) on our
region (`aws-us-east-1`), offering live SQL over WebSocket with backend-sealed
queries. Keeping a custom SSE transport would mean building, operating, and
fanning out (Redis) a protocol Neon now provides.

## Decision

1. **Neon Realtime is the live transport.** The backend defines one
   deterministic, read-only SQL query per authorization scope
   (`packages/backend/src/realtime/queries.ts`), seals it with
   `NEON_REALTIME_SECRET` (`packages/backend/src/realtime/service.ts`), and
   exposes it from authenticated Hono routes
   (`POST /api/realtime/queries/*`, `packages/backend/src/realtime/routes.ts`).
2. **Authorization lives in the sealed query.** Each query carries the
   signed-in user's scope (workspace membership / Viewer grant joins, or
   `user_id = $1`), because Realtime does not support RLS. The browser never
   receives a database credential; the sealed query is the authorization
   boundary and a bearer token (HTTPS only, never in URLs, logs, or storage).
3. **The browser subscribes via `@neon/realtime-react`.** One shared client
   (`packages/frontend/src/lib/realtime.ts`, public `VITE_NEON_REALTIME_URL`
   only) behind `<RealtimeProvider>`; one `useLiveQuery(sealed,
   { refreshQuery })` per surface, bridged into existing REST state
   (`packages/frontend/src/components/realtime/*`). Sealed queries expire, so
   every binding passes `refreshQuery`.
4. **Polling stays the fallback.** 30 s + focus/visibility refetch
   (`use-polling.ts`) covers a downed or unconfigured subscription. There is
   no SSE transport to fall back to.
5. **Realtime is declared in `neon.ts`** (`preview: { realtime: true }`) so
   child branches inherit it; `neon deploy` / `neon env pull` keep
   `DATABASE_URL`, `NEON_REALTIME_URL`, and `NEON_REALTIME_SECRET` in sync.

## Consequences

- No custom transport code to operate; no Redis fan-out for realtime
  (Redis remains for BullMQ/worker/GitHub webhooks).
- Writes still go through the REST API. Optimistic mutations should return
  each write's `txid` (`pg_current_xact_id()::text` in `RETURNING`) and confirm
  with `awaitTxId(txid, timeout)` — not yet implemented; see
  `neon-realtime` skill → Optimistic mutations.
- Sealed-query renewal and user-switch handling follow the skill: renewals must
  re-seal the same query/parameters, and a session change should resolve with a
  full page load.
- Beta limits apply: no RLS, limited regions, 60-second sealed-query expiry.
