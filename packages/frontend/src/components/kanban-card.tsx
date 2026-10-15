import { useDraggable } from "@dnd-kit/core"
import type { Issue, Label, Status } from "@/lib/api"

/**
 * Kanban card: a draggable Issue. Pointer drags go through dnd-kit; the
 * status select is the keyboard-equivalent move that calls the same `onMove`
 * seam so drops and keyboard moves share one mutation path. Label chips take
 * their swatch color from the T5 workspace registry when `labels` is
 * provided (spec ziim/zConnect#1 story 14 "workspace-shared Labels with
 * color").
 */
export function KanbanCard({
  issue,
  statuses,
  labels = [],
  canEdit,
  onMove,
}: {
  issue: Issue
  statuses: Status[]
  /** T5 workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: issue.id, disabled: !canEdit })

  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color

  const showFooter = issue.assigneeId != null || issue.dueDate != null

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${issue.identifier}`}
      className="rounded-lg border bg-background p-3.5 shadow-sm"
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
        className="flex flex-col gap-1.5"
      >
        <span className="font-mono text-xs">{issue.identifier}</span>
        <span className="font-medium text-sm">{issue.title}</span>
        <span className="line-clamp-2 text-muted-foreground text-xs">
          {issue.description ?? "No description yet."}
        </span>
        <span className="text-muted-foreground text-xs">{issue.priority}</span>
        {issue.labels.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {issue.labels.map((name) => {
              const color = colorFor(name)
              return (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                >
                  {color && (
                    <span
                      data-testid={`label-dot-${name}`}
                      aria-hidden="true"
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {name}
                </span>
              )
            })}
          </span>
        )}
        {showFooter && (
          <span className="mt-2.5 flex items-center gap-2 border-t pt-2.5 text-muted-foreground text-xs">
            {issue.assigneeId && (
              <span className="max-w-28 truncate">{issue.assigneeId}</span>
            )}
            {issue.dueDate && <span className="ml-auto">{issue.dueDate}</span>}
          </span>
        )}
      </div>
      {canEdit && (
        <select
          aria-label={`Move ${issue.identifier} to status`}
          className="mt-2.5 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
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
