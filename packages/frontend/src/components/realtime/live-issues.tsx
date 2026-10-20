import type { LiveQueryError, LiveQueryState } from "@neon/realtime/client"
import { useCallback } from "react"
import { fetchSealedQuery } from "@/lib/realtime"
import type { Issue } from "@/lib/api"
import { LiveQueryBridge } from "./live-query"

export interface LiveIssueFilters {
  statusIds: string[]
  priorities: string[]
  /** undefined = everyone, null = unassigned, string = one member. */
  assigneeId?: string | null
  labels: string[]
  text: string
}

export function LiveIssuesBridge({
  projectId,
  filters,
  enabled = true,
  onRows,
  onStatus,
}: {
  projectId: string
  filters: LiveIssueFilters
  enabled?: boolean
  onRows: (rows: readonly Issue[]) => void
  onStatus?: (
    status: LiveQueryState["status"],
    error: LiveQueryError | undefined
  ) => void
}) {
  const queryKey = JSON.stringify({
    projectId,
    filters: { ...filters, text: filters.text.trim() },
  })
  const fetcher = useCallback(() => {
    const body = JSON.parse(queryKey) as {
      projectId: string
      filters: LiveIssueFilters
    }
    return fetchSealedQuery<Issue>(
      "/api/realtime/queries/project-issues",
      body
    )
  }, [queryKey])

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

/** One issue row, including an archived or off-filter deep link. */
export function LiveIssueBridge({
  issueRef,
  enabled = true,
  onRows,
  onStatus,
}: {
  issueRef: string
  enabled?: boolean
  onRows: (rows: readonly Issue[]) => void
  onStatus?: (
    status: LiveQueryState["status"],
    error: LiveQueryError | undefined
  ) => void
}) {
  const queryKey = JSON.stringify({ ref: issueRef })
  const fetcher = useCallback(
    () =>
      fetchSealedQuery<Issue>("/api/realtime/queries/issue", {
        ref: issueRef,
      }),
    [issueRef]
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
