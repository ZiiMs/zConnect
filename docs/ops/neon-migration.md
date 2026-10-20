# Moving zConnect from Supabase Postgres to Neon

The backend only knows `DATABASE_URL`; Drizzle and `postgres` are provider-agnostic. There is
no Supabase runtime code left in either package, so this is a connection + data move, not a
code port.

## 1. Create the Neon database

Create a Neon project and copy **two** connection strings:

- **Pooled** (`...-pooler...`) — runtime API/worker traffic.
- **Direct** (no `-pooler`) — drizzle migrations and `pg_dump`/`pg_restore`.

Both should include `?sslmode=require`.

`packages/backend/.env`:

```sh
DATABASE_URL="postgresql://...-pooler.../zconnect?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://......neon.tech/zconnect?sslmode=require"
```

`src/db/index.ts` disables prepared statements for PgBouncer and enables TLS when
`sslmode=require` is present. `drizzle.config.ts` prefers `DATABASE_URL_UNPOOLED`.

## 2. Create the schema

Fresh database:

```sh
bun run --cwd packages/backend db:migrate
```

The migration set includes the deny-all RLS migration. The backend role must be the table
owner or have `BYPASSRLS`; the Neon database owner satisfies that by default. Verify:

```sh
psql "$DATABASE_URL_UNPOOLED" -c \
  "select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user;"
```

Existing data instead of a fresh schema:

```sh
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges -Fc -f zconnect.dump
pg_restore --no-owner --no-privileges -d "$DATABASE_URL_UNPOOLED" zconnect.dump
```

After a restore, check `drizzle.__drizzle_migrations` is present; if the dump predates the
collaboration migration, run `db:migrate` afterwards.

## 3. Switch and verify

1. Restart the backend and worker so they pick up the new `DATABASE_URL`.
2. Sign in, load a project, create an issue, post a comment, and check the Activity feed.
3. Confirm `select relrowsecurity from pg_class ...` shows `true` for every public table.
4. Confirm an anon role cannot read a table (`set role anon; select count(*) from issue;`
   should return 0, or fail).
5. Remove `SUPABASE_*` from the old `.env` and, once the dump is verified, remove the
   Supabase MCP entry from `.opencode/opencode.json`.

## Auth after the move

Authentication stays self-managed Better Auth on the Neon database. It continues to use
the `public.user` / `session` / `account` / `verification` tables and the
`/api/auth/*` route, so no auth code has to move with the database.

If Neon Auth was provisioned experimentally, it can stay unused. Disabling it is a
separate branch-level change (`auth` in `neon.ts`, then `neon deploy`) and is not required
for the Postgres move.

## Realtime after the move

Neon Realtime is in public beta (October 2026) and is the live transport. It is a
backend-sealed live SQL service: the backend defines one deterministic read query per
authorization scope, seals it with `NEON_REALTIME_SECRET`, and the browser subscribes over
WebSocket. The browser never gets a database connection; the sealed query is the
authorization boundary. Neon Realtime does **not** support RLS yet, so every sealed query
must be built server-side with the signed-in user's scope already applied.

Realtime is enabled on the branch (`preview.realtime` in `neon.ts`) and the SDK
integration is wired (`packages/backend/src/realtime/*`,
`packages/frontend/src/components/realtime/*`). The old SSE transport
(`GET /api/events`) is removed. Polling remains the fallback when a live
subscription is unavailable.

If you need an alternative later, the options are:

| Option | Fit |
| --- | --- |
| **Neon Realtime (current)** | Live SQL + Drizzle/React SDKs, backend-sealed queries, no browser DB key. Beta: no RLS, limited regions, expiring sealed queries. |
| **Postgres `LISTEN/NOTIFY` + SSE** | Removes the Realtime dependency, but reintroduces a custom transport and Neon needs a direct connection. |
| **Centrifugo / Soketi** | Self-hosted WebSocket with presence; adds a service and auth wiring. |
| **Ably / Pusher** | Managed WebSocket; adds a vendor and per-message cost. |
