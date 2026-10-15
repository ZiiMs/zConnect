import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
import type { Issue, Priority, Status, UpdateIssueInput } from "@/lib/api"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

const selectClass =
  "rounded-md border border-input bg-background px-2 py-1 text-sm"

const features = tableFeatures({})

const columnHelper = createColumnHelper<typeof features, Issue>()

/**
 * Table view: the same filtered Issue query as List and Kanban, with inline
 * cell editors for status, priority, and assignee. Edits go through
 * `onUpdate` so the container runs the Issue API mutation; the table keeps
 * no write state of its own.
 */
export function IssueTable({
  issues,
  statuses,
  members,
  canEdit,
  onUpdate,
}: {
  issues: Issue[]
  statuses: Status[]
  members: { userId: string }[]
  canEdit: boolean
  onUpdate: (issue: Issue, input: UpdateIssueInput) => void
}) {
  const columns = useMemo(() => {
    const statusName = (statusId: string) =>
      statuses.find((s) => s.id === statusId)?.name ?? "Unknown"
    return columnHelper.columns([
      columnHelper.accessor("identifier", {
        header: "Issue",
        cell: (info) => (
          <span className="font-mono text-xs">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("title", {
        header: "Title",
        cell: (info) => (
          <span className="font-medium text-sm">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("statusId", {
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
    ])
  }, [statuses, members, canEdit, onUpdate])

  const table = useTable({ features, columns, data: issues })

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No issues match the current filters.
      </p>
    )
  }

  return (
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
  )
}
