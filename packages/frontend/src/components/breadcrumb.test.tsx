import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { Breadcrumb } from "./breadcrumb.js"

describe("breadcrumb", () => {
  test("renders every crumb in order, separated by a chevron", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Web", onClick: () => {} },
          { label: "Issues", onClick: () => {} },
          { label: "List", onClick: () => {}, current: true },
        ]}
      />
    )

    const nav = screen.getByRole("navigation", { name: /breadcrumb/i })
    expect(
      within(nav)
        .getAllByRole("button")
        .map((crumb) => crumb.textContent)
    ).toEqual(["Web", "Issues", "List"])
    expect(within(nav).getAllByText("›")).toHaveLength(2)
  })

  test("every crumb is a button that navigates on click", async () => {
    const user = userEvent.setup()
    const openProject = vi.fn()
    const openIssues = vi.fn()
    render(
      <Breadcrumb
        items={[
          { label: "Web", onClick: openProject },
          { label: "Issues", onClick: openIssues },
        ]}
      />
    )

    await user.click(screen.getByRole("button", { name: "Web" }))
    await user.click(screen.getByRole("button", { name: "Issues" }))

    expect(openProject).toHaveBeenCalledTimes(1)
    expect(openIssues).toHaveBeenCalledTimes(1)
  })

  test("the current page stays clickable and marked as current", async () => {
    const user = userEvent.setup()
    const reopen = vi.fn()
    render(
      <Breadcrumb
        items={[
          { label: "Web", onClick: () => {} },
          { label: "Issues", onClick: () => {} },
          { label: "WEB-123", onClick: reopen, mono: true, current: true },
        ]}
      />
    )

    const current = screen.getByRole("button", { name: "WEB-123" })
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current).toHaveClass("font-mono")

    await user.click(current)
    expect(reopen).toHaveBeenCalledTimes(1)
  })
})
