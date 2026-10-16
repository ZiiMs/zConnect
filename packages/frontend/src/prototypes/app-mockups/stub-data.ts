/**
 * PROTOTYPE (throwaway) — stub data for the app-shell mockups.
 *
 * The real signed-in surface needs a running backend, an account and seeded
 * rows before anything renders, which makes flipping between variants
 * impossible. So the variants read from this fixed, domain-accurate fixture
 * instead: same shapes as `@/lib/api`, no network, no mutations.
 *
 * `NOW` is frozen so relative timestamps and "overdue" read the same on every
 * reload, whatever day the mockups are reviewed.
 */
import {
  type Issue,
  issueProgress,
  type Label,
  type Member,
  type Priority,
  type Project,
  type Status,
  type StatusCategory,
  type Workspace,
} from "@/lib/api"

/** Frozen clock the mockups format against (2026-10-15, mid-morning). */
export const NOW = new Date("2026-10-15T09:20:00.000Z")

export interface Person {
  id: string
  name: string
  handle: string
  role: "Owner" | "Admin" | "Member"
  /** Synthetic presence dot, so variants can show who is around. */
  online: boolean
}

export const viewerId = "u-1"

export const people: Person[] = [
  {
    id: "u-1",
    name: "Ada Lindgren",
    handle: "ada",
    role: "Owner",
    online: true,
  },
  {
    id: "u-2",
    name: "Bruno Vega",
    handle: "bruno",
    role: "Admin",
    online: true,
  },
  { id: "u-3", name: "Chen Wu", handle: "chen", role: "Member", online: false },
  {
    id: "u-4",
    name: "Dara Okafor",
    handle: "dara",
    role: "Member",
    online: true,
  },
  {
    id: "u-5",
    name: "Emil Fischer",
    handle: "emil",
    role: "Member",
    online: false,
  },
  {
    id: "u-6",
    name: "Farah Nasser",
    handle: "farah",
    role: "Member",
    online: true,
  },
]

export const viewer = people[0]

export const workspace: Workspace = {
  id: "w-1",
  name: "Northwind Labs",
  role: "Owner",
}

export const members: Member[] = people.map((person) => ({
  workspaceId: workspace.id,
  userId: person.id,
  role: person.role,
}))

export const projects: Project[] = [
  {
    id: "p-zc",
    workspaceId: workspace.id,
    name: "zConnect",
    key: "ZC",
    icon: "Folder",
    color: "#94a3b8",
  },
  {
    id: "p-web",
    workspaceId: workspace.id,
    name: "Web App",
    key: "WEB",
    icon: "Globe",
    color: "#5e6ad2",
  },
  {
    id: "p-mob",
    workspaceId: workspace.id,
    name: "Mobile",
    key: "MOB",
    icon: "Rocket",
    color: "#f2c94c",
  },
  {
    id: "p-ds",
    workspaceId: workspace.id,
    name: "Design System",
    key: "DS",
    icon: "Layers",
    color: "#0f783c",
  },
]

export const activeProject = projects[0]

export const statuses: Status[] = [
  {
    id: "s-backlog",
    projectId: "p-zc",
    name: "Backlog",
    category: "Backlog",
    color: "#bec2c8",
    position: 0,
  },
  {
    id: "s-todo",
    projectId: "p-zc",
    name: "Todo",
    category: "Unstarted",
    color: "#e2e2e2",
    position: 1,
  },
  {
    id: "s-progress",
    projectId: "p-zc",
    name: "In Progress",
    category: "In Progress",
    color: "#f2c94c",
    position: 2,
  },
  {
    id: "s-review",
    projectId: "p-zc",
    name: "In Review",
    category: "In Progress",
    color: "#0f783c",
    position: 3,
  },
  {
    id: "s-done",
    projectId: "p-zc",
    name: "Done",
    category: "Completed",
    color: "#5e6ad2",
    position: 4,
  },
]

export const labels: Label[] = [
  { id: "l-bug", workspaceId: workspace.id, name: "bug", color: "#ef4444" },
  {
    id: "l-feature",
    workspaceId: workspace.id,
    name: "feature",
    color: "#6366f1",
  },
  { id: "l-perf", workspaceId: workspace.id, name: "perf", color: "#f59e0b" },
  { id: "l-docs", workspaceId: workspace.id, name: "docs", color: "#64748b" },
  { id: "l-debt", workspaceId: workspace.id, name: "debt", color: "#a855f7" },
  { id: "l-a11y", workspaceId: workspace.id, name: "a11y", color: "#14b8a6" },
]

function issue(
  number: number,
  title: string,
  statusId: string,
  priority: Priority,
  assigneeId: string | null,
  labelIds: string[],
  extra: Partial<Issue> = {}
): Issue {
  return {
    id: `i-${number}`,
    projectId: "p-zc",
    number,
    keyPrefix: "ZC",
    identifier: `ZC-${number}`,
    title,
    description: null,
    statusId,
    priority,
    assigneeId,
    dueDate: null,
    archived: false,
    labels: labelIds,
    parentId: null,
    updatedAt: "2026-10-14T15:02:00.000Z",
    ...extra,
  }
}

export const issues: Issue[] = [
  issue(
    161,
    "Realtime subscription leaks when switching projects quickly",
    "s-progress",
    "Urgent",
    "u-6",
    ["l-bug", "l-perf"],
    {
      dueDate: "2026-10-14",
      updatedAt: "2026-10-15T08:41:00.000Z",
      description:
        "Switching projects before the first fetch settles leaves the websocket channel open. With two tabs open we accumulate one orphaned channel per switch, and issue updates start arriving twice.",
    }
  ),
  issue(
    142,
    "Kanban drag drops the card back when the column is empty",
    "s-progress",
    "Urgent",
    "u-3",
    ["l-bug"],
    {
      dueDate: "2026-10-15",
      updatedAt: "2026-10-15T07:58:00.000Z",
      description:
        "Dropping into a status with no cards snaps the card home. The drop target exists but has no measured height, so dnd-kit resolves it to the nearest card instead.",
    }
  ),
  issue(
    156,
    "Status colours are indistinguishable with deuteranopia",
    "s-progress",
    "High",
    "u-5",
    ["l-a11y"],
    { dueDate: "2026-10-22", updatedAt: "2026-10-15T07:12:00.000Z" }
  ),
  issue(
    148,
    "Slow issue query on workspaces with many labels",
    "s-progress",
    "High",
    "u-6",
    ["l-perf"],
    { dueDate: "2026-10-20", updatedAt: "2026-10-14T16:30:00.000Z" }
  ),
  issue(
    139,
    "Table view: inline status change loses keyboard focus",
    "s-review",
    "High",
    "u-4",
    ["l-bug", "l-a11y"],
    { updatedAt: "2026-10-15T06:10:00.000Z" }
  ),
  issue(
    159,
    "Webhook-created external links lose the pull request title",
    "s-review",
    "Medium",
    "u-2",
    ["l-bug"],
    { updatedAt: "2026-10-14T18:44:00.000Z" }
  ),
  issue(
    145,
    "Realtime conflict toast should name the issue",
    "s-todo",
    "Medium",
    "u-1",
    ["l-feature"],
    { updatedAt: "2026-10-14T12:02:00.000Z" }
  ),
  issue(
    152,
    "External link badge overflows on narrow rows",
    "s-todo",
    "Medium",
    "u-3",
    ["l-bug"],
    { dueDate: "2026-10-17", updatedAt: "2026-10-13T09:25:00.000Z" }
  ),
  issue(
    146,
    "Subtasks: show the parent breadcrumb in the row",
    "s-todo",
    "Low",
    null,
    ["l-feature"],
    { updatedAt: "2026-10-13T14:05:00.000Z" }
  ),
  issue(
    153,
    "Avatar stack shows an empty circle when the assignee is null",
    "s-todo",
    "Low",
    "u-4",
    ["l-bug"],
    { updatedAt: "2026-10-12T11:40:00.000Z" }
  ),
  issue(
    149,
    "Document the status category rollup rules",
    "s-backlog",
    "Low",
    "u-5",
    ["l-docs"],
    { updatedAt: "2026-10-11T10:15:00.000Z" }
  ),
  issue(
    151,
    "Extract the issue query into a reusable hook",
    "s-backlog",
    "None",
    null,
    ["l-debt"],
    { updatedAt: "2026-10-11T08:00:00.000Z" }
  ),
  issue(
    155,
    "Keyboard: j/k to move between issues",
    "s-backlog",
    "Medium",
    "u-1",
    ["l-feature", "l-a11y"],
    { updatedAt: "2026-10-10T13:36:00.000Z" }
  ),
  issue(
    158,
    "Bulk archive of Done issues",
    "s-backlog",
    "Low",
    null,
    ["l-feature"],
    {
      updatedAt: "2026-10-09T15:20:00.000Z",
    }
  ),
  issue(
    160,
    "Add a command palette",
    "s-backlog",
    "None",
    "u-1",
    ["l-feature"],
    {
      updatedAt: "2026-10-09T09:02:00.000Z",
    }
  ),
  issue(
    137,
    "Per-project issue filter persistence",
    "s-done",
    "Medium",
    "u-2",
    ["l-feature"],
    { updatedAt: "2026-10-08T16:48:00.000Z" }
  ),
  issue(
    134,
    "Kanban columns keep the project key in the header",
    "s-done",
    "Low",
    "u-3",
    ["l-feature"],
    { updatedAt: "2026-10-07T12:31:00.000Z" }
  ),
  issue(
    130,
    "Members list paginates past 25 rows",
    "s-done",
    "Medium",
    "u-6",
    [],
    {
      updatedAt: "2026-10-06T10:11:00.000Z",
    }
  ),
  issue(162, "Repro with two tabs open", "s-todo", "High", "u-6", ["l-bug"], {
    parentId: "i-161",
    updatedAt: "2026-10-15T08:12:00.000Z",
  }),
  issue(
    163,
    "Add a regression test for the channel teardown",
    "s-backlog",
    "Medium",
    "u-6",
    ["l-bug"],
    { parentId: "i-161", updatedAt: "2026-10-14T17:20:00.000Z" }
  ),
  issue(164, "Capture the network trace", "s-done", "Low", "u-4", [], {
    parentId: "i-161",
    updatedAt: "2026-10-13T12:00:00.000Z",
  }),
  issue(
    165,
    "Note the drop fix in the changelog",
    "s-todo",
    "Low",
    "u-2",
    ["l-docs"],
    {
      parentId: "i-142",
      updatedAt: "2026-10-13T09:00:00.000Z",
    }
  ),
]

/** Only the top-level rows; variants pull subtasks via `subtasksOf`. */
export const topLevelIssues = issues.filter((item) => item.parentId === null)

export interface ActivityEntry {
  id: string
  actorId: string
  summary: string
  issueIdentifier: string
  at: string
  kind: "comment" | "status" | "created" | "link" | "assign"
}

export const activity: ActivityEntry[] = [
  {
    id: "a-1",
    actorId: "u-6",
    summary: "moved this to In Progress",
    issueIdentifier: "ZC-161",
    at: "2026-10-15T08:41:00.000Z",
    kind: "status",
  },
  {
    id: "a-2",
    actorId: "u-1",
    summary: "commented: “Two tabs reproduces it every time.”",
    issueIdentifier: "ZC-161",
    at: "2026-10-15T08:12:00.000Z",
    kind: "comment",
  },
  {
    id: "a-3",
    actorId: "u-3",
    summary: "commented: “The drop target has no height.”",
    issueIdentifier: "ZC-142",
    at: "2026-10-15T07:58:00.000Z",
    kind: "comment",
  },
  {
    id: "a-4",
    actorId: "u-5",
    summary: "linked pull request #284",
    issueIdentifier: "ZC-156",
    at: "2026-10-15T07:12:00.000Z",
    kind: "link",
  },
  {
    id: "a-5",
    actorId: "u-4",
    summary: "moved this to In Review",
    issueIdentifier: "ZC-139",
    at: "2026-10-15T06:10:00.000Z",
    kind: "status",
  },
  {
    id: "a-6",
    actorId: "u-2",
    summary: "assigned this to Chen Wu",
    issueIdentifier: "ZC-152",
    at: "2026-10-14T18:44:00.000Z",
    kind: "assign",
  },
  {
    id: "a-7",
    actorId: "u-1",
    summary: "created this from the Backlog",
    issueIdentifier: "ZC-160",
    at: "2026-10-09T09:02:00.000Z",
    kind: "created",
  },
]

export const pendingInvites = [
  { email: "grace@northwind.dev", role: "Member" as const },
  { email: "hiro@northwind.dev", role: "Admin" as const },
]

export const externalLinks = [
  {
    id: "x-1",
    label: "PR #284",
    url: "https://example.com/pull/284",
    meta: "open",
  },
  {
    id: "x-2",
    label: "fix/realtime-teardown",
    url: "https://example.com/tree/fix",
    meta: "branch",
  },
]

/** Filter presets the filter bars show as chips. */
export const savedViews = [
  { id: "v-1", name: "My open issues", count: 4 },
  { id: "v-2", name: "Needs review", count: 2 },
  { id: "v-3", name: "Urgent", count: 2 },
]

export function personOf(id: string | null): Person | null {
  if (id === null) return null
  return people.find((person) => person.id === id) ?? null
}

export function statusOf(issue: Issue): Status {
  const found = statuses.find((status) => status.id === issue.statusId)
  if (found === undefined) throw new Error(`unknown status ${issue.statusId}`)
  return found
}

export function labelsOf(issue: Issue): Label[] {
  return issue.labels
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is Label => label !== undefined)
}

export function subtasksOf(issue: Issue): Issue[] {
  return issues.filter((item) => item.parentId === issue.id)
}

export function issuesInStatus(statusId: string): Issue[] {
  return topLevelIssues.filter((item) => item.statusId === statusId)
}

export function countsByStatus(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const status of statuses) {
    counts[status.id] = issuesInStatus(status.id).length
  }
  return counts
}

export const projectProgress = {
  total: topLevelIssues.length,
  done: issueProgress(topLevelIssues, statuses).done,
  urgent: topLevelIssues.filter((item) => item.priority === "Urgent").length,
  unassigned: topLevelIssues.filter((item) => item.assigneeId === null).length,
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? "?"
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(iso: string): string {
  const delta = NOW.getTime() - new Date(iso).getTime()
  if (delta < HOUR) return `${Math.max(1, Math.round(delta / MINUTE))}m ago`
  if (delta < DAY) return `${Math.round(delta / HOUR)}h ago`
  const days = Math.round(delta / DAY)
  if (days === 1) return "yesterday"
  if (days < 14) return `${days}d ago`
  return `${Math.round(days / 7)}w ago`
}

export function dueLabel(iso: string | null): string | null {
  if (iso === null) return null
  const due = new Date(`${iso}T12:00:00.000Z`)
  const days = Math.round((due.getTime() - NOW.getTime()) / DAY)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "due today"
  if (days === 1) return "due tomorrow"
  return `due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

export function isOverdue(iso: string | null): boolean {
  if (iso === null) return false
  return new Date(`${iso}T12:00:00.000Z`).getTime() < NOW.getTime()
}

export const categoryLabel: Record<StatusCategory, string> = {
  Backlog: "Backlog",
  Unstarted: "Unstarted",
  "In Progress": "In Progress",
  Completed: "Completed",
  Canceled: "Canceled",
  Duplicate: "Duplicate",
}

export const priorityOrder: Priority[] = [
  "Urgent",
  "High",
  "Medium",
  "Low",
  "None",
]

export const issueById = (id: string): Issue =>
  issues.find((item) => item.id === id) ?? issues[0]

/** The issue the detail screens focus on. */
export const focusIssue = issueById("i-161")
