import { describe, expect, test } from "vitest"
import { describeDueDate, formatDueDate } from "./due.js"

/** Fixed noon so calendar-day math is deterministic. */
const NOW = new Date(2026, 9, 15, 12, 0, 0)

describe("describeDueDate", () => {
  test("past days read as overdue", () => {
    expect(
      describeDueDate(new Date(2026, 9, 14, 9, 30).toISOString(), NOW)
    ).toEqual({ label: "1d overdue", overdue: true })
    expect(describeDueDate(new Date(2026, 9, 10).toISOString(), NOW)).toEqual({
      label: "5d overdue",
      overdue: true,
    })
  })

  test("today and near-future labels are gentle", () => {
    expect(
      describeDueDate(new Date(2026, 9, 15, 23, 59).toISOString(), NOW)
    ).toEqual({ label: "due today", overdue: false })
    expect(describeDueDate(new Date(2026, 9, 16).toISOString(), NOW)).toEqual({
      label: "due tomorrow",
      overdue: false,
    })
    expect(describeDueDate(new Date(2026, 9, 20).toISOString(), NOW)).toEqual({
      label: "due in 5d",
      overdue: false,
    })
  })

  test("missing and garbage dates render nothing", () => {
    expect(describeDueDate(null, NOW)).toBeNull()
    expect(describeDueDate("not-a-date", NOW)).toBeNull()
  })

  test("formatDueDate renders table-style dates without shifting days", () => {
    expect(formatDueDate("2026-10-14")).toBe("Oct 14, 2026")
    expect(formatDueDate("2026-01-05")).toBe("Jan 5, 2026")
    expect(formatDueDate("garbage")).toBe("garbage")
  })
})
