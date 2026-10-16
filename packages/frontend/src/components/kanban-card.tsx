import { useDraggable } from "@dnd-kit/core"
import { Clock, UserRound } from "lucide-react"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import type { Issue, Label, Status } from "@/lib/api"
import { describeDueDate } from "@/lib/due"
import { PriorityMark } from "@/lib/priority-icons"
import { StatusIcon } from "@/lib/status-icons"

/** Label pills a card shows before rolling the rest into `+n`. */
const MAX_LABELS = 2

/**
 * Kanban card: a draggable Issue. The assignee avatar and the status text
 * control open quick-assign / move menus that call the same `onAssign` /
 * `onMove` seams as drops and keyboard moves, so every path shares one
 * mutation.
 * Label chips take their swatch color from the T5 workspace registry when
 * `labels` is provided (spec ziim/zConnect#1 story 14 "workspace-shared
 * Labels with color").
 *
 * Layout: identifier, an icon-only Priority mark, then the assignee; a
 * two-line clamped title; label chips capped at two plus `+n`; and a footer
 * with the status control left and the due date right. The card carries no
 * status colour of its own. Read-only viewers get static marks and text.
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.id,
    disabled: !canEdit,
  })

  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color

  const issueStatus = statuses.find((status) => status.id === issue.statusId)
  const due = describeDueDate(issue.dueDate)
  const canAssign = canEdit && onAssign !== undefined
  const title = (
    <span
      title={issue.title}
      className="line-clamp-2 break-words font-medium text-sm"
    >
      {issue.title}
    </span>
  )

  return (
    <article
      ref={setNodeRef}
      data-testid={`kanban-card-${issue.identifier}`}
      className={`rounded-md border bg-card p-3 shadow-sm ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div
        {...(canEdit ? { ...attributes, ...listeners } : {})}
        className="flex flex-col gap-1.5"
      >
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-muted-foreground text-xs">
            {issue.identifier}
          </span>
          <PriorityMark
            priority={issue.priority}
            label={`Priority for ${issue.identifier}: ${issue.priority}`}
          />
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
            className="text-left hover:underline"
          >
            {title}
          </button>
        ) : (
          title
        )}
        {issue.labels.length > 0 && (
          <span className="flex items-center gap-1 overflow-hidden">
            {issue.labels.slice(0, MAX_LABELS).map((name) => {
              const color = colorFor(name)
              return (
                <span
                  key={name}
                  className="inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                >
                  {color && (
                    <span
                      data-testid={`label-dot-${name}`}
                      aria-hidden="true"
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span className="truncate">{name}</span>
                </span>
              )
            })}
            {issue.labels.length > MAX_LABELS && (
              <span
                data-testid={`label-overflow-${issue.identifier}`}
                className="shrink-0 rounded-full border px-1.5 py-0.5 text-muted-foreground text-xs"
                title={issue.labels.join(", ")}
              >
                +{issue.labels.length - MAX_LABELS}
              </span>
            )}
          </span>
        )}
        {(issueStatus || due) && (
          <span className="flex items-center gap-2">
            {issueStatus &&
              (canEdit ? (
                <PropertyMenu
                  label={`Move ${issue.identifier} to status`}
                  triggerClassName="inline-flex w-fit items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
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
                className={`ml-auto flex items-center gap-1 text-xs ${
                  due.overdue ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <Clock aria-hidden="true" size={12} />
                {due.label}
              </span>
            )}
          </span>
        )}
      </div>
    </article>
  )
}
