/**
 * Short relative timestamp for collaboration surfaces: "2m ago", "3h ago",
 * "2d ago", then a plain date once the item is a week old. `now` is
 * injectable so tests do not depend on the wall clock.
 */
export function formatRelativeTime(
  value: string,
  now: number = Date.now()
): string {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return value

  const diff = now - then
  if (diff < 60_000) return "just now"

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
