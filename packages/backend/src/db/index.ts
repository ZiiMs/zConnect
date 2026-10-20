import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

let cached: ReturnType<typeof drizzle> | null = null

/** Neon (and most hosted Postgres) requires TLS; local Postgres usually does not. */
function sslOption(connectionString: string): "require" | undefined {
  return /[?&]sslmode=(require|verify-ca|verify-full)\b/.test(connectionString)
    ? "require"
    : undefined
}

/**
 * Lazily creates the Drizzle client so that importing the app (e.g. in
 * contract tests) never requires DATABASE_URL. The error surfaces only when
 * a query actually runs without configuration.
 *
 * Neon's pooled endpoint runs PgBouncer in transaction mode, so prepared
 * statements are disabled. Migrations use the direct URL instead; see
 * `drizzle.config.ts`.
 */
export function getDb(): ReturnType<typeof drizzle> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set in packages/backend/.env")
  }
  if (!cached) {
    const client = postgres(connectionString, {
      prepare: false,
      ssl: sslOption(connectionString),
    })
    cached = drizzle(client)
  }
  return cached
}
