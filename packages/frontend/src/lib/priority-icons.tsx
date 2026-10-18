import type { Priority } from "@/lib/api"

/**
 * Priority marks: reception-style signal bars, icon-only. The filled bar
 * count carries the urgency — None shows no bars (all four greyed out),
 * Low one, Medium two, High three, Urgent all four — and the fill color
 * warms with the level, from the muted tone up to destructive red. Bars
 * read at a glance beside an identifier without competing with it; the
 * accessible name (not the glyph) carries the exact priority.
 */
const PRIORITY_LEVELS: Record<
  Priority,
  { level: number; label: string; tone: string }
> = {
  Urgent: { level: 4, label: "Urgent", tone: "var(--destructive)" },
  High: { level: 3, label: "High", tone: "var(--priority-high)" },
  Medium: { level: 2, label: "Medium", tone: "var(--priority-medium)" },
  Low: { level: 1, label: "Low", tone: "var(--muted-foreground)" },
  None: { level: 0, label: "No priority", tone: "var(--muted-foreground)" },
}

const BAR_POSITIONS = [0, 1, 2, 3]

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
  const mark = PRIORITY_LEVELS[priority]
  return (
    <span
      role="img"
      aria-label={label ?? mark.label}
      title={mark.label}
      className="inline-flex shrink-0 items-center"
    >
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16">
        {BAR_POSITIONS.map((position) => {
          const height = 4 + position * 3
          const filled = position < mark.level
          return (
            <rect
              key={position}
              x={1 + position * 4}
              y={15 - height}
              width={3}
              height={height}
              rx={0.8}
              data-filled={filled}
              fill={filled ? mark.tone : "var(--muted-foreground)"}
              opacity={filled ? 1 : 0.35}
            />
          )
        })}
      </svg>
    </span>
  )
}
