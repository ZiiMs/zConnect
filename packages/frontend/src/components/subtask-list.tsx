import type { Issue, Status } from "@/lib/api"

/**
 * T5 one-level Subtask breakdown: the direct children of a parent Issue,
 * rendered with the same status vocabulary as the List view.
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

  const statusName = (statusId: string) =>
    statuses.find((s) => s.id === statusId)?.name ?? "Unknown"

  return (
    <ul className="flex flex-col gap-1" aria-label="Subtasks">
      {subtasks.map((subtask) => (
        <li
          key={subtask.id}
          data-testid={`subtask-${subtask.identifier}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2"
        >
          <span className="font-mono text-xs">{subtask.identifier}</span>
          <span className="text-sm">{subtask.title}</span>
          <span className="text-muted-foreground text-xs">
            {statusName(subtask.statusId)}
          </span>
        </li>
      ))}
    </ul>
  )
}
