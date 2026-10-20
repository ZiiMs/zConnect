import {
  createRealtime,
  type RawSqlQuery,
  type SealedLiveQuery,
} from "@neon/realtime/server"

/**
 * The one capability the API needs from the Realtime SDK. Routes depend on
 * this interface so tests can assert authorization and query construction
 * without a live Neon secret.
 */
export interface RealtimeSealer {
  seal<Row>(query: RawSqlQuery<Row>): Promise<SealedLiveQuery<Row>>
}

/** Database name embedded in every capability; `neondb` is Neon's default. */
function databaseName(connectionString: string | undefined): string {
  if (!connectionString) return "neondb"
  try {
    const name = decodeURIComponent(
      new URL(connectionString).pathname.replace(/^\//, "")
    )
    return name === "" ? "neondb" : name
  } catch {
    return "neondb"
  }
}

/**
 * Build the server-only capability issuer. `NEON_REALTIME_SECRET` stays on the
 * backend; the browser only ever sees the sealed queries it produces.
 *
 * Returns `null` when Realtime is not configured so the API starts normally
 * in local/test environments and the frontend's polling fallback stays in
 * charge.
 */
export function createRealtimeSealer(
  env: Record<string, string | undefined> = process.env
): RealtimeSealer | null {
  const secret = env.NEON_REALTIME_SECRET?.trim()
  if (!secret) return null

  const realtime = createRealtime({
    secret,
    db: databaseName(env.DATABASE_URL),
  })

  return {
    seal<Row>(query: RawSqlQuery<Row>): Promise<SealedLiveQuery<Row>> {
      return realtime.seal({ query })
    },
  }
}
