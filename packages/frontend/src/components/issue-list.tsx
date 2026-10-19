import { Circle, Clock } from "lucide-react"
import { type ReactNode, useState } from "react"
import type {
  IssueDisplayProps,
  IssueGroupBy,
  IssueOrder,
} from "@/components/issue-filter-bar"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import { AssigneeAvatar, UserAvatar } from "@/components/user-avatar"
import {
  findMember,
  type Issue,
  type Label,
  type MemberRef,
  memberName,
  type Priority,
  type Status,
  type UpdateIssueInput,
} from "@/lib/api"
import { describeDueDate, formatTimestamp } from "@/lib/due"
import { PriorityMark } from "@/lib/priority-icons"
import { statusColor } from "@/lib/status-colors"
import { StatusIcon } from "@/lib/status-icons"

const PRIORITY_ORDER: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

/** One row in tree order: the issue plus its nesting depth (0 = top-level). */
type RowWithDepth = {
  issue: Issue
  depth: number
}

type Group = {
  key: string
  title: string
  /** Header mark; status groups show the status mark, priority groups the priority mark. */
  icon: ReactNode
  /** Gradient wash; only status groups carry their color. */
  wash?: string
  rows: RowWithDepth[]
  /** Group quick-add; only status groups open the composer preselected. */
  addStatusId?: string
}

function AssigneeMark({
  member,
  assigneeId,
}: {
  member?: MemberRef
  assigneeId: string | null
}) {
  if (assigneeId === null) {
    return (
      <Circle
        aria-hidden="true"
        size={13}
        className="shrink-0 text-muted-foreground"
      />
    )
  }
  return <AssigneeAvatar member={member} userId={assigneeId} size={20} />
}

/**
 * Arrange filtered rows into a one-level tree: children (`parentId`) nest
 * under their parent with depth 1, indented in the row. Parents missing from
 * the filtered set (different group, filtered out) leave the child as a
 * top-level row so it never disappears. Roots and siblings follow the view
 * ordering (issue number = creation order).
 */
function buildForest(rows: Issue[], order: IssueOrder): RowWithDepth[] {
  const byId = new Map(rows.map((issue) => [issue.id, issue]))
  const childrenByParent = new Map<string, Issue[]>()
  const roots: Issue[] = []
  for (const issue of rows) {
    const parentId = issue.parentId ?? null
    if (parentId && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(issue)
      childrenByParent.set(parentId, siblings)
    } else {
      roots.push(issue)
    }
  }
  const sorted = (list: Issue[]): Issue[] =>
    [...list].sort((a, b) =>
      order === "newest" ? b.number - a.number : a.number - b.number
    )
  const out: RowWithDepth[] = []
  function walk(list: Issue[], depth: number) {
    for (const node of sorted(list)) {
      out.push({ issue: node, depth })
      const kids = childrenByParent.get(node.id)
      if (kids) walk(kids, depth + 1)
    }
  }
  walk(roots, 0)
  return out
}

/**
 * Priority mark, icon-only, pinned left of the slug. Editors get a menu to
 * change it; read-only viewers (or rows without an update seam) see the
 * static mark.
 */
function PriorityControl({
  issue,
  canEdit,
  onUpdate,
}: {
  issue: Issue
  canEdit: boolean
  onUpdate?: (issue: Issue, input: UpdateIssueInput) => void
}) {
  const mark = (
    <PriorityMark
      priority={issue.priority}
      label={`Priority for ${issue.identifier}: ${issue.priority}`}
    />
  )
  if (!canEdit || !onUpdate) return mark
  return (
    <PropertyMenu
      label={`Priority for ${issue.identifier}`}
      triggerClassName="grid size-6 shrink-0 place-items-center rounded-md hover:bg-accent"
      preview={mark}
    >
      {(close) => (
        <>
          {PRIORITY_ORDER.map((priority) => (
            <PropertyMenuOption
              key={priority}
              selected={priority === issue.priority}
              onSelect={() => {
                if (priority !== issue.priority) {
                  onUpdate(issue, { priority })
                }
                close()
              }}
            >
              <PriorityMark priority={priority} />
              {priority}
            </PropertyMenuOption>
          ))}
        </>
      )}
    </PropertyMenu>
  )
}

/**
 * Assignee avatar with an always-present control: assigned rows show the
 * avatar, unassigned rows show the dashed placeholder so there is always
 * something to click. Editors get the quick-assign menu; read-only viewers
 * see the static mark.
 */
function AssigneeControl({
  issue,
  members,
  canEdit,
  onUpdate,
}: {
  issue: Issue
  members: MemberRef[]
  canEdit: boolean
  onUpdate?: (issue: Issue, input: UpdateIssueInput) => void
}) {
  const member = findMember(members, issue.assigneeId)
  const preview = (
    <AssigneeAvatar
      member={member}
      userId={issue.assigneeId}
      size={20}
      tooltip={false}
    />
  )
  if (!canEdit || !onUpdate) {
    return (
      <span
        title={
          issue.assigneeId ? memberName(member, issue.assigneeId) : "Unassigned"
        }
      >
        {preview}
      </span>
    )
  }
  return (
    <PropertyMenu
      label={`Assignee for ${issue.identifier}`}
      triggerClassName="grid size-6 shrink-0 place-items-center rounded-full hover:bg-accent"
      preview={preview}
    >
      {(close) => (
        <>
          <PropertyMenuOption
            selected={issue.assigneeId === null}
            onSelect={() => {
              if (issue.assigneeId !== null) {
                onUpdate(issue, { assigneeId: null })
              }
              close()
            }}
          >
            <span className="truncate text-muted-foreground">Unassigned</span>
          </PropertyMenuOption>
          {members.map((candidate) => (
            <PropertyMenuOption
              key={candidate.userId}
              selected={candidate.userId === issue.assigneeId}
              onSelect={() => {
                if (candidate.userId !== issue.assigneeId) {
                  onUpdate(issue, { assigneeId: candidate.userId })
                }
                close()
              }}
            >
              <UserAvatar
                name={memberName(candidate, candidate.userId)}
                image={candidate.image}
                size={20}
              />
              <span className="truncate">
                {memberName(candidate, candidate.userId)}
              </span>
            </PropertyMenuOption>
          ))}
        </>
      )}
    </PropertyMenu>
  )
}

/**
 * List view: the same filtered Issue query the Table and Kanban views
 * share, grouped by the view preference (status lanes, priority lanes,
 * assignee lanes, or flat) with newest/oldest ordering inside each group.
 * Status groups are collapsible sections headed in a wash of the status
 * color, each with a quick-add. Status changes go through `onStatusChange`
 * so the container can run the lifecycle mutation; priority and assignee
 * edits go through `onUpdate` when provided; titles open the detail
 * view through `onOpenDetail`. Per-row `actions` render below the row when
 * provided. Label chips take their swatch color from the T5 workspace
 * registry when `labels` is provided (story 14 "workspace-shared Labels
 * with color"); names without a registry entry render as plain text.
 *
 * Dense rows read left to right: icon-only priority, key, status mark,
 * semibold title, then labels, assignee, due chip, and the far-right
 * created/updated dates. The priority mark and assignee open menus for
 * editors; read-only viewers see the static marks. Subtasks nest under
 * their parent with a slight indent and a tree marker.
 */
export function IssueList({
  issues,
  statuses,
  members = [],
  labels = [],
  canEdit,
  onStatusChange,
  onUpdate,
  actions,
  onAddIssue,
  onOpenDetail,
  groupBy = "status",
  order = "oldest",
  showEmptyGroups = false,
  display = {
    id: true,
    status: true,
    priority: false,
    assignee: true,
    due: true,
    labels: true,
  },
}: {
  issues: Issue[]
  statuses: Status[]
  /** Workspace members; feeds the assignee lanes (with empty groups). */
  members?: MemberRef[]
  /** T5 workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  canEdit: boolean
  onStatusChange: (issue: Issue, statusId: string) => void
  /** Priority/assignee edits; absent means those marks render statically. */
  onUpdate?: (issue: Issue, input: UpdateIssueInput) => void
  actions?: (issue: Issue) => ReactNode
  /** Group quick-add: opens the composer preselected to the group status. */
  onAddIssue?: (statusId: string) => void
  /** Title click: opens the detail view (archive/subtasks live there). */
  onOpenDetail?: (issue: Issue) => void
  groupBy?: IssueGroupBy
  order?: IssueOrder
  showEmptyGroups?: boolean
  display?: IssueDisplayProps
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const statusOf = (statusId: string) => statuses.find((s) => s.id === statusId)

  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color

  function toggleGroup(key: string) {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }))
  }

  function forest(rows: Issue[]): RowWithDepth[] {
    return buildForest(rows, order)
  }

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No issues match the current filters.
      </p>
    )
  }

  const groups: Group[] = []
  if (groupBy === "none") {
    groups.push({ key: "all", title: "", icon: null, rows: forest(issues) })
  } else if (groupBy === "priority") {
    for (const priority of PRIORITY_ORDER) {
      const rows = issues.filter((issue) => issue.priority === priority)
      if (rows.length === 0 && !showEmptyGroups) continue
      groups.push({
        key: `priority:${priority}`,
        title: priority,
        icon: <PriorityMark priority={priority} />,
        rows: forest(rows),
      })
    }
  } else if (groupBy === "assignee") {
    const assigneeIds = [...new Set(issues.map((issue) => issue.assigneeId))]
    const known = [...new Set(members.map((member) => member.userId))]
    const extraIds = assigneeIds.filter(
      (id): id is string => id !== null && !known.includes(id)
    )
    // Member lanes first, unknown ids next, Unassigned last. With empty
    // groups, every member lane shows even when it holds nothing.
    const laneIds: (string | null)[] = showEmptyGroups
      ? [...known, ...extraIds, null]
      : [
          ...known.filter((id) => assigneeIds.includes(id)),
          ...extraIds,
          ...(assigneeIds.includes(null) ? [null] : []),
        ]
    for (const assigneeId of laneIds) {
      const rows = issues.filter((issue) => issue.assigneeId === assigneeId)
      if (rows.length === 0 && !showEmptyGroups) continue
      const member = findMember(members, assigneeId)
      groups.push({
        key: `assignee:${assigneeId ?? "none"}`,
        title: assigneeId ? memberName(member, assigneeId) : "Unassigned",
        icon: <AssigneeMark member={member} assigneeId={assigneeId} />,
        rows: forest(rows),
      })
    }
  } else {
    const ordered = [...statuses].sort((a, b) => a.position - b.position)
    for (const status of ordered) {
      const rows = issues.filter((issue) => issue.statusId === status.id)
      if (rows.length === 0 && !showEmptyGroups) continue
      groups.push({
        key: `status:${status.id}`,
        title: status.name,
        icon: <StatusIcon status={status} size={13} />,
        wash: `linear-gradient(90deg, color-mix(in oklch, ${statusColor(status)} 24%, transparent), transparent 75%)`,
        rows: forest(rows),
        addStatusId: status.id,
      })
    }
    const orphaned = issues.filter(
      (issue) => statusOf(issue.statusId) === undefined
    )
    if (orphaned.length > 0) {
      groups.push({
        key: "status:unknown",
        title: "Unknown",
        icon: (
          <Circle
            aria-hidden="true"
            size={13}
            className="shrink-0 text-muted-foreground"
          />
        ),
        rows: forest(orphaned),
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.key] ?? false
        const header = (
          <>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.title} issues`}
              onClick={(e) => {
                e.stopPropagation()
                toggleGroup(group.key)
              }}
              className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
            </button>
            {group.icon}
            <h3 className="font-medium text-muted-foreground text-xs">
              {group.title === "" ? "All issues" : group.title}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {group.rows.length}
            </span>
            {group.addStatusId && onAddIssue && (
              <button
                type="button"
                aria-label={`Add issue to ${group.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onAddIssue(group.addStatusId ?? "")
                }}
                className="relative ml-auto grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <span aria-hidden="true">+</span>
              </button>
            )}
          </>
        )
        return (
          <section key={group.key} aria-label={group.title || "All issues"}>
            {groupBy === "none" ? null : (
              <>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: whole-header mouse toggle; keyboard and screen-reader path is the chevron button inside. */}
                <header
                  style={
                    group.wash ? { backgroundImage: group.wash } : undefined
                  }
                  onClick={() => toggleGroup(group.key)}
                  className="sticky top-0 z-10 flex h-8 cursor-pointer items-center gap-1.5 border-b bg-background/95 px-3 backdrop-blur"
                >
                  {header}
                </header>
              </>
            )}
            {!isCollapsed && (
              <ul className="flex flex-col divide-y divide-border">
                {group.rows.map(({ issue, depth }) => {
                  const issueStatus = statusOf(issue.statusId)
                  const due = describeDueDate(issue.dueDate)
                  return (
                    <li
                      key={issue.id}
                      data-testid={`issue-${issue.identifier}`}
                      data-depth={depth}
                      className="px-3 py-1.5 hover:bg-accent/60"
                    >
                      <div
                        className="flex items-center gap-2 whitespace-nowrap text-sm"
                        style={
                          depth > 0 ? { paddingLeft: depth * 20 } : undefined
                        }
                      >
                        {depth > 0 && (
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-muted-foreground"
                          >
                            ↳
                          </span>
                        )}
                        <PriorityControl
                          issue={issue}
                          canEdit={canEdit}
                          onUpdate={onUpdate}
                        />
                        {display.id && (
                          <span className="shrink-0 font-mono text-muted-foreground text-xs">
                            {issue.identifier}
                          </span>
                        )}
                        {display.status &&
                          (canEdit ? (
                            <PropertyMenu
                              label={`Status for ${issue.identifier}`}
                              triggerClassName="grid size-6 shrink-0 place-items-center rounded-md hover:bg-accent"
                              preview={
                                issueStatus ? (
                                  <StatusIcon status={issueStatus} size={13} />
                                ) : (
                                  <Circle
                                    aria-hidden="true"
                                    size={13}
                                    className="shrink-0 text-muted-foreground"
                                  />
                                )
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
                                          onStatusChange(issue, status.id)
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
                            issueStatus && (
                              <StatusIcon status={issueStatus} size={13} />
                            )
                          ))}
                        {onOpenDetail ? (
                          <button
                            type="button"
                            aria-label={`Open detail for ${issue.identifier}`}
                            onClick={() => onOpenDetail(issue)}
                            className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                          >
                            {issue.title}
                          </button>
                        ) : (
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {issue.title}
                          </span>
                        )}
                        {display.labels &&
                          issue.labels.map((labelName) => {
                            const color = colorFor(labelName)
                            return (
                              <span
                                key={labelName}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px]"
                              >
                                {color && (
                                  <span
                                    data-testid={`label-dot-${labelName}`}
                                    aria-hidden="true"
                                    className="inline-block size-2 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                )}
                                {labelName}
                              </span>
                            )
                          })}
                        {display.assignee && (
                          <AssigneeControl
                            issue={issue}
                            members={members}
                            canEdit={canEdit}
                            onUpdate={onUpdate}
                          />
                        )}
                        {display.due && due && (
                          <span
                            className={`flex shrink-0 items-center gap-1 text-xs ${
                              due.overdue
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            <Clock aria-hidden="true" size={11} />
                            {due.label}
                          </span>
                        )}
                        <span
                          className="hidden shrink-0 text-muted-foreground text-xs md:inline"
                          title={`Created ${issue.createdAt ?? "unknown"}`}
                        >
                          {formatTimestamp(issue.createdAt)}
                        </span>
                        <span
                          className="hidden shrink-0 text-muted-foreground text-xs md:inline"
                          title={`Updated ${issue.updatedAt ?? "unknown"}`}
                        >
                          {formatTimestamp(issue.updatedAt)}
                        </span>
                      </div>
                      {actions?.(issue)}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
