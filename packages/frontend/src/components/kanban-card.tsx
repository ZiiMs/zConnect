import { useDraggable } from "@dnd-kit/core"
import type { Issue, Status } from "@/lib/api"

/**
 * Kanban card: a draggable Issue. Pointer drags go through dnd-kit; the
 * status select is the keyboard-equivalent move that calls the same `onMove`
 * seam so drops and keyboard moves share one mutation path.
 */
export function KanbanCard({
  issue,
  statuses,
  canEdit,
  onMove,
}: {
  issue: Issue
  statuses: Status[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: issue.id, disabled: !canEdit })

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${issue.identifier}`}
      className="rounded-md border bg-background p-2"
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
              opacity: isDragging ? 0.6 : undefined,
            }
          : undefined
      }
    >
      <div
        {...(canEdit ? { ...attributes, ...listeners } : {})}
        className="flex flex-col gap-1"
      >
        <span className="font-mono text-xs">{issue.identifier}</span>
        <span className="font-medium text-sm">{issue.title}</span>
        <span className="text-muted-foreground text-xs">{issue.priority}</span>
      </div>
      {canEdit && (
        <select
          aria-label={`Move ${issue.identifier} to status`}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={issue.statusId}
          onChange={(e) => {
            if (e.target.value !== issue.statusId) {
              onMove(issue, e.target.value)
            }
          }}
        >
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      )}
    </article>
  )
}
