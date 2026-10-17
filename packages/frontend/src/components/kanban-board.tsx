import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { KanbanCard } from "@/components/kanban-card"
import type { Issue, Label, MemberRef, Status } from "@/lib/api"
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

/**
 * Collapsed Kanban statuses, persisted per user + project in localStorage
 * (`zconnect:kanban-collapsed:<userId>:<projectId>`), the same MVP store the
 * filter bar uses; server-side preferences are deferred.
 */
function collapsedStorageKey(userId: string, projectId: string): string {
  return `zconnect:kanban-collapsed:${userId}:${projectId}`
}

/** The Status ids collapsed for this user in this project; unreadable storage reads as none. */
export function loadCollapsedStatuses(
  userId: string,
  projectId: string
): string[] {
  try {
    const raw = localStorage.getItem(collapsedStorageKey(userId, projectId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : []
  } catch {
    return []
  }
}

export function saveCollapsedStatuses(
  userId: string,
  projectId: string,
  statusIds: string[]
): void {
  localStorage.setItem(
    collapsedStorageKey(userId, projectId),
    JSON.stringify(statusIds)
  )
}

function KanbanColumn({
  status,
  issues,
  statuses,
  members,
  labels,
  canEdit,
  collapsed,
  onToggleCollapsed,
  onMove,
  onAssign,
  onOpenDetail,
}: {
  status: Status
  issues: Issue[]
  statuses: Status[]
  members: MemberRef[]
  labels: Label[]
  canEdit: boolean
  /** Collapsed to a strip: header and count stay, the cards are hidden. */
  collapsed: boolean
  onToggleCollapsed: () => void
  onMove: (issue: Issue, statusId: string) => void
  onAssign?: (issue: Issue, assigneeId: string | null) => void
  onOpenDetail?: (issue: Issue) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  // Fixed width, not `min-w-72`: a lane sized by its content stretches to the
  // longest unbreakable token in a title, and `break-words` on the card cannot
  // lower max-content, so the wrap only happens under a bounded width. The
  // collapsed strip is a fixed narrow rail, still a drop target: the droppable
  // ref stays on the section either way.
  return (
    <section
      ref={setNodeRef}
      data-testid={`kanban-column-${status.id}`}
      aria-label={status.name}
      className={`flex shrink-0 flex-col overflow-y-auto rounded-md border bg-sidebar ${
        collapsed ? "w-11 items-center gap-3 px-1 py-3" : "w-72 gap-3 p-3"
      } ${isOver ? "ring-2 ring-ring" : ""}`}
    >
      <h4
        className={`flex gap-2 font-medium text-sm ${
          collapsed ? "flex-col items-center" : "items-center px-1 pt-1 pb-1"
        }`}
      >
        <StatusIcon status={status} />
        <span className={collapsed ? "[writing-mode:vertical-rl]" : undefined}>
          {status.name}
        </span>{" "}
        <span className="rounded-full bg-accent px-1.5 text-muted-foreground text-xs">
          {issues.length}
        </span>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${status.name}`}
          onClick={onToggleCollapsed}
          className={`grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring ${
            collapsed ? "" : "ml-auto"
          }`}
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" size={14} />
          ) : (
            <ChevronLeft aria-hidden="true" size={14} />
          )}
        </button>
      </h4>
      {!collapsed &&
        issues.map((issue) => (
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
 * ordered Status. `visibleStatusIds` hides the filtered-out boards; without
 * it every status renders a column. Drops resolve through `resolveKanbanDrop` into `onMove` so
 * the container runs the Issue API mutation with its optimistic update and
 * conflict handling; the board keeps no write state of its own.
 *
 * Each Status header carries a collapse control: the status narrows to a
 * strip that keeps the mark, name and count and hides its cards. The
 * collapsed set is a per-user-per-project localStorage preference, so it
 * outlives a reload and is independent of the Issue data above.
 */
export function KanbanBoard({
  issues,
  statuses,
  members = [],
  labels = [],
  userId,
  projectId,
  canEdit,
  visibleStatusIds,
  onMove,
  onAssign,
  onOpenDetail,
}: {
  issues: Issue[]
  statuses: Status[]
  /** Workspace members for the card quick-assign menus. */
  members?: MemberRef[]
  /** T5 workspace registry for card label chip colors. */
  labels?: Label[]
  /** The collapsed-status store is keyed by viewer and project. */
  userId: string
  projectId: string
  canEdit: boolean
  /**
   * Status ids the filter keeps visible. A non-empty selection hides every
   * other board; empty/undefined (All Issues) shows them all. `statuses`
   * stays complete so card menus can still move issues anywhere.
   */
  visibleStatusIds?: string[]
  onMove: (issue: Issue, statusId: string) => void
  /** Card quick-assign; absent means no assign control. */
  onAssign?: (issue: Issue, assigneeId: string | null) => void
  /** Card title click: opens the detail view. */
  onOpenDetail?: (issue: Issue) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsedStatusIds, setCollapsedStatusIds] = useState<string[]>(() =>
    loadCollapsedStatuses(userId, projectId)
  )

  /** The issue under the pointer: rendered in a portal overlay above the
   * boards so the preview never slides underneath a neighbouring board. */
  const activeIssue =
    activeId !== null
      ? (issues.find((issue) => issue.id === activeId) ?? null)
      : null

  function toggleCollapsed(statusId: string) {
    const next = collapsedStatusIds.includes(statusId)
      ? collapsedStatusIds.filter((id) => id !== statusId)
      : [...collapsedStatusIds, statusId]
    setCollapsedStatusIds(next)
    saveCollapsedStatuses(userId, projectId, next)
  }

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
  const visible =
    visibleStatusIds !== undefined && visibleStatusIds.length > 0
      ? ordered.filter((status) => visibleStatusIds.includes(status.id))
      : ordered

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden pb-2">
        {visible.map((status) => (
          <KanbanColumn
            key={status.id}
            status={status}
            issues={issues.filter((issue) => issue.statusId === status.id)}
            statuses={statuses}
            members={members}
            labels={labels}
            canEdit={canEdit}
            collapsed={collapsedStatusIds.includes(status.id)}
            onToggleCollapsed={() => toggleCollapsed(status.id)}
            onMove={onMove}
            onAssign={onAssign}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? (
          <div
            data-testid="kanban-drag-overlay"
            className="w-72 rotate-1 cursor-grabbing rounded-md border bg-card p-3 shadow-xl"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-muted-foreground text-xs">
                {activeIssue.identifier}
              </span>
            </div>
            <p className="line-clamp-2 break-words font-medium text-sm">
              {activeIssue.title}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
