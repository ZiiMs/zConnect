To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

open http://localhost:3000

## Migrations

Schema lives in `src/db/schema.ts` (plus `src/db/auth-schema.ts`). Do not hand-create
migration files — generate them:

```sh
bun run db:generate   # drizzle-kit generate: diff schema.ts -> drizzle/NNNN_*.sql + meta snapshot
bun run db:migrate    # drizzle-kit migrate: apply pending migrations
```

Every schema change goes through `db:generate`; it diffs `schema.ts` against the latest
snapshot in `drizzle/meta/` and writes the SQL, the new snapshot and the journal entry.

Use `bunx drizzle-kit generate --custom --name=<slug>` only for a **data-only** migration
the schema diff cannot express (e.g. the ADR-0001 dev reset that drops and recreates the
`status` table). It still registers the file, snapshot and journal entry through drizzle-kit.

Both commands load `drizzle.config.ts`, which requires `DATABASE_URL` in `.env`.
