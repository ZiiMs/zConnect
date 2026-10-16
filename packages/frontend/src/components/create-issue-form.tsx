import { useState } from "react"
import { LabelPicker } from "@/components/label-picker"
import { Button } from "@/components/ui/button"
import {
  api,
  type Issue,
  type Label,
  type Priority,
  type Status,
} from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

const priorities: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

/** Capture work as an Issue: title, status, priority, assignee, due date. */
export function CreateIssueForm({
  projectId,
  statuses,
  members,
  labels = [],
  initialStatusId,
  onCreated,
}: {
  projectId: string
  statuses: Status[]
  members: { userId: string }[]
  /** T5 workspace registry for optional label selection. */
  labels?: Label[]
  /** Preselects the status (group quick-add); defaults to the first status. */
  initialStatusId?: string
  onCreated: (issue: Issue) => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [statusId, setStatusId] = useState(
    initialStatusId ?? statuses[0]?.id ?? ""
  )
  const [priority, setPriority] = useState<Priority>("Medium")
  const [assigneeId, setAssigneeId] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [labelNames, setLabelNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onCreated(
        await api.createIssue(projectId, {
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          statusId,
          priority,
          assigneeId: assigneeId ? assigneeId : null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          labels: labelNames,
        })
      )
      setTitle("")
      setDescription("")
      setDueDate("")
      setLabelNames([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <input
          className={inputClass}
          aria-label="Issue title"
          placeholder="Issue title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          className={inputClass}
          aria-label="Issue description"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            className={inputClass}
            aria-label="Issue status"
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            required
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            aria-label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <select
            className={inputClass}
            aria-label="Assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.userId}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Button type="submit" disabled={sending}>
            {sending ? "Creating…" : "Create issue"}
          </Button>
        </div>
        <LabelPicker
          labels={labels}
          selected={labelNames}
          onChange={setLabelNames}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
