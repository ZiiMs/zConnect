To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

open http://localhost:3000

## Database

Postgres is hosted on Neon (any standard Postgres works). Two URLs are used:

- `DATABASE_URL` — the pooled `-pooler` endpoint for the API and worker. The client disables
  prepared statements (`prepare: false`) for PgBouncer transaction mode.
- `DATABASE_URL_UNPOOLED` — the direct endpoint for `drizzle-kit` migrations. When omitted,
  `drizzle.config.ts` falls back to `DATABASE_URL`.

Both URLs should include `sslmode=require`. `neon deploy` / `neon env pull` write them to
the repo-root `.env.local`; `src/lib/env.ts` loads that file (with override) so the Neon
values win over any package-local `.env`.

## Auth

Authentication is self-managed Better Auth, running in this backend and storing users,
sessions, and accounts in the `public` schema. `src/lib/auth.ts` configures it; the Hono
route `/api/auth/*` forwards to `auth.handler()`, and routes call
`auth.api.getSession({ headers })` through the `getSession` callbacks in `src/index.ts`.

Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in this package's `.env`, plus
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google sign-in. The browser uses
`better-auth/react` (`packages/frontend/src/lib/auth-client.ts`) against `VITE_API_URL`.
Member lists and notification digests read profiles from the `public.user` table.

The repo-root `.env.local` supplies only the Neon Postgres URLs. Neon Auth is not used at
runtime; if it is provisioned on the branch, it can be left unused or disabled later.

## GitHub Connection

Settings → Connections → GitHub lets an Owner or Admin authorize one GitHub OAuth App per
workspace, then choose up to 50 repositories the workspace may use. The flow uses Better
Auth's GitHub social provider: `linkSocial` asks for the `repo` scope, the callback returns
to Settings with `?linked=1`, and a finalize request stores the Connection. The GitHub
account is linked per user, then finalized to the workspace as the shared credential.
Members can read the connection status; connecting, reconnecting, changing the allowlist,
and disconnecting are Owner/Admin only.

Register the OAuth App on GitHub with:

- **Homepage URL**: the frontend URL (`FRONTEND_URL`, e.g. `http://localhost:5173`)
- **Authorization callback URL**: `<BETTER_AUTH_URL>/api/auth/callback/github`
  (e.g. `http://localhost:3000/api/auth/callback/github`)

Set in this package's `.env`:

```sh
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
# 32-byte base64 key; generate with: openssl rand -base64 32
INTEGRATION_ENCRYPTION_KEY=""
```

The access token is encrypted at rest with AES-256-GCM under
`INTEGRATION_ENCRYPTION_KEY` (versioned `v1.` payload) and never appears in an API response
or a log. Without that key the Connection feature is unavailable and the connect request
answers `503`; set it before connecting GitHub. Rotating the key requires reconnecting,
because existing payloads cannot be decrypted with a new key.

Disconnecting deletes the Connection, its repositories, project repository links, and
cached Pull Requests and GitHub Issues. External Links on Issues survive with their last
known state.

**Upgrade note**: the previous manual repository list is retired in favor of
the Connection allowlist. After upgrading, open Settings → Connections → GitHub, connect
GitHub, and re-select the repositories. The webhook endpoint is unchanged and accepts
deliveries for repositories selected under the new model.

### Sync freshness

Opening the GitHub View serves the cached snapshot immediately and asks the backend for a sync
when the newest snapshot is older than five minutes. A manual Refresh is accepted at most once
per minute per workspace (`429` with a `retryAfter` hint otherwise). The worker sweeps every
repository linked to at least one project every fifteen minutes, and a daily retention pass
removes merged Pull Requests and closed GitHub Issues whose close is more than ninety days old.
Open items never age out.

A `401` from GitHub pauses the Connection (`reconnect_required`): sync stops for the workspace
and the GitHub View shows a Reconnect banner (Owners/Admins start the OAuth flow; members are
told to ask an admin). A `403`/`404` marks only that repository unavailable and keeps its last
snapshot on screen. Renamed repositories are repaired on the next sync through GitHub's
immutable repository id. Rate limits leave `lastSyncedAt` unchanged so the next sweep retries
after GitHub's window instead of recording a fresh snapshot.

## Realtime

Neon Realtime is the live transport: the backend seals one deterministic SQL
query per authorization scope with `NEON_REALTIME_SECRET`
(`POST /api/realtime/queries/*`), and the browser subscribes over WebSocket
(`packages/frontend/src/components/realtime/*`). Sealed queries expire, so the
bridges renew them via `refreshQuery`; when live data is unavailable,
30-second polling is the fallback. Both paths are backend-mediated; no browser
database client is involved.

## Migrations

Schema lives in `src/db/schema.ts` (plus `src/db/auth-schema.ts`). Do not hand-create
migration files - generate them:

```sh
bun run db:generate   # drizzle-kit generate: diff schema.ts -> drizzle/NNNN_*.sql + meta snapshot
bun run db:migrate    # drizzle-kit migrate: apply pending migrations
```

Every schema change goes through `db:generate`; it diffs `schema.ts` against the latest
snapshot in `drizzle/meta/` and writes the SQL, the new snapshot and the journal entry.

Use `bunx drizzle-kit generate --custom --name=<slug>` only for a **data-only** migration
the schema diff cannot express (e.g. the ADR-0001 dev reset that drops and recreates the
`status` table). It still registers the file, snapshot and journal entry through drizzle-kit.

Both commands load `drizzle.config.ts`, which imports `src/lib/env.ts` (repo-root
`.env.local`) and prefers `DATABASE_URL_UNPOOLED`, otherwise `DATABASE_URL`.

### Moving an existing database to Neon

Use Neon's direct URL for the restore, then point runtime at the pooled URL:

```sh
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges -Fc -f zconnect.dump
pg_restore --no-owner --no-privileges -d "$DATABASE_URL_UNPOOLED" zconnect.dump
```

If the target is a fresh database instead, run `bun run db:migrate` against
`DATABASE_URL_UNPOOLED`; it creates the schema from the migrations.

## Database access and RLS

The backend is the only database reader. Row Level Security is enabled deny-all on every
`public` table; there are no anon policies. The browser therefore needs no database URL or
key, and the frontend ships no database client.

The `DATABASE_URL` role must be the table owner or a role with `BYPASSRLS`. Verify before
applying a migration to a new environment:

```sh
psql "$DATABASE_URL_UNPOOLED" -c "select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user;"
```

A `f`/`f` result means the migration would lock the backend out of its own tables.

## Mail

Invitations and notification email use SMTP. Set `SMTP_URL` (for example
`smtp://user:pass@smtp.example.com:587`) and `MAIL_FROM`. With `SMTP_URL` unset the app
still works: invite responses return a copy-link `acceptUrl` and notification email is
skipped. In-app notifications are unaffected.
