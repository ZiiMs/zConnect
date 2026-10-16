import type { Issue, Status } from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

/**
 * T5 one-level Subtask breakdown: the direct children of a parent Issue,
 * rendered as nested rows (key, status mark, title) under a tree guide.
 */
export function SubtaskList({
  subtasks,
  statuses,
}: {
  subtasks: Issue[]
  statuses: Status[]
}) {
  if (subtasks.length === 0) {
    return <p className="text-muted-foreground text-sm">No subtasks yet.</p>
  }

  const statusOf = (statusId: string) => statuses.find((s) => s.id === statusId)

  return (
    <ul className="flex flex-col" aria-label="Subtasks">
      {subtasks.map((subtask) => {
        const status = statusOf(subtask.statusId)
        return (
          <li
            key={subtask.id}
            data-testid={`subtask-${subtask.identifier}`}
            className="flex items-center gap-2 py-1 text-sm"
          >
            <span className="shrink-0 font-mono text-muted-foreground text-xs">
              {subtask.identifier}
            </span>
            {status && <StatusIcon status={status} size={12} />}
            <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
            <span className="shrink-0 text-muted-foreground text-xs">
              {status?.name ?? "Unknown"}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
