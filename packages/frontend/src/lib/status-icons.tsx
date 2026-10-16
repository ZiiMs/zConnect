import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  Copy,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react"
import type { StatusCategory } from "@/lib/api"
import {
  DEFAULT_STATUS_COLORS,
  FALLBACK_STATUS_COLOR,
} from "@/lib/status-colors"

/**
 * Linear-style workflow marks, one per Status Category: dashed backlog,
 * empty unstarted, loader in-progress, checked completed, crossed canceled,
 * copied duplicate. Tinted with the status color, so the card shows the
 * mark instead of spelling the status name out.
 */
const CATEGORY_ICONS: Record<StatusCategory, LucideIcon> = {
  Backlog: CircleDashed,
  Unstarted: Circle,
  "In Progress": LoaderCircle,
  Completed: CircleCheck,
  Canceled: CircleX,
  Duplicate: Copy,
}

/** Status mark: the category icon in the status color. */
export function StatusIcon({
  status,
  size = 14,
}: {
  status: { name: string; category: StatusCategory; color?: string }
  size?: number
}) {
  const Glyph = CATEGORY_ICONS[status.category] ?? Circle
  const color =
    typeof status.color === "string" && /^#[0-9a-fA-F]{6}$/.test(status.color)
      ? status.color
      : (DEFAULT_STATUS_COLORS[status.name] ?? FALLBACK_STATUS_COLOR)
  return (
    <span
      data-testid={`status-icon-${status.name}`}
      title={status.name}
      className="inline-flex shrink-0 items-center"
      style={{ color }}
    >
      <Glyph aria-hidden="true" size={size} />
    </span>
  )
}
