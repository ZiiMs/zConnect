import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { type ReactNode, useMemo, useState } from "react"
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
import { formatDueDate, formatTimestamp } from "@/lib/due"
import { PriorityMark } from "@/lib/priority-icons"
import { StatusIcon } from "@/lib/status-icons"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

/** Borderless menu triggers that read as plain text until hovered/focused. */
const menuTriggerClass =
  "flex min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1 py-0.5 text-sm hover:border-input focus-visible:border-input focus-visible:outline-none"

const inputClass =
  "w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-input focus:border-input"

const features = tableFeatures({})

const columnHelper = createColumnHelper<typeof features, Issue>()

/** Optional columns behind the show/hide control; Work items always shows. */
const TOGGLEABLE_COLUMNS = [
  { id: "priority", label: "Priority" },
  { id: "statusId", label: "State" },
  { id: "assigneeId", label: "Assignee" },
  { id: "dueDate", label: "Due date" },
  { id: "labels", label: "Labels" },
  { id: "createdAt", label: "Created" },
  { id: "updatedAt", label: "Updated" },
] as const

/**
 * Arrange rows into a one-level tree in issue-number order: children
 * (`parentId`) follow their parent. Parents missing from the set (filtered
 * out) leave the child as a top-level row so it never disappears.
 */
function forestOrder(issues: Issue[]): {
  rows: Issue[]
  depths: Map<string, number>
} {
  const byId = new Map(issues.map((issue) => [issue.id, issue]))
  const childrenByParent = new Map<string, Issue[]>()
  const roots: Issue[] = []
  for (const issue of issues) {
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
    [...list].sort((a, b) => a.number - b.number)
  const rows: Issue[] = []
  const depths = new Map<string, number>()
  function walk(list: Issue[], depth: number) {
    for (const node of sorted(list)) {
      rows.push(node)
      depths.set(node.id, depth)
      const kids = childrenByParent.get(node.id)
      if (kids) walk(kids, depth + 1)
    }
  }
  walk(roots, 0)
  return { rows, depths }
}

/**
 * Table view: the same filtered Issue query as List and Kanban, with
 * theme-aware popover editors for status, priority, and assignee plus inline
 * title and due-date inputs (spec ziim/zConnect#1 story 16 "Table with
 * editable cells/columns"). State/priority/assignee share the Kanban
 * PropertyMenu popover (bg-popover) instead of native selects, whose option
 * list ignores dark mode. Text and date cells commit on blur so partial
 * keystrokes never send half a value. Titles open the detail view when
 * `onOpenDetail` is wired; the pencil toggles the inline title input so a
 * click never hijacks navigation.
 * Edits go through `onUpdate` so the container runs the Issue API mutation;
 * the table keeps no write state of its own. The Columns control is a
 * minimal show/hide per optional column (deliberately not a full
 * column-builder). Label chips take their swatch color from the T5
 * workspace registry when `labels` is provided (story 14
 * "workspace-shared Labels with color").
 *
 * Priority leads as an icon-only column left of the Work items slug; the
 * mark opens a menu for editors. Subtasks nest under their parent with a
 * slight indent and a tree marker. Created/Updated close the row at far
 * right.
 */
export function IssueTable({
  issues,
  statuses,
  members,
  labels = [],
  canEdit,
  onUpdate,
  onOpenDetail,
}: {
  issues: Issue[]
  statuses: Status[]
  members: MemberRef[]
  /** T5 workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  canEdit: boolean
  onUpdate: (issue: Issue, input: UpdateIssueInput) => void
  /** Title click: opens the detail view (archive/subtasks live there). */
  onOpenDetail?: (issue: Issue) => void
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  /** Row id whose title is in inline-edit mode (pencil toggles it). */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)

  const { rows: orderedIssues, depths } = useMemo(
    () => forestOrder(issues),
    [issues]
  )

  const allColumns = useMemo(() => {
    const statusOf = (statusId: string) =>
      statuses.find((s) => s.id === statusId)
    const colorFor = (name: string) =>
      labels.find((label) => label.name === name)?.color
    return columnHelper.columns([
      columnHelper.accessor("priority", {
        id: "priority",
        header: "Priority",
        cell: (info) => {
          const issue = info.row.original
          const mark = (
            <PriorityMark
              priority={issue.priority}
              label={`Priority for ${issue.identifier}: ${issue.priority}`}
            />
          )
          if (!canEdit) return mark
          return (
            <PropertyMenu
              label={`Priority for ${issue.identifier}`}
              triggerClassName="grid size-6 place-items-center rounded-md hover:bg-accent"
              preview={mark}
            >
              {(close) => (
                <>
                  {PRIORITIES.map((priority) => (
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
        },
      }),
      columnHelper.accessor("title", {
        id: "title",
        header: "Work items",
        cell: (info) => {
          const issue = info.row.original
          const isEditingTitle = editingTitleId === issue.id
          const depth = depths.get(issue.id) ?? 0
          let titleControl: ReactNode
          if (!canEdit) {
            titleControl = onOpenDetail ? (
              <button
                type="button"
                aria-label={`Open detail for ${issue.identifier}`}
                onClick={() => onOpenDetail(issue)}
                className="min-w-0 flex-1 truncate text-left font-medium text-sm hover:underline"
              >
                {issue.title}
              </button>
            ) : (
              <span className="truncate font-medium text-sm">
                {info.getValue()}
              </span>
            )
          } else if (isEditingTitle || !onOpenDetail) {
            titleControl = (
              <input
                // biome-ignore lint/a11y/noAutofocus: entering title edit should focus the field.
                autoFocus={isEditingTitle}
                aria-label={`Title for ${issue.identifier}`}
                className={inputClass}
                defaultValue={issue.title}
                key={`${issue.id}:${isEditingTitle ? "editing" : "view"}`}
                onBlur={(e) => {
                  if (e.target.value !== issue.title) {
                    onUpdate(issue, { title: e.target.value })
                  }
                  if (isEditingTitle) setEditingTitleId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur()
                  }
                  if (e.key === "Escape") {
                    setEditingTitleId(null)
                  }
                }}
              />
            )
          } else {
            titleControl = (
              <>
                <button
                  type="button"
                  aria-label={`Open detail for ${issue.identifier}`}
                  onClick={() => onOpenDetail(issue)}
                  className="min-w-0 flex-1 truncate text-left font-medium text-sm hover:underline"
                >
                  {issue.title}
                </button>
                <button
                  type="button"
                  aria-label={`Edit title for ${issue.identifier}`}
                  onClick={() => setEditingTitleId(issue.id)}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  <span aria-hidden="true">✎</span>
                </button>
              </>
            )
          }
          return (
            <span
              className="flex min-w-0 items-center gap-2"
              style={depth > 0 ? { paddingLeft: depth * 20 } : undefined}
            >
              {depth > 0 && (
                <span
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                >
                  ↳
                </span>
              )}
              <span className="shrink-0 font-mono text-muted-foreground text-xs">
                {issue.identifier}
              </span>
              {titleControl}
            </span>
          )
        },
      }),
      columnHelper.accessor("statusId", {
        id: "statusId",
        header: "State",
        cell: (info) => {
          const issue = info.row.original
          const status = statusOf(issue.statusId)
          if (!canEdit) {
            return (
              <span className="flex items-center gap-1.5 text-sm">
                {status && <StatusIcon status={status} />}
                {status?.name ?? "Unknown"}
              </span>
            )
          }
          return (
            <PropertyMenu
              label={`Status for ${issue.identifier}`}
              triggerClassName={menuTriggerClass}
              preview={
                <>
                  {status && <StatusIcon status={status} />}
                  <span className="truncate">{status?.name ?? "Unknown"}</span>
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
                          onUpdate(issue, { statusId: option.id })
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
          )
        },
      }),
      columnHelper.accessor("assigneeId", {
        id: "assigneeId",
        header: "Assignee",
        cell: (info) => {
          const issue = info.row.original
          const assignee = findMember(members, issue.assigneeId)
          if (!canEdit) {
            return (
              <span className="flex items-center gap-1.5 text-sm">
                {issue.assigneeId ? (
                  <>
                    <AssigneeAvatar
                      member={assignee}
                      userId={issue.assigneeId}
                      size={20}
                    />
                    {memberName(assignee, issue.assigneeId)}
                  </>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </span>
            )
          }
          return (
            <PropertyMenu
              label={`Assignee for ${issue.identifier}`}
              triggerClassName={menuTriggerClass}
              preview={
                <>
                  <AssigneeAvatar
                    member={assignee}
                    userId={issue.assigneeId}
                    size={20}
                    tooltip={false}
                  />
                  <span className="truncate">
                    {issue.assigneeId ? (
                      memberName(assignee, issue.assigneeId)
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </span>
                </>
              }
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
                    <span className="truncate text-muted-foreground">
                      Unassigned
                    </span>
                  </PropertyMenuOption>
                  {members.map((member) => (
                    <PropertyMenuOption
                      key={member.userId}
                      selected={member.userId === issue.assigneeId}
                      onSelect={() => {
                        if (member.userId !== issue.assigneeId) {
                          onUpdate(issue, { assigneeId: member.userId })
                        }
                        close()
                      }}
                    >
                      <UserAvatar
                        name={memberName(member, member.userId)}
                        image={member.image}
                        size={20}
                      />
                      <span className="truncate">
                        {memberName(member, member.userId)}
                      </span>
                    </PropertyMenuOption>
                  ))}
                </>
              )}
            </PropertyMenu>
          )
        },
      }),
      columnHelper.accessor("dueDate", {
        id: "dueDate",
        header: "Due date",
        cell: (info) => {
          const issue = info.row.original
          const day = issue.dueDate?.slice(0, 10) ?? ""
          if (!canEdit) {
            return (
              <span className="text-muted-foreground text-sm">
                {day === "" ? "—" : formatDueDate(day)}
              </span>
            )
          }
          return (
            <input
              type="date"
              aria-label={`Due date for ${issue.identifier}`}
              className={inputClass}
              defaultValue={day}
              onBlur={(e) => {
                const next = e.target.value === "" ? null : e.target.value
                if (next !== day) {
                  onUpdate(issue, { dueDate: next })
                }
              }}
            />
          )
        },
      }),
      columnHelper.accessor("labels", {
        id: "labels",
        header: "Labels",
        cell: (info) => {
          const names = info.row.original.labels
          if (names.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <span className="inline-flex flex-wrap items-center gap-1">
              {names.map((name) => {
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
          )
        },
      }),
      columnHelper.accessor("createdAt", {
        id: "createdAt",
        header: "Created",
        cell: (info) => {
          const value = info.row.original.createdAt ?? null
          return (
            <span
              className="whitespace-nowrap text-muted-foreground text-xs"
              title={`Created ${value ?? "unknown"}`}
            >
              {formatTimestamp(value)}
            </span>
          )
        },
      }),
      columnHelper.accessor("updatedAt", {
        id: "updatedAt",
        header: "Updated",
        cell: (info) => {
          const value = info.row.original.updatedAt ?? null
          return (
            <span
              className="whitespace-nowrap text-muted-foreground text-xs"
              title={`Updated ${value ?? "unknown"}`}
            >
              {formatTimestamp(value)}
            </span>
          )
        },
      }),
    ])
  }, [
    statuses,
    members,
    labels,
    canEdit,
    onUpdate,
    onOpenDetail,
    editingTitleId,
    depths,
  ])

  const visibleColumns = useMemo(
    () =>
      allColumns.filter(
        (column) => column.id === "title" || !hidden[column.id ?? ""]
      ),
    [allColumns, hidden]
  )

  const table = useTable({
    features,
    columns: visibleColumns,
    data: orderedIssues,
  })

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No issues match the current filters.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <fieldset
        className="flex flex-wrap items-center gap-2"
        aria-label="Columns"
      >
        <legend className="text-muted-foreground text-xs">Columns</legend>
        {TOGGLEABLE_COLUMNS.map((column) => (
          <label key={column.id} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={!hidden[column.id]}
              onChange={() =>
                setHidden((current) => ({
                  ...current,
                  [column.id]: !current[column.id],
                }))
              }
            />
            {column.label}
          </label>
        ))}
      </fieldset>
      <table className="w-full border-collapse text-left" aria-label="Issues">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  className="border-b px-2 py-1 font-medium text-muted-foreground text-xs"
                >
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              data-testid={`issue-row-${row.original.identifier}`}
              data-depth={depths.get(row.original.id) ?? 0}
              className="border-b hover:bg-accent/60"
            >
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-2 py-1">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
