import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { emptyIssueFilters } from "./issue-filter-bar.js"
import { IssueFilterPopover } from "./issue-filter-popover.js"

describe("overlay layering", () => {
  test("the filters popup floats above page content", async () => {
    const user = userEvent.setup()
    render(
      <IssueFilterPopover
        statuses={[]}
        members={[]}
        value={emptyIssueFilters()}
        onChange={() => {}}
        view="list"
        onViewChange={() => {}}
      />
    )

    await user.click(screen.getByRole("button", { name: /^filters/i }))

    // The z-index must sit on the positioner subtree root: floating-ui
    // places the positioner with a transform, which caps any z-index set
    // on the popup alone (sticky content painted over the panel).
    const filters = screen.getByRole("region", { name: "Issue filters" })
    expect(filters.closest(".z-50")).not.toBeNull()
  })

  test("selecting a view from the popover switches views", async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    render(
      <IssueFilterPopover
        statuses={[]}
        members={[]}
        value={emptyIssueFilters()}
        onChange={() => {}}
        view="list"
        onViewChange={onViewChange}
      />
    )

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))

    expect(onViewChange).toHaveBeenCalledWith("kanban")
  })
})

describe("view options", () => {
  test("grouping, ordering, empty groups and display report through onChange", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <IssueFilterPopover
        statuses={[]}
        members={[]}
        value={emptyIssueFilters()}
        onChange={onChange}
        view="list"
        onViewChange={() => {}}
      />
    )

    await user.click(screen.getByRole("button", { name: /^filters/i }))

    await user.selectOptions(screen.getByLabelText(/grouping/i), "priority")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupBy: "priority" })
    )

    await user.selectOptions(screen.getByLabelText(/ordering/i), "newest")
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ order: "newest" })
    )

    await user.click(screen.getByRole("switch", { name: /show empty groups/i }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ showEmptyGroups: true })
    )

    await user.click(screen.getByRole("button", { name: /display priority/i }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        display: expect.objectContaining({ priority: true }),
      })
    )
  })

  test("display properties fade when hidden, no ring outline", async () => {
    const user = userEvent.setup()
    render(
      <IssueFilterPopover
        statuses={[]}
        members={[]}
        value={{
          ...emptyIssueFilters(),
          display: { ...emptyIssueFilters().display, priority: false },
        }}
        onChange={() => {}}
        view="list"
        onViewChange={() => {}}
      />
    )

    await user.click(screen.getByRole("button", { name: /^filters/i }))

    const shown = screen.getByRole("button", { name: /display id/i })
    const hidden = screen.getByRole("button", { name: /display priority/i })
    expect(shown.getAttribute("aria-pressed")).toBe("true")
    expect(hidden.getAttribute("aria-pressed")).toBe("false")
    expect(shown.className).toContain("bg-accent")
    expect(shown.className).toContain("font-medium")
    expect(shown.className).not.toContain("border-ring")
    expect(shown.className).not.toContain("opacity-50")
    expect(hidden.className).toContain("opacity-50")
    expect(hidden.className).not.toContain("border-ring")
    expect(hidden.className).not.toContain("font-medium")
  })

  test("reset restores every default", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <IssueFilterPopover
        statuses={[]}
        members={[]}
        value={{
          ...emptyIssueFilters(),
          groupBy: "assignee",
          text: "fix",
        }}
        onChange={onChange}
        view="list"
        onViewChange={() => {}}
      />
    )

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("button", { name: /^reset$/i }))

    expect(onChange).toHaveBeenCalledWith(emptyIssueFilters())
  })
})
