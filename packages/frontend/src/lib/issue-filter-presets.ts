import type { Status, StatusCategory } from "@/lib/api"

/**
 * The Issues screen filter row (ADR-0001): the coarse preset that sits above
 * the List / Table / Kanban view row. Each preset is just a status-id set on
 * the shared filter value (`IssueFilterValue.statusIds`), so the per-status
 * checkboxes in the filter bar refine it and localStorage persists it.
 *
 * "All Issues" is the empty set: the query then carries no status constraint
 * and keeps its standing `archived=false` default, so it never lists archived
 * issues.
 */
export const ISSUE_FILTER_PRESETS = [
  { id: "active", label: "Active" },
  { id: "backlog", label: "Backlog" },
  { id: "all", label: "All Issues" },
] as const

export type IssueFilterPreset = (typeof ISSUE_FILTER_PRESETS)[number]["id"]

/** Active covers the three open buckets; the terminal three stay out. */
export const ACTIVE_STATUS_CATEGORIES: readonly StatusCategory[] = [
  "Backlog",
  "Unstarted",
  "In Progress",
]

export const BACKLOG_STATUS_CATEGORIES: readonly StatusCategory[] = ["Backlog"]

/**
 * The Status Categories each preset selects, in one place so the two
 * directions below cannot drift. "All Issues" is the empty set: the query
 * then carries no status constraint and keeps its standing `archived=false`
 * default, so it never lists archived issues.
 */
export const PRESET_STATUS_CATEGORIES: Record<
  IssueFilterPreset,
  readonly StatusCategory[]
> = {
  active: ACTIVE_STATUS_CATEGORIES,
  backlog: BACKLOG_STATUS_CATEGORIES,
  all: [],
}

function statusIdsForCategories(
  statuses: Status[],
  categories: readonly StatusCategory[]
): string[] {
  const wanted = new Set<StatusCategory>(categories)
  return statuses
    .filter((status) => wanted.has(status.category))
    .map((status) => status.id)
}

export function presetStatusIds(
  preset: IssueFilterPreset,
  statuses: Status[]
): string[] {
  return statusIdsForCategories(statuses, PRESET_STATUS_CATEGORIES[preset])
}

export function activeStatusIds(statuses: Status[]): string[] {
  return presetStatusIds("active", statuses)
}

export function backlogStatusIds(statuses: Status[]): string[] {
  return presetStatusIds("backlog", statuses)
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/**
 * Which preset the current status-id selection is, or null once the user has
 * hand-narrowed the set (no single preset then describes it). An empty
 * selection reads as "all".
 */
export function presetForStatusIds(
  statusIds: string[],
  statuses: Status[]
): IssueFilterPreset | null {
  if (statusIds.length === 0) return "all"
  for (const preset of ISSUE_FILTER_PRESETS) {
    if (preset.id === "all") continue
    if (sameIds(statusIds, presetStatusIds(preset.id, statuses))) {
      return preset.id
    }
  }
  return null
}
