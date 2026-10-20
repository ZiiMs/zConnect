import { useEffect, useRef } from "react"

/** Fallback freshness bar: 30 s covers a dropped Realtime subscription. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000

export interface PollingOptions {
  /** Time between timer fires. Defaults to 30 000 ms. */
  intervalMs?: number
  /** Start/stop polling without unmounting (e.g. wait for the first query). */
  enabled?: boolean
}

function documentVisible(): boolean {
  return (
    typeof document === "undefined" || document.visibilityState !== "hidden"
  )
}

/**
 * Run `callback` on an interval and whenever the tab comes back into view.
 *
 * The browser has no database access. Realtime arrives as live SQL
 * subscriptions over WebSocket; this timer is the fallback that keeps issue lists, timelines, and
 * the unread badge fresh when the subscription is down. Calls are skipped while the
 * document is hidden, so a background tab does not issue requests nobody
 * reads. The latest callback is held in a ref, so an inline closure does not
 * tear down and rebuild the timer on every render; unmounting (or
 * `enabled: false`) removes the timer and both listeners.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  options: PollingOptions = {}
): void {
  const { intervalMs = DEFAULT_POLL_INTERVAL_MS, enabled = true } = options
  const latest = useRef(callback)
  latest.current = callback

  useEffect(() => {
    if (!enabled) return

    const fire = () => {
      if (!documentVisible()) return
      void latest.current()
    }
    const timer = setInterval(fire, intervalMs)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fire()
    }
    window.addEventListener("focus", fire)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", fire)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [enabled, intervalMs])
}
