import type { LiveQueryError, LiveQueryState } from "@neon/realtime/client"
import { useCallback } from "react"
import type { Notification } from "@/lib/api"
import { fetchSealedQuery } from "@/lib/realtime"
import { LiveQueryBridge } from "./live-query"

/** Newest notifications owned by the signed-in user. */
export function LiveNotificationsBridge({
  enabled = true,
  onRows,
  onStatus,
}: {
  enabled?: boolean
  onRows: (rows: readonly Notification[]) => void
  onStatus?: (
    status: LiveQueryState["status"],
    error: LiveQueryError | undefined
  ) => void
}) {
  const queryKey = JSON.stringify({ limit: 100 })
  const fetcher = useCallback(
    () =>
      fetchSealedQuery<Notification>("/api/realtime/queries/notifications", {
        limit: 100,
      }),
    []
  )

  return (
    <LiveQueryBridge
      queryKey={queryKey}
      fetcher={fetcher}
      enabled={enabled}
      onRows={onRows}
      onStatus={onStatus}
    />
  )
}

/** Live rail badge count, including reads from other tabs. */
export function LiveUnreadCountBridge({
  enabled = true,
  onCount,
}: {
  enabled?: boolean
  onCount: (count: number) => void
}) {
  const queryKey = "notifications-unread-count"
  const fetcher = useCallback(
    () =>
      fetchSealedQuery<{ count: number }>(
        "/api/realtime/queries/unread-count",
        {}
      ),
    []
  )

  return (
    <LiveQueryBridge
      queryKey={queryKey}
      fetcher={fetcher}
      enabled={enabled}
      onRows={(rows) => {
        const count = rows[0]?.count
        if (count !== undefined) onCount(count)
      }}
    />
  )
}
