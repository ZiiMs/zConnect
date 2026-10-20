import { describe, expect, test } from "vitest"
import { formatRelativeTime } from "./relative-time.js"

const NOW = Date.parse("2026-10-20T12:00:00.000Z")

describe("formatRelativeTime", () => {
  test("shows minutes under an hour", () => {
    expect(formatRelativeTime("2026-10-20T11:58:00.000Z", NOW)).toBe("2m ago")
  })

  test("shows hours under a day", () => {
    expect(formatRelativeTime("2026-10-20T09:00:00.000Z", NOW)).toBe("3h ago")
  })

  test("shows days under a week", () => {
    expect(formatRelativeTime("2026-10-18T12:00:00.000Z", NOW)).toBe("2d ago")
  })

  test("falls back to a date once the item is a week old", () => {
    const label = formatRelativeTime("2026-09-01T12:00:00.000Z", NOW)
    expect(label).not.toMatch(/ago/)
    expect(label).toContain("2026")
  })

  test("treats the last minute and future timestamps as just now", () => {
    expect(formatRelativeTime("2026-10-20T11:59:30.000Z", NOW)).toBe("just now")
    expect(formatRelativeTime("2026-10-20T12:05:00.000Z", NOW)).toBe("just now")
  })
})
