import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Kanban, List, type LucideIcon, Table } from "lucide-react"
import { useState } from "react"
import {
  emptyIssueFilters,
  ISSUE_DISPLAY_PROPS,
  ISSUE_GROUP_BYS,
  ISSUE_ORDERS,
  type IssueDisplayProps,
  IssueFilterBar,
  type IssueFilterValue,
  type IssueGroupBy,
  type IssueOrder,
} from "@/components/issue-filter-bar"
import { Button } from "@/components/ui/button"
import type { Label, Status } from "@/lib/api"

/** Count of active filter facets (statuses + priorities + labels + assignee + text). */
export function activeFilterCount(value: IssueFilterValue): number {
  let count =
    value.statusIds.length + value.priorities.length + value.labels.length
  if (value.assigneeId !== undefined) count += 1
  if (value.text.trim().length > 0) count += 1
  return count
}

export type IssueView = "list" | "table" | "kanban"

export const ISSUE_VIEWS: {
  id: IssueView
  label: string
  icon: LucideIcon
}[] = [
  { id: "list", label: "List", icon: List },
  { id: "table", label: "Table", icon: Table },
  { id: "kanban", label: "Kanban", icon: Kanban },
]

const rowClass = "flex items-center justify-between gap-3"
const rowLabelClass = "text-sm"
const sectionLabelClass = "text-muted-foreground text-xs font-semibold"
const selectClass =
  "w-40 rounded-md border border-input bg-background px-2 py-1 text-sm"

/**
 * Compact on/off switch. Pill-shaped by control convention (like the count
 * badges); everything else in the panel stays on the sharp theme.
 */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-4 rounded-full bg-primary-foreground transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  )
}

/**
 * View-options popover: the List/Table/Kanban switcher, grouping, ordering,
 * empty-group and display-property controls, above the Reset/Done footer.
 * Facet filters (search, status, priority, labels, assignee) stay on top;
 * view prefs persist per user per project alongside them.
 */
export function IssueFilterPopover({
  statuses,
  members,
  labels = [],
  value,
  onChange,
  view,
  onViewChange,
}: {
  statuses: Status[]
  members: { userId: string }[]
  labels?: Label[]
  value: IssueFilterValue
  onChange: (value: IssueFilterValue) => void
  view: IssueView
  onViewChange: (view: IssueView) => void
}) {
  const [open, setOpen] = useState(false)
  const count = activeFilterCount(value)

  function setGroupBy(groupBy: IssueGroupBy) {
    onChange({ ...value, groupBy })
  }

  function setOrder(order: IssueOrder) {
    onChange({ ...value, order })
  }

  function toggleDisplay(id: keyof IssueDisplayProps) {
    onChange({
      ...value,
      display: { ...value.display, [id]: !value.display[id] },
    })
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={(props) => (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Filters${count > 0 ? ` (${count} active)` : ""}`}
            {...props}
          >
            Filters
            {count > 0 && (
              <span
                data-testid="filter-count"
                className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
              >
                {count}
              </span>
            )}
          </Button>
        )}
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            aria-label="Issue filters"
            className="z-50 max-h-[calc(100svh-4rem)] w-[22rem] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-xl outline-none"
          >
            <div className="flex flex-col gap-3">
              <div
                role="tablist"
                aria-label="Issue views"
                className="grid grid-cols-3 gap-1 rounded-md border bg-card p-1"
              >
                {ISSUE_VIEWS.map((option) => {
                  const Glyph = option.icon
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={view === option.id}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => {
                        onViewChange(option.id)
                        setOpen(false)
                      }}
                      className={`grid place-items-center rounded-md px-2.5 py-1.5 ${
                        view === option.id
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-accent-foreground"
                      }`}
                    >
                      <Glyph size={15} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
              <IssueFilterBar
                statuses={statuses}
                members={members}
                labels={labels}
                value={value}
                onChange={onChange}
              />
              <div className="flex flex-col gap-2">
                <div className={rowClass}>
                  <span className={rowLabelClass} id="filter-grouping-label">
                    Grouping
                  </span>
                  <select
                    aria-labelledby="filter-grouping-label"
                    className={selectClass}
                    value={value.groupBy}
                    onChange={(e) => setGroupBy(e.target.value as IssueGroupBy)}
                  >
                    {ISSUE_GROUP_BYS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={rowClass}>
                  <span className={rowLabelClass} id="filter-ordering-label">
                    Ordering
                  </span>
                  <select
                    aria-labelledby="filter-ordering-label"
                    className={selectClass}
                    value={value.order}
                    onChange={(e) => setOrder(e.target.value as IssueOrder)}
                  >
                    {ISSUE_ORDERS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={rowClass}>
                  <span className={rowLabelClass} id="filter-empty-label">
                    Show empty groups
                  </span>
                  <Switch
                    checked={value.showEmptyGroups}
                    onChange={(showEmptyGroups) =>
                      onChange({ ...value, showEmptyGroups })
                    }
                    label="Show empty groups"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={sectionLabelClass}>Display properties</span>
                <div className="flex flex-wrap gap-1">
                  {ISSUE_DISPLAY_PROPS.map((prop) => {
                    const selected = value.display[prop.id]
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`Display ${prop.label}`}
                        onClick={() => toggleDisplay(prop.id)}
                        className={`rounded-md border px-2 py-0.5 text-xs ${
                          selected
                            ? "border-ring bg-accent font-medium"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {prop.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => onChange(emptyIssueFilters())}
                >
                  Reset
                </Button>
                <Button className="ml-auto" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
