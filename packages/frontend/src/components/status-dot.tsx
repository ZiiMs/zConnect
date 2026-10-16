import type { Status } from "@/lib/api"
import { statusColor } from "@/lib/status-colors"

/** Small color dot for a Status, using its seeded/custom color. */
export function StatusDot({
  status,
  size = 10,
}: {
  status: Pick<Status, "name" | "color">
  size?: number
}) {
  return (
    <span
      data-testid={`status-dot-${status.name}`}
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        backgroundColor: statusColor(status),
        width: size,
        height: size,
      }}
    />
  )
}
