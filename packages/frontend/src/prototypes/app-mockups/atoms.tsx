/**
 * PROTOTYPE (throwaway) — the only primitives the layout variants share.
 *
 * Deliberately tiny: a glyph set and the small domain marks (priority, label,
 * status, assignee, due chip). Everything structural — nav, rails, panes,
 * toolbars, lists — is owned by each variant, so the layouts are free to
 * disagree about hierarchy instead of converging on one grid.
 *
 * Glyphs are inline SVG rather than `lucide-react` so the mockups never break
 * on an icon rename.
 */

import { cn } from "cn"
import type { ReactNode } from "react"
import type { Issue, Label, Priority, Status } from "@/lib/api"
import {
  dueLabel,
  initials,
  isOverdue,
  type Person,
  personOf,
  statusOf,
} from "./stub-data"

const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M19 12l-7 7-7-7" />,
  minus: <path d="M5 12h14" />,
  equal: <path d="M5 9h14M5 15h14" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  filter: <path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z" />,
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </>
  ),
  tag: (
    <>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  branch: (
    <>
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 12a9 9 0 0 0 9 9 3 3 0 1 0 3-3" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8L4.3 10.7l5.8-1.9Z" />
  ),
  panel: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </>
  ),
  expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  command: (
    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
  ),
  logOut: (
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </>
  ),
} as const

export type GlyphName = keyof typeof PATHS

export function Glyph({
  name,
  className,
}: {
  name: GlyphName
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      {PATHS[name]}
    </svg>
  )
}

export function Avatar({
  person,
  size = 20,
  className,
}: {
  person: Person | null
  size?: number
  className?: string
}) {
  if (person === null) {
    return (
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full border border-border border-dashed text-muted-foreground",
          className
        )}
        role="img"
        style={{ height: size, width: size, fontSize: size * 0.45 }}
        title="Unassigned"
      >
        —
      </span>
    )
  }
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-full bg-secondary font-medium text-secondary-foreground",
        className
      )}
      style={{ height: size, width: size, fontSize: size * 0.42 }}
      title={person.name}
    >
      {initials(person.name)}
      {person.online ? (
        <span
          className="absolute -right-px -bottom-px size-1.5 rounded-full border-2"
          style={{
            backgroundColor: "var(--proto-ok)",
            borderColor: "var(--card)",
          }}
        />
      ) : null}
    </span>
  )
}

const PRIORITY: Record<
  Priority,
  { glyph: GlyphName; label: string; tone: string }
> = {
  Urgent: { glyph: "alert", label: "Urgent", tone: "var(--destructive)" },
  High: { glyph: "arrowUp", label: "High", tone: "var(--proto-warn)" },
  Medium: { glyph: "equal", label: "Medium", tone: "var(--proto-info)" },
  Low: { glyph: "arrowDown", label: "Low", tone: "var(--muted-foreground)" },
  None: {
    glyph: "minus",
    label: "No priority",
    tone: "var(--muted-foreground)",
  },
}

/**
 * Softened priority tone: same hue, mixed toward the muted palette so it
 * reads without popping. Low/None already sit on `--muted-foreground`, so
 * they are unchanged. Used where the icon sits beside plain text on a card
 * (the Kanban Issue card) rather than standing alone.
 *
 * `in oklab`, not `in oklch`: the partner is near-achromatic, and mixing in a
 * polar space interpolates its (arbitrary) hue too, which dragged High's
 * amber (hue 72) to 13.6 — a red that collided with Urgent. oklab is
 * rectangular, so only chroma scales and every hue survives.
 */
function softTone(tone: string): string {
  return `color-mix(in oklab, ${tone} 60%, var(--muted-foreground))`
}

export function PriorityMark({
  priority,
  withLabel = false,
  soft = false,
  className,
}: {
  priority: Priority
  withLabel?: boolean
  /** Dim the tone toward the muted palette (same hue, less pop). */
  soft?: boolean
  className?: string
}) {
  const mark = PRIORITY[priority]
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", className)}
      style={{ color: soft ? softTone(mark.tone) : mark.tone }}
      title={mark.label}
    >
      <Glyph className="size-3.5" name={mark.glyph} />
      {withLabel ? <span>{mark.label}</span> : null}
    </span>
  )
}

export function labelTint(color: string, amount = 14): string {
  return `color-mix(in oklch, ${color} ${amount}%, transparent)`
}

export function LabelChip({
  label,
  variant = "soft",
  className,
}: {
  label: Label
  variant?: "soft" | "bare" | "outline"
  className?: string
}) {
  if (variant === "bare") {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-xs", className)}
      >
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: label.color }}
        />
        {label.name}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4",
        variant === "outline" && "border",
        className
      )}
      style={{
        backgroundColor:
          variant === "outline" ? "transparent" : labelTint(label.color, 16),
        borderColor:
          variant === "outline" ? labelTint(label.color, 45) : undefined,
        color:
          variant === "outline"
            ? `color-mix(in oklch, ${label.color} 72%, var(--foreground))`
            : undefined,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  )
}

const CATEGORY_TONE: Record<Status["category"], string> = {
  Backlog: "var(--muted-foreground)",
  Unstarted: "var(--muted-foreground)",
  "In Progress": "var(--proto-info)",
  Completed: "var(--proto-ok)",
  Canceled: "var(--proto-warn)",
  Duplicate: "var(--muted-foreground)",
}

export function StatusPill({
  status,
  withDot = true,
  className,
}: {
  status: Status
  withDot?: boolean
  className?: string
}) {
  const tone = CATEGORY_TONE[status.category]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-4",
        className
      )}
      style={{
        borderColor: labelTint(tone, 35),
        backgroundColor: labelTint(tone, 12),
      }}
    >
      {withDot ? (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: tone }}
        />
      ) : null}
      {status.name}
    </span>
  )
}

export function categoryTone(status: Status): string {
  return CATEGORY_TONE[status.category]
}

export function KeyTag({
  issue,
  className,
}: {
  issue: Issue
  className?: string
}) {
  return (
    <span className={cn("proto-mono text-muted-foreground text-xs", className)}>
      {issue.identifier}
    </span>
  )
}

export function issueStatus(issue: Issue): Status {
  return statusOf(issue)
}

export function IssueAssignee({ issue }: { issue: Issue }) {
  return <Avatar person={personOf(issue.assigneeId)} size={20} />
}

export function DueChip({
  dueDate,
  className,
}: {
  dueDate: string | null
  className?: string
}) {
  const text = dueLabel(dueDate)
  if (text === null) return null
  const late = isOverdue(dueDate)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[11px]",
        late ? "" : "text-muted-foreground",
        className
      )}
      style={late ? { color: "var(--destructive)" } : undefined}
    >
      <Glyph className="size-3" name="clock" />
      {text}
    </span>
  )
}

export function IconButton({
  glyph,
  label,
  active = false,
  className,
}: {
  glyph: GlyphName
  label: string
  active?: boolean
  className?: string
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
        className
      )}
      title={label}
      type="button"
    >
      <Glyph className="size-3.5" name={glyph} />
    </button>
  )
}

export function Pane({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("proto-scroll overflow-auto", className)}>
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        "proto-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider",
        className
      )}
    >
      {children}
    </h2>
  )
}

export function Meter({
  value,
  max,
  tone = "var(--proto-ok)",
}: {
  value: number
  max: number
  tone?: string
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: tone }}
      />
    </div>
  )
}
