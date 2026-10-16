/**
 * PROTOTYPE (throwaway) — Board9: the real-card Kanban board, whose only
 * axis is the Issue card's density.
 *
 * Question: which Kanban Issue card density should ship — A compact, B
 * balanced or C roomy? (handoff 2026-10-16, Q5.)
 *
 * The card mirrors the **locked card spec** (handoff Q1/Q2/Q3/Q6/Q7) and
 * nothing else:
 *
 *   - 2-line clamped title, `text-sm font-medium`, full title on hover
 *   - top row: identifier · icon-only PriorityMark · spacer · assignee
 *   - labels on their own line, never wrapping, capped at two plus `+n`
 *   - no status accent on the card at all: the 4px `borderLeft` rail was
 *     dropped and so was the `color-mix` wash, so the surface is plain
 *     `--card` and status reads from the footer's icon+name (2026-10-16
 *     review, objections 1 and 2)
 *   - the priority icon is softened with `soft` so its tone does not compete
 *     with the identifier (2026-10-16 review)
 *   - footer: status menu left, due right
 *
 * It is a *copy*: `kanban-card.tsx` is on hold and is not touched, and the
 * real card has no density prop. Drag is real, though — the same
 * `@dnd-kit` sensors, `useDraggable`/`useDroppable` and the board's own
 * `resolveKanbanDrop`, over local stub state instead of an API mutation.
 *
 * The three variants differ in density only, deliberately: that is the axis
 * the user picked. `cards=all` puts them side by side because 4px of
 * padding is hard to judge while flipping between them.
 */
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { cn } from "cn"
import { Clock, UserRound } from "lucide-react"
import { useState } from "react"
import { resolveKanbanDrop } from "@/components/kanban-board"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import type { Issue, Label, Status } from "@/lib/api"
import { describeDueDate } from "@/lib/due"
import { StatusIcon } from "@/lib/status-icons"
import { PriorityMark } from "../atoms"
import {
  CARD_DENSITIES,
  type CardKey,
  type DensityKey,
} from "../prototype-config"
import { labels, people, statuses } from "../stub-data"

/** Cards per label row before the `+n` overflow pill (handoff Q2). */
const MAX_LABELS = 2

const DENSITY: Record<DensityKey, (typeof CARD_DENSITIES)[number]> =
  Object.fromEntries(CARD_DENSITIES.map((item) => [item.key, item])) as Record<
    DensityKey,
    (typeof CARD_DENSITIES)[number]
  >

const DENSITY_ORDER: readonly DensityKey[] = CARD_DENSITIES.map(
  (item) => item.key
)

const members = people.map((person) => ({ userId: person.id }))
const orderedStatuses = [...statuses].sort((a, b) => a.position - b.position)

/**
 * Fixtures chosen to exercise every corner of the card: a title that needs
 * both lines, three and four labels (so `+n` shows), `None` priority, no
 * labels, overdue and future due dates, assigned and unassigned, plus one
 * title that is a single unbreakable token (does the clamp survive that?).
 * `labels` carries label *names*, the convention `kanban-card.tsx` uses.
 */
function card(
  number: number,
  title: string,
  statusId: string,
  priority: Issue["priority"],
  assigneeId: string | null,
  labels: string[],
  extra: Partial<Issue> = {}
): Issue {
  return {
    id: `i-${number}`,
    projectId: "p-zc",
    number,
    keyPrefix: "ZC",
    identifier: `ZC-${number}`,
    title,
    description: null,
    statusId,
    priority,
    assigneeId,
    dueDate: null,
    archived: false,
    labels,
    parentId: null,
    updatedAt: "2026-10-15T09:20:00.000Z",
    ...extra,
  }
}

const CARD_ISSUES: Issue[] = [
  card(
    201,
    "Kanban drag drops the card back when the column is empty and the drop target has no measured height",
    "s-progress",
    "Urgent",
    "u-3",
    ["bug", "perf", "a11y"],
    { dueDate: "2026-10-14" }
  ),
  card(
    202,
    "Status colours are indistinguishable with deuteranopia",
    "s-progress",
    "High",
    "u-5",
    ["a11y"],
    { dueDate: "2026-10-22" }
  ),
  card(
    203,
    "Realtime subscription leaks when switching projects quickly",
    "s-progress",
    "Urgent",
    "u-6",
    ["bug", "perf"],
    { dueDate: "2026-10-15" }
  ),
  card(
    204,
    "Slow issue query on workspaces with many labels",
    "s-review",
    "Medium",
    "u-6",
    ["perf", "debt"]
  ),
  card(
    205,
    "Extract the issue query into a reusable hook",
    "s-todo",
    "None",
    null,
    []
  ),
  card(
    206,
    "postgres-connection-pool-exhaustion-under-sustained-websocket-reconnect-storms",
    "s-todo",
    "Low",
    null,
    ["debt", "perf", "bug", "docs"]
  ),
  card(207, "Keyboard: j/k to move between issues", "s-backlog", "Low", "u-1", [
    "feature",
    "a11y",
  ]),
  card(208, "Bulk archive of Done issues", "s-backlog", "None", null, [
    "feature",
  ]),
  card(209, "Per-project issue filter persistence", "s-done", "Medium", "u-2", [
    "feature",
    "docs",
    "debt",
    "bug",
  ]),
]

/** One label pill; truncates rather than wrapping (handoff Q7). */
function CardLabel({ label }: { label: Label }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
      <span
        data-testid={`density-label-dot-${label.name}`}
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span className="truncate">{label.name}</span>
    </span>
  )
}

/**
 * The card under review. Same seams as `kanban-card.tsx` minus the title
 * click (there is no detail route from the board here): `dragDisabled`
 * only detaches the drag sensor, so the `all` strip still shows the menus.
 */
function DensityCard({
  issue,
  density,
  labels,
  dragDisabled = false,
  onMove,
  onAssign,
}: {
  issue: Issue
  density: DensityKey
  labels: Label[]
  dragDisabled?: boolean
  onMove: (issue: Issue, statusId: string) => void
  onAssign: (issue: Issue, assigneeId: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: issue.id, disabled: dragDisabled })

  const status = statuses.find((item) => item.id === issue.statusId)
  const due = describeDueDate(issue.dueDate)
  const chips = issue.labels
    .map((name) => labels.find((label) => label.name === name))
    .filter((label): label is Label => label !== undefined)
  const shown = chips.slice(0, MAX_LABELS)
  const hidden = chips.length - shown.length
  const spec = DENSITY[density]

  return (
    <article
      ref={setNodeRef}
      data-testid={`density-card-${density}-${issue.identifier}`}
      className={cn("shrink-0 rounded-md border bg-card shadow-sm", spec.pad)}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.6 : undefined,
      }}
    >
      <div
        {...(dragDisabled ? {} : { ...attributes, ...listeners })}
        className={cn("flex flex-col", spec.gap)}
      >
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-muted-foreground text-xs">
            {issue.identifier}
          </span>
          <span
            role="img"
            aria-label={`Priority for ${issue.identifier}: ${issue.priority}`}
          >
            <PriorityMark priority={issue.priority} soft />
          </span>
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
                    onAssign(issue, null)
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
                      onAssign(issue, member.userId)
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
        </span>
        <span className="line-clamp-2 font-medium text-sm" title={issue.title}>
          {issue.title}
        </span>
        {chips.length > 0 && (
          <span className="flex items-center gap-1 overflow-hidden">
            {shown.map((label) => (
              <CardLabel key={label.id} label={label} />
            ))}
            {hidden > 0 && (
              <span
                className="shrink-0 rounded-full border px-1.5 py-0.5 text-muted-foreground text-xs"
                title={chips.map((label) => label.name).join(", ")}
              >
                +{hidden}
              </span>
            )}
          </span>
        )}
        <span className="flex items-center gap-2">
          {status && (
            <PropertyMenu
              label={`Move ${issue.identifier} to status`}
              triggerClassName="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
              preview={
                <>
                  <StatusIcon status={status} size={12} />
                  {status.name}
                </>
              }
            >
              {(close) => (
                <>
                  {statuses.map((option) => (
                    <PropertyMenuOption
                      key={option.id}
                      selected={option.id === issue.statusId}
                      onSelect={() => {
                        if (option.id !== issue.statusId) {
                          onMove(issue, option.id)
                        }
                        close()
                      }}
                    >
                      <StatusIcon status={option} size={13} />
                      {option.name}
                    </PropertyMenuOption>
                  ))}
                </>
              )}
            </PropertyMenu>
          )}
          {due && (
            <span
              className={cn(
                "ml-auto flex items-center gap-1 text-xs",
                due.overdue ? "text-destructive" : "text-muted-foreground"
              )}
            >
              <Clock aria-hidden="true" size={12} />
              {due.label}
            </span>
          )}
        </span>
      </div>
    </article>
  )
}

function DensityColumn({
  status,
  issues,
  density,
  labels,
  onMove,
  onAssign,
}: {
  status: Status
  issues: Issue[]
  density: DensityKey
  labels: Label[]
  onMove: (issue: Issue, statusId: string) => void
  onAssign: (issue: Issue, assigneeId: string | null) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <section
      ref={setNodeRef}
      className={cn(
        // Fixed width, not the real board's `min-w-72`: a card with one long
        // unbreakable title stretches a min-width column to its max-content,
        // which would make the densities impossible to compare (and hides the
        // clue that the real card needs `break-words`).
        "flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-md border bg-sidebar p-3",
        isOver && "ring-2 ring-ring"
      )}
    >
      <h4 className="flex items-center gap-2 px-1 pt-1 pb-1 font-medium text-sm">
        <StatusIcon status={status} />
        {status.name}{" "}
        <span className="rounded-full bg-accent px-1.5 text-muted-foreground text-xs">
          {issues.length}
        </span>
      </h4>
      {issues.map((issue) => (
        <DensityCard
          key={issue.id}
          issue={issue}
          density={density}
          labels={labels}
          onMove={onMove}
          onAssign={onAssign}
        />
      ))}
    </section>
  )
}

/**
 * Board "9". `cards` picks the density (or the side-by-side strip, which is
 * static: dropping onto a density would be meaningless).
 */
export function CardDensityBoard({ cards }: { cards: CardKey }) {
  const [issues, setIssues] = useState<Issue[]>(CARD_ISSUES)
  const [, setActiveId] = useState<string | null>(null)
  /**
   * Clicks must reach the card's menus: without a distance constraint the
   * pointer sensor claims pointer-down and the click never fires.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  function onMove(issue: Issue, statusId: string) {
    setIssues((prev) =>
      prev.map((item) => (item.id === issue.id ? { ...item, statusId } : item))
    )
  }

  function onAssign(issue: Issue, assigneeId: string | null) {
    setIssues((prev) =>
      prev.map((item) =>
        item.id === issue.id ? { ...item, assigneeId } : item
      )
    )
  }

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

  if (cards === "all") {
    return (
      <div className="proto-scroll flex min-h-0 flex-1 gap-2 overflow-x-auto p-3">
        {DENSITY_ORDER.map((key) => (
          <section
            key={key}
            className="flex w-72 shrink-0 flex-col gap-3 overflow-hidden rounded-md border bg-sidebar p-3"
          >
            <h4 className="flex items-baseline gap-2 px-1 pt-1 pb-1 font-medium text-sm">
              {key} · {DENSITY[key].name}
              <span className="text-muted-foreground text-xs">
                {DENSITY[key].pad} · {DENSITY[key].gap}
              </span>
            </h4>
            <div
              className={cn(
                "proto-scroll flex min-h-0 flex-1 flex-col overflow-y-auto",
                DENSITY[key].gap
              )}
            >
              {issues.map((issue) => (
                <DensityCard
                  key={issue.id}
                  issue={issue}
                  density={key}
                  labels={labels}
                  dragDisabled
                  onMove={onMove}
                  onAssign={onAssign}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto p-3 pb-2">
        {orderedStatuses.map((status) => (
          <DensityColumn
            key={status.id}
            status={status}
            issues={issues.filter((issue) => issue.statusId === status.id)}
            density={cards}
            labels={labels}
            onMove={onMove}
            onAssign={onAssign}
          />
        ))}
      </div>
    </DndContext>
  )
}
