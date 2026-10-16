import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useState } from "react"
import { KanbanCard } from "@/components/kanban-card"
import type { Issue, Label, Status } from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

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
  members,
  labels,
  canEdit,
  onMove,
  onAssign,
  onOpenDetail,
}: {
  status: Status
  issues: Issue[]
  statuses: Status[]
  members: { userId: string }[]
  labels: Label[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
  onAssign?: (issue: Issue, assigneeId: string | null) => void
  onOpenDetail?: (issue: Issue) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  // Fixed width, not `min-w-72`: a lane sized by its content stretches to the
  // longest unbreakable token in a title, and `break-words` on the card cannot
  // lower max-content, so the wrap only happens under a bounded width.
  return (
    <section
      ref={setNodeRef}
      data-testid={`kanban-column-${status.id}`}
      aria-label={status.name}
      className={`flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-md border bg-sidebar p-3 ${isOver ? "ring-2 ring-ring" : ""}`}
    >
      <h4 className="flex items-center gap-2 px-1 pt-1 pb-1 font-medium text-sm">
        <StatusIcon status={status} />
        {status.name}{" "}
        <span className="rounded-full bg-accent px-1.5 text-muted-foreground text-xs">
          {issues.length}
        </span>
      </h4>
      {issues.map((issue) => (
        <KanbanCard
          key={issue.id}
          issue={issue}
          statuses={statuses}
          members={members}
          labels={labels}
          canEdit={canEdit}
          onMove={onMove}
          onAssign={onAssign}
          onOpenDetail={onOpenDetail}
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
  members = [],
  labels = [],
  canEdit,
  onMove,
  onAssign,
  onOpenDetail,
}: {
  issues: Issue[]
  statuses: Status[]
  /** Workspace members for the card quick-assign menus. */
  members?: { userId: string }[]
  /** T5 workspace registry for card label chip colors. */
  labels?: Label[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
  /** Card quick-assign; absent means no assign control. */
  onAssign?: (issue: Issue, assigneeId: string | null) => void
  /** Card title click: opens the detail view. */
  onOpenDetail?: (issue: Issue) => void
}) {
  const [, setActiveId] = useState<string | null>(null)
  /**
   * Clicks must reach the card's menus: without a distance constraint the
   * pointer sensor claims pointer-down and the click never fires.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

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
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-[calc(100svh-5rem)] items-stretch gap-2 overflow-x-auto pb-2">
        {ordered.map((status) => (
          <KanbanColumn
            key={status.id}
            status={status}
            issues={issues.filter((issue) => issue.statusId === status.id)}
            statuses={statuses}
            members={members}
            labels={labels}
            canEdit={canEdit}
            onMove={onMove}
            onAssign={onAssign}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </DndContext>
  )
}
