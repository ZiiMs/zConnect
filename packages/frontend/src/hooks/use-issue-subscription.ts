import { useEffect, useRef } from "react"
import { type Issue, issueSchema } from "@/lib/api"

/**
 * Supabase Realtime ships raw Postgres rows (snake_case), while the app
 * speaks camelCase `Issue`. Map before `issueSchema.safeParse` so live
 * events parse instead of dropping. Accepts already-camel payloads too
 * (tests, future callers) by preferring camel keys when both exist.
 */
export function fromRealtimeRow(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw
  const row = raw as Record<string, unknown>
  const pick = (camel: string, snake: string): unknown =>
    row[camel] !== undefined ? row[camel] : row[snake]
  return {
    id: row.id,
    projectId: pick("projectId", "project_id"),
    number: row.number,
    keyPrefix: pick("keyPrefix", "key_prefix"),
    identifier: row.identifier,
    title: row.title,
    description: row.description ?? null,
    statusId: pick("statusId", "status_id"),
    priority: row.priority,
    assigneeId: pick("assigneeId", "assignee_id") ?? null,
    dueDate: pick("dueDate", "due_date") ?? null,
    archived: row.archived ?? false,
    labels: row.labels ?? [],
    parentId: pick("parentId", "parent_id") ?? null,
    updatedAt: pick("updatedAt", "updated_at") ?? null,
    warnings: row.warnings,
  }
}

export interface IssueRealtimeEvent {
  type: "INSERT" | "UPDATE"
  issue: Issue
}

/**
 * Live Issue stream for one project (T4). Subscribes to Supabase Postgres
 * changes on the `issue` table filtered by project, so a second session sees
 * inserts and updates without a manual refresh.
 *
 * Wiring: the `issue` table must be in the `supabase_realtime` publication
 * and readable under RLS for the merge in `ProjectIssues` to matter; the
 * Supabase client loads lazily so pages without `VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_ANON_KEY` (and the Vitest suite, which has no `.env`) keep
 * working on the polled query alone. Malformed payloads are dropped.
 */
export function useIssueSubscription(
  projectId: string,
  onEvent: (event: IssueRealtimeEvent) => void
): void {
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    async function subscribe() {
      try {
        const { supabase } = await import("@/lib/supabase")
        if (cancelled) return
        const emit =
          (type: IssueRealtimeEvent["type"]) => (payload: { new: unknown }) => {
            const parsed = issueSchema.safeParse(fromRealtimeRow(payload.new))
            if (parsed.success) handler.current({ type, issue: parsed.data })
          }
        const channel = supabase
          .channel(`project-issues:${projectId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "issue",
              filter: `project_id=eq.${projectId}`,
            },
            emit("INSERT")
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "issue",
              filter: `project_id=eq.${projectId}`,
            },
            emit("UPDATE")
          )
          .subscribe()
        cleanup = () => {
          void supabase.removeChannel(channel)
        }
      } catch {
        // Realtime unavailable (no Supabase env, offline test run): the
        // filtered Issue query remains the source of truth.
      }
    }

    void subscribe()
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [projectId])
}
