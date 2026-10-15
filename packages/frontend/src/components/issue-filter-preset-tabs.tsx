import type { Status } from "@/lib/api"
import {
  ISSUE_FILTER_PRESETS,
  presetForStatusIds,
  presetStatusIds,
} from "@/lib/issue-filter-presets"

/**
 * The Issues screen filter row: the three coarse presets that sit above the
 * List / Table / Kanban view row (ADR-0001). A preset is only a status-id
 * selection, so it composes with the filter bar's own controls — which is why
 * a hand-narrowed selection simply highlights none of them.
 */
export function IssueFilterPresetTabs({
  statuses,
  value,
  onChange,
}: {
  statuses: Status[]
  /** The current `IssueFilterValue.statusIds`. */
  value: string[]
  onChange: (statusIds: string[]) => void
}) {
  const selected = presetForStatusIds(value, statuses)

  return (
    <div
      role="tablist"
      aria-label="Issue filter presets"
      className="flex gap-1 rounded-md border bg-card p-1"
    >
      {ISSUE_FILTER_PRESETS.map((preset) => {
        const isSelected = selected === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => {
              if (isSelected) return
              onChange(presetStatusIds(preset.id, statuses))
            }}
            className={`rounded px-3 py-1 text-sm ${
              isSelected ? "bg-accent font-medium" : "text-muted-foreground"
            }`}
          >
            {preset.label}
          </button>
        )
      })}
    </div>
  )
}
