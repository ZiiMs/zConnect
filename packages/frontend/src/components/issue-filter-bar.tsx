import type { Label, Priority, Status } from "@/lib/api"

const PRIORITY_OPTIONS: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

export interface IssueFilterValue {
  statusIds: string[]
  priorities: Priority[]
  /** undefined = everyone, null = unassigned, string = one member. */
  assigneeId?: string | null
  /** T5 registry label names; every selected label must match (AND). */
  labels: string[]
  text: string
}

export function emptyIssueFilters(): IssueFilterValue {
  return {
    statusIds: [],
    priorities: [],
    assigneeId: undefined,
    labels: [],
    text: "",
  }
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
}

/**
 * Shared filter bar for the Issue query. MVP persistence is localStorage
 * keyed by user + project (`zconnect:issue-filters:<userId>:<projectId>`);
 * server-side per-user preferences are deferred.
 */
export function storageKey(userId: string, projectId: string): string {
  return `zconnect:issue-filters:${userId}:${projectId}`
}

export function loadIssueFilters(
  userId: string,
  projectId: string
): IssueFilterValue | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, projectId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const value = parsed as Partial<IssueFilterValue>
    return {
      statusIds: Array.isArray(value.statusIds)
        ? value.statusIds.filter((id): id is string => typeof id === "string")
        : [],
      priorities: Array.isArray(value.priorities)
        ? value.priorities.filter((p): p is Priority =>
            (PRIORITY_OPTIONS as string[]).includes(p as string)
          )
        : [],
      assigneeId:
        value.assigneeId === undefined ||
        value.assigneeId === null ||
        typeof value.assigneeId === "string"
          ? value.assigneeId
          : undefined,
      labels: Array.isArray(value.labels)
        ? value.labels.filter((name): name is string => typeof name === "string")
        : [],
      text: typeof value.text === "string" ? value.text : "",
    }
  } catch {
    return null
  }
}

export function saveIssueFilters(
  userId: string,
  projectId: string,
  value: IssueFilterValue
): void {
  localStorage.setItem(storageKey(userId, projectId), JSON.stringify(value))
}

const groupClass = "flex flex-wrap items-center gap-2"
const labelClass = "text-muted-foreground text-xs"
const inputClass =
  "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
const checkClass = "flex items-center gap-1 text-sm"

export function IssueFilterBar({
  statuses,
  members,
  labels = [],
  value,
  onChange,
}: {
  statuses: Status[]
  members: { userId: string }[]
  /** T5 workspace registry; the group hides when no labels exist yet. */
  labels?: Label[]
  value: IssueFilterValue
  onChange: (value: IssueFilterValue) => void
}) {
  return (
    <section className="flex flex-col gap-2" aria-label="Issue filters">
      <input
        className={inputClass}
        aria-label="Search issues"
        placeholder="Search by identifier or title…"
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <fieldset className={groupClass}>
        <legend className={labelClass}>Status</legend>
        {statuses.map((status) => (
          <label key={status.id} className={checkClass}>
            <input
              type="checkbox"
              checked={value.statusIds.includes(status.id)}
              onChange={() =>
                onChange({
                  ...value,
                  statusIds: toggle(value.statusIds, status.id),
                })
              }
            />
            {status.name}
          </label>
        ))}
      </fieldset>
      <fieldset className={groupClass}>
        <legend className={labelClass}>Priority</legend>
        {PRIORITY_OPTIONS.map((priority) => (
          <label key={priority} className={checkClass}>
            <input
              type="checkbox"
              checked={value.priorities.includes(priority)}
              onChange={() =>
                onChange({
                  ...value,
                  priorities: value.priorities.includes(priority)
                    ? value.priorities.filter((p) => p !== priority)
                    : [...value.priorities, priority],
                })
              }
            />
            {priority}
          </label>
        ))}
      </fieldset>
      {labels.length > 0 && (
        <fieldset className={groupClass}>
          <legend className={labelClass}>Labels</legend>
          {labels.map((label) => (
            <label key={label.id} className={checkClass}>
              <input
                type="checkbox"
                checked={value.labels.includes(label.name)}
                onChange={() =>
                  onChange({
                    ...value,
                    labels: toggle(value.labels, label.name),
                  })
                }
              />
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className={groupClass}>
        <label className={labelClass} htmlFor="issue-filter-assignee">
          Assignee
        </label>
        <select
          id="issue-filter-assignee"
          className={inputClass}
          aria-label="Assignee"
          value={value.assigneeId ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              assigneeId:
                e.target.value === ""
                  ? undefined
                  : e.target.value === "none"
                    ? null
                    : e.target.value,
            })
          }
        >
          <option value="">Everyone</option>
          <option value="none">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.userId}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
