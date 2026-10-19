/**
 * Relative due labels for compact surfaces (`1d overdue`, `due today`).
 * Calendar-day based, so a due time later today still reads as today.
 */
export function describeDueDate(
  dueDate: string | null,
  now: Date = new Date()
): { label: string; overdue: boolean } | null {
  if (dueDate === null) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round(
    (startOfDay(due) - startOfDay(now)) / (24 * 60 * 60 * 1000)
  )
  if (diffDays < 0) {
    const days = -diffDays
    return { label: `${days}d overdue`, overdue: true }
  }
  if (diffDays === 0) return { label: "due today", overdue: false }
  if (diffDays === 1) return { label: "due tomorrow", overdue: false }
  return { label: `due in ${diffDays}d`, overdue: false }
}

/**
 * Table-style due date (`Oct 14, 2026`). Parses the stored day as UTC so
 * the rendered date never shifts with the viewer's timezone.
 */
export function formatDueDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  if (
    year === undefined ||
    month === undefined ||
    date === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(date)
  ) {
    return day
  }
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/**
 * Created/updated timestamps (`Oct 14, 2026`) for the far-right List/Table
 * columns. Full ISO strings render in UTC so the date never shifts with the
 * viewer's timezone; missing or unparsable values read as an em dash.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
