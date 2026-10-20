import type { LiveQueryError, LiveQueryState } from "@neon/realtime/client"
import { useCallback } from "react"
import {
  type ActivityActorType,
  type TimelineItem,
} from "@/lib/api"
import { fetchSealedQuery } from "@/lib/realtime"
import { LiveQueryBridge } from "./live-query"

/** Query row shape from `timelineQuery` in the backend. */
interface TimelineRow {
  kind: "comment" | "activity"
  id: string
  issueId: string
  authorId: string | null
  body: string | null
  parentId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  actorType: ActivityActorType | null
  actorId: string | null
  type: string | null
  summary: string | null
  payload: Record<string, unknown> | null
}

function toTimelineItems(rows: readonly TimelineRow[]): TimelineItem[] {
  return rows.map((row) => {
    if (row.kind === "comment") {
      return {
        kind: "comment",
        id: row.id,
        issueId: row.issueId,
        authorId: row.authorId ?? "",
        body: row.body ?? "",
        parentId: row.parentId,
        editedAt: row.editedAt,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
      }
    }
    return {
      kind: "activity",
      id: row.id,
      issueId: row.issueId,
      actorType: row.actorType ?? "system",
      actorId: row.actorId,
      type: row.type ?? "",
      summary: row.summary ?? "",
      payload: row.payload ?? {},
      createdAt: row.createdAt,
    }
  })
}

/** Newest timeline page for one issue, merged into the paged feed. */
export function LiveTimelineBridge({
  issueRef,
  enabled = true,
  onRows,
  onStatus,
}: {
  issueRef: string
  enabled?: boolean
  onRows: (rows: readonly TimelineItem[]) => void
  onStatus?: (
    status: LiveQueryState["status"],
    error: LiveQueryError | undefined
  ) => void
}) {
  const queryKey = JSON.stringify({ ref: issueRef, limit: 50 })
  const fetcher = useCallback(
    () =>
      fetchSealedQuery<TimelineRow>("/api/realtime/queries/timeline", {
        ref: issueRef,
        limit: 50,
      }),
    [issueRef]
  )

  return (
    <LiveQueryBridge
      queryKey={queryKey}
      fetcher={fetcher}
      enabled={enabled}
      onRows={(rows) => onRows(toTimelineItems(rows))}
      onStatus={onStatus}
    />
  )
}
