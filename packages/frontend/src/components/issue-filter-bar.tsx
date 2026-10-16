import type { Label, Priority, Status } from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

const PRIORITY_OPTIONS: Priority[] = ["Urgent", "High", "Medium", "Low", "None"]

export interface IssueFilterValue {
  statusIds: string[]
  priorities: Priority[]
  /** undefined = everyone, null = unassigned, string = one member. */
  assigneeId?: string | null
  /** T5 registry label names; every selected label must match (AND). */
  labels: string[]
  text: string
  /** List grouping: status lanes, priority lanes, assignee lanes, or flat. */
  groupBy: IssueGroupBy
  /** Row order inside each group, by issue number (creation order). */
  order: IssueOrder
  /** Show groups with no matching issues instead of hiding them. */
  showEmptyGroups: boolean
  /** Row elements. Priority defaults off to keep rows dense. */
  display: IssueDisplayProps
}

export type IssueGroupBy = "status" | "priority" | "assignee" | "none"

export const ISSUE_GROUP_BYS: { id: IssueGroupBy; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "assignee", label: "Assignee" },
  { id: "none", label: "None" },
]

export type IssueOrder = "oldest" | "newest"

export const ISSUE_ORDERS: { id: IssueOrder; label: string }[] = [
  { id: "oldest", label: "Oldest" },
  { id: "newest", label: "Newest" },
]

export interface IssueDisplayProps {
  id: boolean
  status: boolean
  priority: boolean
  assignee: boolean
  due: boolean
  labels: boolean
}

export const ISSUE_DISPLAY_PROPS: {
  id: keyof IssueDisplayProps
  label: string
}[] = [
  { id: "id", label: "ID" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "assignee", label: "Assignee" },
  { id: "due", label: "Due date" },
  { id: "labels", label: "Labels" },
]

export function emptyIssueFilters(): IssueFilterValue {
  return {
    statusIds: [],
    priorities: [],
    assigneeId: undefined,
    labels: [],
    text: "",
    groupBy: "status",
    order: "oldest",
    showEmptyGroups: false,
    display: {
      id: true,
      status: true,
      priority: false,
      assignee: true,
      due: true,
      labels: true,
    },
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
        ? value.labels.filter(
            (name): name is string => typeof name === "string"
          )
        : [],
      text: typeof value.text === "string" ? value.text : "",
      groupBy:
        value.groupBy === "status" ||
        value.groupBy === "priority" ||
        value.groupBy === "assignee" ||
        value.groupBy === "none"
          ? value.groupBy
          : "status",
      order:
        value.order === "oldest" || value.order === "newest"
          ? value.order
          : "oldest",
      showEmptyGroups: value.showEmptyGroups === true,
      display: {
        id: value.display?.id !== false,
        status: value.display?.status !== false,
        priority: value.display?.priority === true,
        assignee: value.display?.assignee !== false,
        due: value.display?.due !== false,
        labels: value.display?.labels !== false,
      },
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
const pillClass =
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
/** Selected tone for the priority pills. */
const pillToneClass = (selected: boolean) =>
  selected
    ? "border-ring bg-accent font-medium text-accent-foreground"
    : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
/**
 * Status options read as visibility pills: the dot keeps the status color
 * cue; visible statuses get the accent pill while hidden ones fade out.
 * No ring outline: opacity carries the visible/hidden distinction.
 */
const statusOptionClass = (selected: boolean) =>
  `${pillClass} ${
    selected
      ? "border-transparent bg-accent font-medium text-accent-foreground"
      : "border-transparent text-muted-foreground opacity-50 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
  }`
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
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Filters
      </h4>
      {/* Ticket ziim/zConnect#4 acceptance requires "text by identifier/title"
          filtering, so this box is in scope: it is the per-project text
          filter, not the spec's out-of-scope "full-text search engine". */}
      <input
        className={inputClass}
        aria-label="Search issues"
        placeholder="Search by identifier or title…"
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      {statuses.length > 0 && (
        <fieldset>
          <legend className={labelClass}>Status</legend>
          <div className="flex flex-wrap gap-1">
            {statuses.map((status) => {
              const selected = value.statusIds.includes(status.id)
              return (
                <button
                  key={status.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    onChange({
                      ...value,
                      statusIds: toggle(value.statusIds, status.id),
                    })
                  }
                  className={statusOptionClass(selected)}
                >
                  <StatusIcon status={status} size={12} />
                  {status.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className={labelClass}>Priority</legend>
        <div className="flex flex-wrap gap-1">
          {PRIORITY_OPTIONS.map((priority) => {
            const selected = value.priorities.includes(priority)
            return (
              <button
                key={priority}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({
                    ...value,
                    priorities: value.priorities.includes(priority)
                      ? value.priorities.filter((p) => p !== priority)
                      : [...value.priorities, priority],
                  })
                }
                className={`${pillClass} ${pillToneClass(selected)}`}
              >
                {priority}
              </button>
            )
          })}
        </div>
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
                data-testid={`label-dot-${label.name}`}
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
