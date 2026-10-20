import { LabelPicker } from "@/components/label-picker"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import { AssigneeAvatar, UserAvatar } from "@/components/user-avatar"
import {
  findMember,
  type Issue,
  type Label,
  type Member,
  memberName,
  type Priority,
  type Status,
  type UpdateIssueInput,
} from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

const inputClass =
  "rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-input focus:border-input"

/**
 * Editable rail (§3): status / assignee / priority / due date / labels all
 * edit in place through the same `onUpdate` path list/table views use.
 * Read-only viewers see values without editors.
 */
export function IssueRail({
  issue,
  statuses,
  members,
  labels = [],
  canEdit,
  onStatusChange,
  onUpdate,
  onCreateLabel,
}: {
  issue: Issue
  statuses: Status[]
  members: Member[]
  labels?: Label[]
  canEdit: boolean
  onStatusChange: (issue: Issue, statusId: string) => void
  onUpdate: (issue: Issue, input: UpdateIssueInput) => void
  /** Create a workspace label from the picker. */
  onCreateLabel?: (name: string) => Promise<Label>
}) {
  const statusName =
    statuses.find((status) => status.id === issue.statusId)?.name ?? "Unknown"
  const status = statuses.find((s) => s.id === issue.statusId)
  const colorFor = (name: string) =>
    labels.find((label) => label.name === name)?.color
  const dueDay = issue.dueDate?.slice(0, 10) ?? ""
  const assignee = findMember(members, issue.assigneeId)
  const assigneeName = issue.assigneeId
    ? memberName(assignee, issue.assigneeId)
    : "Unassigned"

  return (
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
              <AssigneeAvatar
                member={assignee}
                userId={issue.assigneeId}
                size={20}
                tooltip={false}
              />
              <span
                className={
                  issue.assigneeId ? "truncate" : "text-muted-foreground"
                }
              >
                {issue.assigneeId ? assigneeName : "Assign"}
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
      ) : issue.assigneeId ? (
        <span className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">
          <AssigneeAvatar
            member={assignee}
            userId={issue.assigneeId}
            size={20}
          />
          <span className="truncate">{assigneeName}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 px-1 py-0.5 text-muted-foreground">
          <AssigneeAvatar member={assignee} userId={null} size={20} />
          Unassigned
        </span>
      )}
      {canEdit ? (
        <PropertyMenu
          label={`Priority for ${issue.identifier}`}
          triggerClassName={`rounded-md px-2 py-0.5 text-xs hover:bg-accent ${
            issue.priority === "None" ? "text-muted-foreground" : ""
          }`}
          preview={issue.priority === "None" ? "Set priority" : issue.priority}
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
          key={`${issue.id}-${dueDay}`}
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
      {canEdit ? (
        <PropertyMenu
          label={`Labels for ${issue.identifier}`}
          triggerClassName="flex max-w-full flex-wrap gap-1 px-1 py-0.5 text-left hover:bg-accent rounded"
          preview={
            issue.labels.length === 0 ? (
              <span className="text-muted-foreground">Add labels</span>
            ) : (
              <>
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
              </>
            )
          }
        >
          {(close) => (
            <div className="max-h-64 overflow-auto p-1">
              <LabelPicker
                labels={labels}
                selected={issue.labels}
                onChange={(names) => {
                  onUpdate(issue, { labels: names })
                }}
                onCreateLabel={onCreateLabel}
              />
              <button
                type="button"
                onClick={close}
                className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
              >
                Done
              </button>
            </div>
          )}
        </PropertyMenu>
      ) : issue.labels.length === 0 ? (
        <span className="px-1 py-0.5 text-muted-foreground">No labels</span>
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
  )
}
