import { useCallback, useEffect, useState } from "react"
import { usePolling } from "@/hooks/use-polling"
import { api } from "@/lib/api"

/** Badge label, capped so a busy Inbox never widens the rail. */
export function formatUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(count)
}

/**
 * Inbox unread count for the rail badge: fetched on mount, every 30 s, and
 * on window focus (ADR-0002 polling). A failed request is silent — the badge
 * keeps its last known value instead of surfacing an error in the shell.
 * `setCount` lets a child (Inbox) apply an immediate local update after
 * marking notifications read.
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const result = await api.unreadNotificationCount()
      setCount(result.count)
    } catch {
      // Silent by design: a stale badge is better than a shell error.
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  usePolling(refresh)

  return { count, setCount, refresh }
}
