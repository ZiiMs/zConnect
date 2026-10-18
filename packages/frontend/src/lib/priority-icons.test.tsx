import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import type { Priority } from "@/lib/api"
import { PriorityMark } from "./priority-icons.js"

const CASES: { priority: Priority; name: string }[] = [
  { priority: "Urgent", name: "Urgent" },
  { priority: "High", name: "High" },
  { priority: "Medium", name: "Medium" },
  { priority: "Low", name: "Low" },
  { priority: "None", name: "No priority" },
]

describe("PriorityMark", () => {
  for (const { priority, name } of CASES) {
    test(`${priority} renders a visible ${name} mark`, () => {
      const { container } = render(<PriorityMark priority={priority} />)
      expect(screen.getByRole("img", { name })).toBeInTheDocument()
      // Every mark — including None — paints an actual glyph.
      expect(container.querySelector("svg")).not.toBeNull()
    })
  }

  test("None shows no bars, only greyed-out ghosts", () => {
    const { container } = render(<PriorityMark priority="None" />)
    // Four ghost bars keep the mark's footprint; none are filled.
    const bars = container.querySelectorAll('svg rect[data-filled="true"]')
    expect(bars).toHaveLength(0)
    expect(container.querySelectorAll("svg rect")).toHaveLength(4)
  })

  test("higher priorities fill more bars", () => {
    const levels: { priority: Priority; filled: number }[] = [
      { priority: "Low", filled: 1 },
      { priority: "Medium", filled: 2 },
      { priority: "High", filled: 3 },
      { priority: "Urgent", filled: 4 },
    ]
    for (const { priority, filled } of levels) {
      const { container, unmount } = render(
        <PriorityMark priority={priority} />
      )
      expect(
        container.querySelectorAll('svg rect[data-filled="true"]')
      ).toHaveLength(filled)
      unmount()
    }
  })

  test("label scopes the accessible name to the issue", () => {
    render(<PriorityMark priority="None" label="Priority for WEB-1: None" />)
    expect(
      screen.getByRole("img", { name: "Priority for WEB-1: None" })
    ).toBeInTheDocument()
  })
})
