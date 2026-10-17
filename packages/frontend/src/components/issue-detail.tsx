import { UserRound } from "lucide-react"
import { ExternalLinkSection } from "@/components/external-link-section"
import { IssueActions } from "@/components/issue-actions"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import { SubtaskList } from "@/components/subtask-list"
import type {
  Issue,
  Label,
  Member,
  Priority,
  Status,
  UpdateIssueInput,
} from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

const inputClass =
  "rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-input focus:border-input"

/**
 * Two-column issue detail (Detail4 verdict), centered at a readable
 * measure: the content column carries the identifier + title header, a
 * status/priority strip, the description, and the subtask breakdown;
 * the rail shows the value-only editable Properties (no field labels)
 * plus the external-links section. The back button and lifecycle actions
 * (archive / delete) share a single header row. It stacks to one column
 * on narrow widths. All writes run through the container callbacks
 * (`onStatusChange` / `onUpdate` / `onArchivedChanged` / `onDeleted`) so
 * mutations stay on the same `api.updateIssue` paths the list/table
 * views use; this component keeps no write state of its own.
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
  const status = statuses.find((s) => s.id === issue.statusId)
  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color
  const dueDay = issue.dueDate?.slice(0, 10) ?? ""

  return (
    <div
      data-testid={`issue-detail-${issue.identifier}`}
      className="mx-auto w-full max-w-4xl"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to issues"
          className="rounded-md border border-input px-2 py-1 text-xs"
        >
          ← Back
        </button>
        {canEdit && (
          <IssueActions
            issue={issue}
            canAdmin={canAdmin}
            onChanged={onArchivedChanged}
            onDeleted={onDeleted}
          />
        )}
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <p className="font-mono text-xs">{issue.identifier}</p>
          <h2 className="mt-1 font-semibold text-xl leading-snug">
            {issue.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">{statusName}</span>
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
        </div>
        <aside
          aria-label="Properties"
          className="h-fit rounded-md border bg-card p-3"
        >
          <div className="flex flex-col items-start gap-1.5 text-xs">
            {canEdit && status ? (
              <PropertyMenu
                label={`Status for ${issue.identifier}`}
                triggerClassName="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent"
                preview={
                  <>
                    <StatusIcon status={status} size={12} />
                    {statusName}
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
                          onStatusChange(issue, option.id)
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
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">
                {status && <StatusIcon status={status} size={12} />}
                {statusName}
              </span>
            )}
            {canEdit ? (
              <PropertyMenu
                label={`Assignee for ${issue.identifier}`}
                triggerClassName="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent"
                preview={
                  <>
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full ${
                        issue.assigneeId
                          ? "bg-muted text-muted-foreground"
                          : "border border-muted-foreground border-dashed text-muted-foreground"
                      }`}
                      title={issue.assigneeId ?? "Unassigned"}
                    >
                      <UserRound aria-hidden="true" size={11} />
                    </span>
                    <span
                      className={
                        issue.assigneeId ? "truncate" : "text-muted-foreground"
                      }
                    >
                      {issue.assigneeId ?? "Assign"}
                    </span>
                  </>
                }
              >
                {(close) => (
                  <>
                    <PropertyMenuOption
                      selected={issue.assigneeId === null}
                      onSelect={() => {
                        onUpdate(issue, { assigneeId: null })
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
                          onUpdate(issue, { assigneeId: member.userId })
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
              <span className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                  title={issue.assigneeId}
                >
                  <UserRound aria-hidden="true" size={11} />
                </span>
                {issue.assigneeId}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-1 py-0.5 text-muted-foreground">
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-full border border-muted-foreground border-dashed"
                  title="Unassigned"
                >
                  <UserRound aria-hidden="true" size={11} />
                </span>
                Unassigned
              </span>
            )}
            {canEdit ? (
              <PropertyMenu
                label={`Priority for ${issue.identifier}`}
                triggerClassName={`rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent ${
                  issue.priority === "None" ? "text-muted-foreground" : ""
                }`}
                preview={
                  issue.priority === "None" ? "Set priority" : issue.priority
                }
              >
                {(close) => (
                  <>
                    {PRIORITIES.map((priority) => (
                      <PropertyMenuOption
                        key={priority}
                        selected={priority === issue.priority}
                        onSelect={() => {
                          onUpdate(issue, { priority })
                          close()
                        }}
                      >
                        {priority}
                      </PropertyMenuOption>
                    ))}
                  </>
                )}
              </PropertyMenu>
            ) : (
              <span className="px-1 py-0.5">{issue.priority}</span>
            )}
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
              <span
                className={`px-1 py-0.5 ${
                  dueDay === "" ? "text-muted-foreground" : ""
                }`}
              >
                {dueDay === "" ? "No due date" : dueDay}
              </span>
            )}
            {issue.labels.length === 0 ? (
              <span className="px-1 py-0.5 text-muted-foreground">
                No labels
              </span>
            ) : (
              <span className="flex flex-wrap gap-1 px-1 py-0.5">
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
          </div>
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
