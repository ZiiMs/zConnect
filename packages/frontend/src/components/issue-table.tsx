import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import type {
  Issue,
  Label,
  Priority,
  Status,
  UpdateIssueInput,
} from "@/lib/api"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

const selectClass =
  "rounded-md border border-input bg-background px-2 py-1 text-sm"

const inputClass =
  "rounded-md border border-input bg-background px-2 py-1 text-sm"

const features = tableFeatures({})

const columnHelper = createColumnHelper<typeof features, Issue>()

/** Optional columns behind the show/hide control; the Issue key always shows. */
const TOGGLEABLE_COLUMNS = [
  { id: "title", label: "Title" },
  { id: "statusId", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "assigneeId", label: "Assignee" },
  { id: "dueDate", label: "Due date" },
  { id: "labels", label: "Labels" },
] as const

/**
 * Table view: the same filtered Issue query as List and Kanban, with inline
 * cell editors for title, status, priority, assignee, and due date (spec
 * ziim/zConnect#1 story 16 "Table with editable cells/columns"). Text and
 * date cells commit on blur so partial keystrokes never send half a value.
 * Edits go through `onUpdate` so the container runs the Issue API mutation;
 * the table keeps no write state of its own. The Columns control is a
 * minimal show/hide per optional column (deliberately not a full
 * column-builder). Label chips take their swatch color from the T5
 * workspace registry when `labels` is provided (story 14
 * "workspace-shared Labels with color").
 */
export function IssueTable({
  issues,
  statuses,
  members,
  labels = [],
  canEdit,
  onUpdate,
}: {
  issues: Issue[]
  statuses: Status[]
  members: { userId: string }[]
  /** T5 workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  canEdit: boolean
  onUpdate: (issue: Issue, input: UpdateIssueInput) => void
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})

  const allColumns = useMemo(() => {
    const statusName = (statusId: string) =>
      statuses.find((s) => s.id === statusId)?.name ?? "Unknown"
    const colorFor = (name: string) =>
      labels.find((label) => label.name === name)?.color
    return columnHelper.columns([
      columnHelper.accessor("identifier", {
        id: "identifier",
        header: "Issue",
        cell: (info) => (
          <span className="font-mono text-xs">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("title", {
        id: "title",
        header: "Title",
        cell: (info) => {
          const issue = info.row.original
          if (!canEdit) {
            return (
              <span className="font-medium text-sm">{info.getValue()}</span>
            )
          }
          return (
            <input
              aria-label={`Title for ${issue.identifier}`}
              className={inputClass}
              defaultValue={issue.title}
              onBlur={(e) => {
                if (e.target.value !== issue.title) {
                  onUpdate(issue, { title: e.target.value })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur()
                }
              }}
            />
          )
        },
      }),
      columnHelper.accessor("statusId", {
        id: "statusId",
        header: "Status",
        cell: (info) => {
          const issue = info.row.original
          if (!canEdit) {
            return (
              <span className="text-muted-foreground text-xs">
                {statusName(issue.statusId)}
              </span>
            )
          }
          return (
            <select
              aria-label={`Status for ${issue.identifier}`}
              className={selectClass}
              value={issue.statusId}
              onChange={(e) => onUpdate(issue, { statusId: e.target.value })}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          )
        },
      }),
      columnHelper.accessor("priority", {
        id: "priority",
        header: "Priority",
        cell: (info) => {
          const issue = info.row.original
          if (!canEdit) {
            return (
              <span className="text-muted-foreground text-xs">
                {issue.priority}
              </span>
            )
          }
          return (
            <select
              aria-label={`Priority for ${issue.identifier}`}
              className={selectClass}
              value={issue.priority}
              onChange={(e) =>
                onUpdate(issue, { priority: e.target.value as Priority })
              }
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          )
        },
      }),
      columnHelper.accessor("assigneeId", {
        id: "assigneeId",
        header: "Assignee",
        cell: (info) => {
          const issue = info.row.original
          if (!canEdit) {
            return (
              <span className="text-muted-foreground text-xs">
                {issue.assigneeId ?? "Unassigned"}
              </span>
            )
          }
          return (
            <select
              aria-label={`Assignee for ${issue.identifier}`}
              className={selectClass}
              value={issue.assigneeId ?? ""}
              onChange={(e) =>
                onUpdate(issue, {
                  assigneeId: e.target.value === "" ? null : e.target.value,
                })
              }
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.userId}
                </option>
              ))}
            </select>
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
              <span className="text-muted-foreground text-xs">
                {day === "" ? "No due date" : day}
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
    ])
  }, [statuses, members, labels, canEdit, onUpdate])

  const visibleColumns = useMemo(
    () =>
      allColumns.filter(
        (column) => column.id === "identifier" || !hidden[column.id ?? ""]
      ),
    [allColumns, hidden]
  )

  const table = useTable({ features, columns: visibleColumns, data: issues })

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
              className="border-b"
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
