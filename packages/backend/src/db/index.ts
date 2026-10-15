import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

let cached: ReturnType<typeof drizzle> | null = null

/**
 * Lazily creates the Drizzle client so that importing the app (e.g. in
 * contract tests) never requires DATABASE_URL. The error surfaces only when
 * a query actually runs without configuration.
 */
export function getDb(): ReturnType<typeof drizzle> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set in packages/backend/.env")
  }
  if (!cached) {
    // Disable prefetch as it is not supported for "Transaction" pool mode
    const client = postgres(connectionString, { prepare: false })
    cached = drizzle(client)
  }
  return cached
}
