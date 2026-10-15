import type { ReactNode } from "react"
import type { Issue, Status } from "@/lib/api"

/**
 * List view: compact rows of the same filtered Issue query the Table and
 * Kanban views share. Status changes go through `onStatusChange` so the
 * container can run the lifecycle mutation (Todo through Done). Per-row
 * `actions` (T5 archive/subtask controls) render after the status control
 * when provided.
 */
export function IssueList({
  issues,
  statuses,
  canEdit,
  onStatusChange,
  actions,
}: {
  issues: Issue[]
  statuses: Status[]
  canEdit: boolean
  onStatusChange: (issue: Issue, statusId: string) => void
  actions?: (issue: Issue) => ReactNode
}) {
  const statusName = (statusId: string) =>
    statuses.find((s) => s.id === statusId)?.name ?? "Unknown"

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No issues match the current filters.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {issues.map((issue) => (
        <li
          key={issue.id}
          data-testid={`issue-${issue.identifier}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3"
        >
          <span className="font-mono text-xs">{issue.identifier}</span>
          <span className="font-medium text-sm">{issue.title}</span>
          <span className="text-muted-foreground text-xs">
            {issue.priority}
          </span>
          {issue.labels.map((name) => (
            <span
              key={name}
              className="rounded-full border px-2 py-0.5 text-xs"
            >
              {name}
            </span>
          ))}
          {canEdit ? (
            <select
              aria-label={`Status for ${issue.identifier}`}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={issue.statusId}
              onChange={(e) => onStatusChange(issue, e.target.value)}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground text-xs">
              {statusName(issue.statusId)}
            </span>
          )}
          {actions?.(issue)}
        </li>
      ))}
    </ul>
  )
}
