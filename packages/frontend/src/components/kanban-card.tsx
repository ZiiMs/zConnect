import { useDraggable } from "@dnd-kit/core"
import { Clock, UserRound } from "lucide-react"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import type { Issue, Label, Status } from "@/lib/api"
import { describeDueDate } from "@/lib/due"
import { StatusIcon } from "@/lib/status-icons"

/**
 * Kanban card: a draggable Issue. The assignee avatar and the status pill
 * open quick-assign / move menus that call the same `onAssign` / `onMove`
 * seams as drops and keyboard moves, so every path shares one mutation.
 * Label chips take their swatch color from the T5 workspace registry when
 * `labels` is provided (spec ziim/zConnect#1 story 14 "workspace-shared
 * Labels with color").
 *
 * Layout: identifier plus assignee, semibold title, labels, the status
 * pill, then the due row. Read-only viewers get static marks and text.
 */
export function KanbanCard({
  issue,
  statuses,
  members = [],
  labels = [],
  canEdit,
  onMove,
  onAssign,
  onOpenDetail,
}: {
  issue: Issue
  statuses: Status[]
  /** Workspace members for the quick-assign menu. */
  members?: { userId: string }[]
  /** T5 workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  canEdit: boolean
  onMove: (issue: Issue, statusId: string) => void
  /** Quick-assign from the avatar menu; absent means no assign control. */
  onAssign?: (issue: Issue, assigneeId: string | null) => void
  /** Title click: opens the detail view. */
  onOpenDetail?: (issue: Issue) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: issue.id, disabled: !canEdit })

  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color

  const issueStatus = statuses.find((status) => status.id === issue.statusId)
  const due = describeDueDate(issue.dueDate)
  const canAssign = canEdit && onAssign !== undefined

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${issue.identifier}`}
      className="rounded-md border bg-card p-3 shadow-sm"
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
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-muted-foreground text-xs">
            {issue.identifier}
          </span>
          {canAssign ? (
            <PropertyMenu
              label={`Assignee for ${issue.identifier}`}
              triggerClassName="ml-auto grid size-6 shrink-0 place-items-center rounded-full hover:bg-accent"
              preview={
                issue.assigneeId ? (
                  <span
                    className="grid size-6 place-items-center rounded-full bg-muted text-muted-foreground"
                    title={issue.assigneeId}
                  >
                    <UserRound aria-hidden="true" size={12} />
                  </span>
                ) : (
                  <span
                    className="grid size-6 place-items-center rounded-full border border-muted-foreground border-dashed text-muted-foreground"
                    title="Unassigned"
                  >
                    <UserRound aria-hidden="true" size={12} />
                  </span>
                )
              }
            >
              {(close) => (
                <>
                  <PropertyMenuOption
                    selected={issue.assigneeId === null}
                    onSelect={() => {
                      onAssign?.(issue, null)
                      close()
                    }}
                  >
                    Unassigned
                  </PropertyMenuOption>
                  {members.map((member) => (
                    <PropertyMenuOption
                      key={member.userId}
                      selected={member.userId === issue.assigneeId}
                      onSelect={() => {
                        onAssign?.(issue, member.userId)
                        close()
                      }}
                    >
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                        title={member.userId}
                      >
                        <UserRound aria-hidden="true" size={10} />
                      </span>
                      <span className="truncate">{member.userId}</span>
                    </PropertyMenuOption>
                  ))}
                </>
              )}
            </PropertyMenu>
          ) : issue.assigneeId ? (
            <span
              className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
              title={issue.assigneeId}
            >
              <UserRound aria-hidden="true" size={12} />
            </span>
          ) : null}
        </span>
        {onOpenDetail ? (
          <button
            type="button"
            aria-label={`Open detail for ${issue.identifier}`}
            onClick={() => onOpenDetail(issue)}
            className="text-left font-medium text-sm hover:underline"
          >
            {issue.title}
          </button>
        ) : (
          <span className="font-medium text-sm">{issue.title}</span>
        )}
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
        {issueStatus &&
          (canEdit ? (
            <PropertyMenu
              label={`Move ${issue.identifier} to status`}
              triggerClassName="inline-flex w-fit items-center gap-1.5 rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
              preview={
                <>
                  <StatusIcon status={issueStatus} size={12} />
                  {issueStatus.name}
                </>
              }
            >
              {(close) => (
                <>
                  {statuses.map((status) => (
                    <PropertyMenuOption
                      key={status.id}
                      selected={status.id === issue.statusId}
                      onSelect={() => {
                        if (status.id !== issue.statusId) {
                          onMove(issue, status.id)
                        }
                        close()
                      }}
                    >
                      <StatusIcon status={status} size={13} />
                      {status.name}
                    </PropertyMenuOption>
                  ))}
                </>
              )}
            </PropertyMenu>
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              <StatusIcon status={issueStatus} size={12} />
              {issueStatus.name}
            </span>
          ))}
        {due && (
          <span
            className={`flex items-center gap-1 text-xs ${
              due.overdue ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            <Clock aria-hidden="true" size={12} />
            {due.label}
          </span>
        )}
      </div>
    </article>
  )
}
