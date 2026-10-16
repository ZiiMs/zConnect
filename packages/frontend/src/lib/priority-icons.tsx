import {
  ArrowDown,
  ArrowUp,
  CircleMinus,
  Equal,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react"
import type { Priority } from "@/lib/api"

/**
 * Priority marks: one glyph per Priority, tinted by that priority's own token
 * and softened toward the muted palette so the mark reads beside an
 * identifier without competing with it.
 *
 * `in oklab`, not `in oklch`: the mix partner is near-achromatic, and a polar
 * space interpolates its (arbitrary) hue too — an `oklch` mix dragged High's
 * amber far enough toward red to collide with Urgent. oklab is rectangular,
 * so only chroma scales and every hue survives. Low and None already sit on
 * `--muted-foreground`, so the mix collapses to that value for them.
 */
const PRIORITY_MARKS: Record<
  Priority,
  { icon: LucideIcon; label: string; tone: string }
> = {
  Urgent: {
    icon: TriangleAlert,
    label: "Urgent",
    tone: "var(--destructive)",
  },
  High: { icon: ArrowUp, label: "High", tone: "var(--priority-high)" },
  Medium: { icon: Equal, label: "Medium", tone: "var(--priority-medium)" },
  Low: { icon: ArrowDown, label: "Low", tone: "var(--muted-foreground)" },
  // Circled, not bare Minus: the ring keeps the mark visible at the muted
  // tone, where a single stroke reads as a layout hairline or vanishes.
  None: {
    icon: CircleMinus,
    label: "No priority",
    tone: "var(--muted-foreground)",
  },
}

function priorityTone(priority: Priority): string {
  return `color-mix(in oklab, ${PRIORITY_MARKS[priority].tone} 60%, var(--muted-foreground))`
}

/**
 * Priority mark, icon-only. `label` supplies the issue-scoped accessible name
 * (e.g. "Priority for WEB-1: High"); without it the mark names its own
 * priority.
 */
export function PriorityMark({
  priority,
  size = 14,
  label,
}: {
  priority: Priority
  size?: number
  label?: string
}) {
  const mark = PRIORITY_MARKS[priority]
  const Glyph = mark.icon
  return (
    <span
      role="img"
      aria-label={label ?? mark.label}
      title={mark.label}
      className="inline-flex shrink-0 items-center"
      style={{ color: priorityTone(priority) }}
    >
      <Glyph aria-hidden="true" size={size} />
    </span>
  )
}
