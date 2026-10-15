import type { ReactNode } from "react"
import type { Issue, Label, Status, StatusCategory } from "@/lib/api"

const CATEGORY_ORDER: StatusCategory[] = ["Todo", "In Progress", "Done"]

/**
 * List view: the same filtered Issue query the Table and Kanban views
 * share, grouped by Status Category (spec ziim/zConnect#1: story 15 "List
 * grouped compactly" + Workflow decision "List grouping is by Category").
 * Groups with no issues render nothing, so the shared filter bar narrows
 * the list by removing groups as well as rows. Status changes go through
 * `onStatusChange` so the container can run the lifecycle mutation (Todo
 * through Done). Per-row `actions` (T5 archive/subtask controls) render
 * after the status control when provided. Label chips take their swatch
 * color from the T5 workspace registry when `labels` is provided (story 14
 * "workspace-shared Labels with color"); names without a registry entry
 * render as plain text.
 */
export function IssueList({
  issues,
  statuses,
  labels = [],
  canEdit,
  onStatusChange,
  actions,
}: {
  issues: Issue[]
  statuses: Status[]
  /** T5 workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  canEdit: boolean
  onStatusChange: (issue: Issue, statusId: string) => void
  actions?: (issue: Issue) => ReactNode
}) {
  const statusName = (statusId: string) =>
    statuses.find((s) => s.id === statusId)?.name ?? "Unknown"

  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No issues match the current filters.
      </p>
    )
  }

  const categoryOf = (issue: Issue) =>
    statuses.find((s) => s.id === issue.statusId)?.category

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    rows: issues.filter((issue) => categoryOf(issue) === category),
  })).filter((group) => group.rows.length > 0)
  const orphaned = issues.filter((issue) => categoryOf(issue) === undefined)
  if (orphaned.length > 0) {
    groups.push({ category: "Unknown", rows: orphaned })
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.category} aria-label={group.category}>
          <h3 className="mb-1 font-medium text-muted-foreground text-xs">
            {group.category}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.rows.map((issue) => (
              <li
                key={issue.id}
                data-testid={`issue-${issue.identifier}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3"
              >
                <span className="font-mono text-xs">{issue.identifier}</span>
                <span className="font-medium text-sm">{issue.title}</span>
                <span className="text-muted-foreground text-xs">
                  {issue.priority}
                </span>
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
                {canEdit ? (
                  <select
                    aria-label={`Status for ${issue.identifier}`}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={issue.statusId}
                    onChange={(e) => onStatusChange(issue, e.target.value)}
                  >
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {statusName(issue.statusId)}
                  </span>
                )}
                {actions?.(issue)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
