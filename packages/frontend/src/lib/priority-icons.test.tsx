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

  test("None uses a boxed glyph that stays visible at the muted tone", () => {
    const { container } = render(<PriorityMark priority="None" />)
    // A bare Minus is a single faint stroke; the circled glyph survives.
    expect(container.querySelector("svg.lucide-circle-minus")).not.toBeNull()
  })

  test("label scopes the accessible name to the issue", () => {
    render(<PriorityMark priority="None" label="Priority for WEB-1: None" />)
    expect(
      screen.getByRole("img", { name: "Priority for WEB-1: None" })
    ).toBeInTheDocument()
  })
})
