import type { SealedLiveQuery } from "@neon/realtime/client"
import { useCallback, useEffect, useRef, useState } from "react"

interface SealedState<Row> {
  key: string
  sealed: SealedLiveQuery<Row>
}

/**
 * Fetch a sealed query for the current scope and keep it until the scope key
 * changes. The key is a stable JSON description of the query's parameters, so
 * a filter change or project switch tears down the old subscription instead of
 * letting stale rows cross scopes.
 *
 * A failed fetch leaves the bridge unmounted; the caller's polling fallback
 * keeps the surface fresh.
 */
export function useSealedQuery<Row>(
  key: string,
  fetcher: () => Promise<SealedLiveQuery<Row>>,
  enabled = true
): {
  sealed: SealedLiveQuery<Row> | null
  error: unknown
  refresh: () => Promise<SealedLiveQuery<Row>>
} {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const [state, setState] = useState<SealedState<Row> | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!enabled) {
      setState(null)
      setError(null)
      return
    }
    let cancelled = false
    setState(null)
    setError(null)
    fetcherRef.current().then(
      (sealed) => {
        if (!cancelled) setState({ key, sealed })
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason)
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, enabled])

  const refresh = useCallback(() => fetcherRef.current(), [])

  return {
    sealed: state?.key === key ? state.sealed : null,
    error,
    refresh,
  }
}
