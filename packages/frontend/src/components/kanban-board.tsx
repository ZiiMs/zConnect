import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
} from "@dnd-kit/core"
import { useState } from "react"
import { KanbanCard } from "@/components/kanban-card"
import type { Issue, Label, Status } from "@/lib/api"

/**
 * Maps a drag-end onto the Issue mutation it means. `activeId` is the
 * dragged Issue id; `overId` is the drop target: a Status id (column) or
 * another Issue id (card — takes its column). Returns null when the drop
 * changes nothing or names something unknown.
 */
export function resolveKanbanDrop(
  activeId: string,
  overId: string | null,
  issues: Issue[],
  statuses: Status[]
): { issue: Issue; toStatusId: string } | null {
  if (overId === null) return null
  const issue = issues.find((item) => item.id === activeId)
  if (!issue) return null
  const statusHit = statuses.find((status) => status.id === overId)
  const cardHit = issues.find((item) => item.id === overId)
  const toStatusId = statusHit?.id ?? cardHit?.statusId
  if (!toStatusId || toStatusId === issue.statusId) return null
  return { issue, toStatusId }
}

function KanbanColumn({
  status,
  issues,
  statuses,
  labels,
  canEdit,
  onMove,
}: {
  status: Status
  issues: Issue[]
  statuses: Status[]
  labels: Label[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <section
      ref={setNodeRef}
      data-testid={`kanban-column-${status.id}`}
      aria-label={status.name}
      className={`flex min-w-60 flex-col gap-2 rounded-md border p-2 ${isOver ? "ring-2 ring-ring" : ""}`}
    >
      <h4 className="font-medium text-sm">
        {status.name}{" "}
        <span className="text-muted-foreground text-xs">{issues.length}</span>
      </h4>
      {issues.map((issue) => (
        <KanbanCard
          key={issue.id}
          issue={issue}
          statuses={statuses}
          labels={labels}
          canEdit={canEdit}
          onMove={onMove}
        />
      ))}
    </section>
  )
}

/**
 * Kanban view: the same filtered Issue query as List and Table, grouped by
 * ordered Status. Drops resolve through `resolveKanbanDrop` into `onMove` so
 * the container runs the Issue API mutation with its optimistic update and
 * conflict handling; the board keeps no write state of its own.
 */
export function KanbanBoard({
  issues,
  statuses,
  labels = [],
  canEdit,
  onMove,
}: {
  issues: Issue[]
  statuses: Status[]
  /** T5 workspace registry for card label chip colors. */
  labels?: Label[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
}) {
  const [, setActiveId] = useState<string | null>(null)

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const resolved = resolveKanbanDrop(
      String(event.active.id),
      event.over ? String(event.over.id) : null,
      issues,
      statuses
    )
    if (resolved) onMove(resolved.issue, resolved.toStatusId)
  }

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No issues match the current filters.
      </p>
    )
  }

  const ordered = [...statuses].sort((a, b) => a.position - b.position)

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-2 overflow-x-auto">
        {ordered.map((status) => (
          <KanbanColumn
            key={status.id}
            status={status}
            issues={issues.filter((issue) => issue.statusId === status.id)}
            statuses={statuses}
            labels={labels}
            canEdit={canEdit}
            onMove={onMove}
          />
        ))}
      </div>
    </DndContext>
  )
}
