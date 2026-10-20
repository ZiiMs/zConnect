import type {
  LiveQueryError,
  LiveQueryState,
  SealedLiveQuery,
} from "@neon/realtime/client"
import { useLiveQuery } from "@neon/realtime-react"
import { useEffect, useRef } from "react"
import { useSealedQuery } from "@/hooks/use-sealed-query"

export interface LiveQueryBridgeProps<Row> {
  /** Stable JSON of the query's parameters; a change starts a new query. */
  queryKey: string
  fetcher: () => Promise<SealedLiveQuery<Row>>
  enabled?: boolean
  onRows: (rows: readonly Row[]) => void
  onStatus?: (
    status: LiveQueryState["status"],
    error: LiveQueryError | undefined
  ) => void
}

/**
 * Fetch a sealed query, subscribe to it, and push each authoritative row
 * snapshot into existing component state. This is a bridge, not a data store:
 * the surfaces keep their REST loaders and polling fallbacks, and Realtime just
 * makes their rows live.
 */
export function LiveQueryBridge<Row>({
  queryKey,
  fetcher,
  enabled = true,
  onRows,
  onStatus,
}: LiveQueryBridgeProps<Row>) {
  const { sealed, refresh } = useSealedQuery(queryKey, fetcher, enabled)
  if (!sealed) return null
  return (
    <LiveQuerySubscription
      sealed={sealed}
      refreshQuery={refresh}
      onRows={onRows}
      onStatus={onStatus}
    />
  )
}

function LiveQuerySubscription<Row>({
  sealed,
  refreshQuery,
  onRows,
  onStatus,
}: {
  sealed: SealedLiveQuery<Row>
  refreshQuery: () => Promise<SealedLiveQuery<Row>>
  onRows: (rows: readonly Row[]) => void
  onStatus?: (
    status: LiveQueryState["status"],
    error: LiveQueryError | undefined
  ) => void
}) {
  const { data, status, error } = useLiveQuery(sealed, { refreshQuery })
  const rowsHandler = useRef(onRows)
  rowsHandler.current = onRows
  const statusHandler = useRef(onStatus)
  statusHandler.current = onStatus

  useEffect(() => {
    if (data !== undefined) rowsHandler.current(data)
  }, [data])

  useEffect(() => {
    statusHandler.current?.(status, error)
  }, [status, error])

  return null
}
