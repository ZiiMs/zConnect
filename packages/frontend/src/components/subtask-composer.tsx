import { MoreHorizontal, Tag } from "lucide-react"
import { useState } from "react"
import { IssueBody } from "@/components/issue-body"
import { LabelPicker } from "@/components/label-picker"
import { PropertyMenu, PropertyMenuOption } from "@/components/property-menu"
import { AssigneeAvatar, UserAvatar } from "@/components/user-avatar"
import {
  type CreateIssueInput,
  findMember,
  type Issue,
  type Label,
  type Member,
  memberName,
  type Priority,
  type Status,
} from "@/lib/api"
import { PriorityMark } from "@/lib/priority-icons"
import { StatusIcon } from "@/lib/status-icons"

const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

const chipClass =
  "flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-accent"

const iconButtonClass =
  "rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"

/**
 * Inline sub-issue composer: the Linear-style quick-add row in the subtask
 * footer. Title + rich description (TipTap with / slash commands) on top,
 * every property as a ghost chip along the bottom (status lives on the
 * leading circle), Cancel / Create at the end. No DB row until commit;
 * whitespace titles show an inline hint. The panel sits on the sidebar
 * surface so a new draft reads as obviously separate from saved cards.
 */
export function SubtaskComposer({
  parent,
  statuses,
  members,
  labels = [],
  onCreated,
  onCancel,
}: {
  parent: Issue
  statuses: Status[]
  members: Member[]
  labels?: Label[]
  onCreated: (input: CreateIssueInput) => Promise<unknown>
  onCancel: () => void
}) {
  const defaultStatusId = statuses[0]?.id ?? ""
  const [title, setTitle] = useState("")
  const [titleHint, setTitleHint] = useState(false)
  const [body, setBody] = useState("")
  const [statusId, setStatusId] = useState(defaultStatusId)
  const [priority, setPriority] = useState<Priority>("Medium")
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [dueDay, setDueDay] = useState("")
  const [labelNames, setLabelNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = statuses.find((s) => s.id === statusId) ?? statuses[0] ?? null
  const assignee = findMember(members, assigneeId)

  const isPristine =
    title.trim() === "" &&
    body.trim() === "" &&
    statusId === defaultStatusId &&
    priority === "Medium" &&
    assigneeId === null &&
    dueDay === "" &&
    labelNames.length === 0

  async function commit() {
    if (saving) return
    if (title.trim() === "") {
      setTitleHint(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreated({
        title: title.trim(),
        description: body.trim() ? body : null,
        statusId,
        priority,
        assigneeId,
        dueDate: dueDay === "" ? null : new Date(dueDay).toISOString(),
        labels: labelNames,
        parentId: parent.id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (isPristine || window.confirm("Discard this issue?")) {
      onCancel()
    }
  }

  return (
    <div
      data-testid="subtask-composer"
      className="rounded-md border border-sidebar-border bg-sidebar p-3"
    >
      <div className="flex items-center gap-2">
        <PropertyMenu
          label="Subtask status"
          triggerClassName={iconButtonClass}
          preview={
            status ? (
              <StatusIcon status={status} size={16} />
            ) : (
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-full border border-input"
              />
            )
          }
        >
          {(close) => (
            <>
              {statuses.map((option) => (
                <PropertyMenuOption
                  key={option.id}
                  selected={option.id === statusId}
                  onSelect={() => {
                    setStatusId(option.id)
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
        <input
          aria-label="Subtask title"
          placeholder="Issue title"
          value={title}
          // biome-ignore lint/a11y/noAutofocus: composer opens from the user's own "+" press
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value)
            if (e.target.value.trim() !== "") setTitleHint(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              handleCancel()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="mt-1 px-6">
        <IssueBody
          identifier="new-subtask"
          markdown={body}
          saveState="saved"
          saveError={null}
          canEdit={true}
          onChange={setBody}
          onFlush={() => {}}
          onCancel={() => {}}
          onRetry={() => {}}
          compact
          editorLabel="Subtask description"
        />
      </div>
      {titleHint && (
        <p className="mt-1 text-destructive text-xs">Title is required</p>
      )}
      {error && <p className="mt-1 text-destructive text-xs">{error}</p>}
      <div className="mt-2 flex items-center gap-1">
        <PropertyMenu
          label="Subtask priority"
          triggerClassName={chipClass}
          preview={
            <>
              <PriorityMark priority={priority} size={12} />
              <span
                className={
                  priority === "None" ? "text-muted-foreground" : undefined
                }
              >
                {priority === "None" ? "Priority" : priority}
              </span>
            </>
          }
        >
          {(close) => (
            <>
              {PRIORITIES.map((option) => (
                <PropertyMenuOption
                  key={option}
                  selected={option === priority}
                  onSelect={() => {
                    setPriority(option)
                    close()
                  }}
                >
                  <PriorityMark priority={option} size={13} />
                  {option}
                </PropertyMenuOption>
              ))}
            </>
          )}
        </PropertyMenu>
        <PropertyMenu
          label="Subtask assignee"
          triggerClassName={chipClass}
          preview={
            <>
              <AssigneeAvatar
                member={assignee}
                userId={assigneeId}
                size={20}
                tooltip={false}
              />
              <span
                className={assigneeId ? "truncate" : "text-muted-foreground"}
              >
                {assigneeId ? memberName(assignee, assigneeId) : "Assignee"}
              </span>
            </>
          }
        >
          {(close) => (
            <>
              <PropertyMenuOption
                selected={assigneeId === null}
                onSelect={() => {
                  setAssigneeId(null)
                  close()
                }}
              >
                Unassigned
              </PropertyMenuOption>
              {members.map((member) => (
                <PropertyMenuOption
                  key={member.userId}
                  selected={member.userId === assigneeId}
                  onSelect={() => {
                    setAssigneeId(member.userId)
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
        <PropertyMenu
          label="Subtask labels"
          triggerClassName={chipClass}
          preview={
            <>
              <Tag aria-hidden="true" size={12} className="shrink-0" />
              <span
                className={
                  labelNames.length === 0 ? "text-muted-foreground" : "truncate"
                }
              >
                {labelNames.length === 0 ? "Labels" : labelNames.join(", ")}
              </span>
            </>
          }
        >
          {(close) => (
            <div className="max-h-64 overflow-auto p-1">
              <LabelPicker
                labels={labels}
                selected={labelNames}
                onChange={setLabelNames}
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
        <PropertyMenu
          label="More subtask options"
          triggerClassName={iconButtonClass}
          preview={<MoreHorizontal aria-hidden="true" size={14} />}
        >
          {() => (
            <div className="flex items-center gap-2 p-2">
              <label htmlFor="subtask-due-date" className="text-xs">
                Due date
              </label>
              <input
                id="subtask-due-date"
                type="date"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="rounded-md border border-input bg-transparent px-1 py-0.5 text-xs outline-none"
              />
            </div>
          )}
        </PropertyMenu>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md px-2 py-1 text-xs hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  )
}
