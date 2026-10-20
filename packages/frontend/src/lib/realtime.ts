import {
  createRealtimeClient,
  defineParsers,
  pgTypeOids,
  type SealedLiveQuery,
} from "@neon/realtime/client"
import { z } from "zod"
import { API_URL, ApiError } from "@/lib/api"

/**
 * Neon Realtime browser wiring. The URL is public; the secret never leaves the
 * API. The client opens one WebSocket and multiplexes every subscription.
 */
const realtimeUrl = import.meta.env.VITE_NEON_REALTIME_URL as string | undefined

/**
 * Component tests render without a Realtime provider and without network
 * access. Vitest sets MODE=test, so the live bridges stay off there even when a
 * developer has `.env.local` pointing at a real branch.
 */
export const realtimeEnabled =
  Boolean(realtimeUrl) && import.meta.env.MODE !== "test"

/**
 * Realtime returns timestamps in PostgreSQL's text format. The REST API sends
 * ISO strings, so parse them here to keep both paths' row shapes identical.
 */
export const realtimeParsers = defineParsers({
  [pgTypeOids.timestamptz]: (value) => new Date(value).toISOString(),
  [pgTypeOids.timestamp]: (value) => new Date(`${value}Z`).toISOString(),
  [pgTypeOids.date]: (value) => value,
})

export const realtimeClient = realtimeEnabled
  ? createRealtimeClient({ url: realtimeUrl!, parsers: realtimeParsers })
  : null

const sealedQuerySchema = z.object({
  capability: z.string().min(1),
  expiresAt: z.number(),
  queryFingerprint: z.string().min(1),
})

/**
 * Ask the API for a sealed live query. Sealed queries are bearer capabilities:
 * POST them, keep them out of URLs and storage, and let the SDK renew them via
 * the live bridge's `refreshQuery`.
 */
export async function fetchSealedQuery<Row>(
  path: string,
  body: unknown
): Promise<SealedLiveQuery<Row>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : res.statusText
    throw new ApiError(res.status, message)
  }
  const parsed = sealedQuerySchema.parse(json)
  return parsed as SealedLiveQuery<Row>
}
