import { ExternalLinkSection } from "@/components/external-link-section"
import { IssueActions } from "@/components/issue-actions"
import { SubtaskList } from "@/components/subtask-list"
import type {
  Issue,
  Label,
  Member,
  Priority,
  Status,
  UpdateIssueInput,
} from "@/lib/api"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

const selectClass =
  "rounded-md border border-input bg-background px-2 py-1 text-sm"

const inputClass =
  "rounded-md border border-input bg-background px-2 py-1 text-sm"

/**
 * Two-column issue detail (Detail4 verdict): the content column carries
 * the identifier + title header, a status/priority strip, the
 * description, the subtask breakdown, and the row actions; the rail
 * carries the editable Properties plus the external-links section. It
 * stacks to one column on narrow widths. All writes run through the
 * container callbacks (`onStatusChange` / `onUpdate` /
 * `onArchivedChanged` / `onDeleted`) so mutations stay on the same
 * `api.updateIssue` paths the list/table views use; this component keeps
 * no write state of its own.
 */
export function IssueDetail({
  issue,
  statuses,
  members,
  labels = [],
  subtasks = [],
  canEdit,
  canAdmin,
  onBack,
  onStatusChange,
  onUpdate,
  onArchivedChanged,
  onDeleted,
}: {
  issue: Issue
  statuses: Status[]
  members: Member[]
  /** Workspace registry for label chip colors; chips stay plain without it. */
  labels?: Label[]
  /** Already-loaded children; the container fetches them per selection. */
  subtasks?: Issue[]
  canEdit: boolean
  /** Owner/Admin: enables permanent deletion in the row actions. */
  canAdmin: boolean
  onBack: () => void
  onStatusChange: (issue: Issue, statusId: string) => void
  onUpdate: (issue: Issue, input: UpdateIssueInput) => void
  onArchivedChanged: (updated: Issue) => void
  onDeleted: (deleted: Issue) => void
}) {
  const statusName =
    statuses.find((status) => status.id === issue.statusId)?.name ?? "Unknown"
  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color
  const dueDay = issue.dueDate?.slice(0, 10) ?? ""

  return (
    <div data-testid={`issue-detail-${issue.identifier}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to issues"
          className="rounded-md border border-input px-2 py-1 text-xs"
        >
          ← Back
        </button>
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <p className="font-mono text-xs">{issue.identifier}</p>
          <h2 className="mt-1 font-semibold text-xl leading-snug">
            {issue.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-xs">
              {statusName}
            </span>
            <span className="text-muted-foreground text-xs">
              {issue.priority}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            {issue.description ?? "No description yet."}
          </p>
          <section className="mt-6">
            <h3 className="mb-2 font-medium text-sm">Subtasks</h3>
            <SubtaskList subtasks={subtasks} statuses={statuses} />
          </section>
          {canEdit && (
            <div className="mt-4">
              <IssueActions
                issue={issue}
                canAdmin={canAdmin}
                onChanged={onArchivedChanged}
                onDeleted={onDeleted}
              />
            </div>
          )}
        </div>
        <aside
          aria-label="Properties"
          className="h-fit rounded-xl border bg-card p-4"
        >
          <h3 className="font-medium text-sm">Properties</h3>
          <dl className="mt-1 divide-y">
            <div className="flex items-center justify-between gap-3 py-1 text-xs">
              <dt className="shrink-0 text-muted-foreground">Status</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {canEdit ? (
                  <select
                    aria-label={`Status for ${issue.identifier}`}
                    className={selectClass}
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
                  <span>{statusName}</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-1 text-xs">
              <dt className="shrink-0 text-muted-foreground">Assignee</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {canEdit ? (
                  <select
                    aria-label={`Assignee for ${issue.identifier}`}
                    className={selectClass}
                    value={issue.assigneeId ?? ""}
                    onChange={(e) =>
                      onUpdate(issue, {
                        assigneeId:
                          e.target.value === "" ? null : e.target.value,
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
                ) : (
                  <span>{issue.assigneeId ?? "Unassigned"}</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-1 text-xs">
              <dt className="shrink-0 text-muted-foreground">Priority</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {canEdit ? (
                  <select
                    aria-label={`Priority for ${issue.identifier}`}
                    className={selectClass}
                    value={issue.priority}
                    onChange={(e) =>
                      onUpdate(issue, {
                        priority: e.target.value as Priority,
                      })
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{issue.priority}</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-1 text-xs">
              <dt className="shrink-0 text-muted-foreground">Due date</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {canEdit ? (
                  <input
                    type="date"
                    aria-label={`Due date for ${issue.identifier}`}
                    className={inputClass}
                    defaultValue={dueDay}
                    onBlur={(e) => {
                      const next = e.target.value === "" ? null : e.target.value
                      if (next !== dueDay) {
                        onUpdate(issue, { dueDate: next })
                      }
                    }}
                  />
                ) : (
                  <span>{dueDay === "" ? "No due date" : dueDay}</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-1 text-xs">
              <dt className="shrink-0 text-muted-foreground">Labels</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {issue.labels.length === 0 ? (
                  <span className="text-muted-foreground">No labels</span>
                ) : (
                  <span className="flex flex-wrap justify-end gap-1">
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
              </dd>
            </div>
          </dl>
          <div className="mt-3 border-t pt-3">
            <ExternalLinkSection
              issueIdentifier={issue.identifier}
              canWrite={canEdit}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
