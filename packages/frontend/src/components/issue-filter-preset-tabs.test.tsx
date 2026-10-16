import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Status } from "@/lib/api"
import { activeStatusIds, backlogStatusIds } from "@/lib/issue-filter-presets"
import { IssueFilterPresetTabs } from "./issue-filter-preset-tabs.js"

const statuses: Status[] = [
  {
    id: "st-backlog",
    projectId: "pr-1",
    name: "Backlog",
    category: "Backlog",
    color: "#bec2c8",
    position: 0,
  },
  {
    id: "st-todo",
    projectId: "pr-1",
    name: "Todo",
    category: "Unstarted",
    color: "#e2e2e2",
    position: 1,
  },
  {
    id: "st-progress",
    projectId: "pr-1",
    name: "In Progress",
    category: "In Progress",
    color: "#f2c94c",
    position: 2,
  },
  {
    id: "st-done",
    projectId: "pr-1",
    name: "Done",
    category: "Completed",
    color: "#5e6ad2",
    position: 3,
  },
  {
    id: "st-canceled",
    projectId: "pr-1",
    name: "Canceled",
    category: "Canceled",
    color: "#95a2b3",
    position: 4,
  },
  {
    id: "st-duplicate",
    projectId: "pr-1",
    name: "Duplicate",
    category: "Duplicate",
    color: "#95a2b3",
    position: 5,
  },
]

function renderTabs(value: string[], onChange = vi.fn()) {
  render(
    <IssueFilterPresetTabs
      statuses={statuses}
      value={value}
      onChange={onChange}
    />
  )
  return onChange
}

describe("issue filter preset tabs", () => {
  test("offers Active, Backlog, and All Issues", () => {
    renderTabs(activeStatusIds(statuses))

    const row = screen.getByRole("tablist", { name: /filter presets/i })
    expect(row.querySelectorAll('[role="tab"]').length).toBe(3)
    for (const label of ["Active", "Backlog", "All Issues"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument()
    }
  })

  test("Active is selected when the query carries the open categories", () => {
    renderTabs(activeStatusIds(statuses))

    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("tab", { name: "Backlog" })).toHaveAttribute(
      "aria-selected",
      "false"
    )
    expect(screen.getByRole("tab", { name: "All Issues" })).toHaveAttribute(
      "aria-selected",
      "false"
    )
  })

  test("Backlog narrows the query to the Backlog category", async () => {
    const user = userEvent.setup()
    const onChange = renderTabs(activeStatusIds(statuses))

    await user.click(screen.getByRole("tab", { name: "Backlog" }))

    expect(onChange).toHaveBeenCalledWith(backlogStatusIds(statuses))
  })

  test("All Issues drops every status constraint", async () => {
    const user = userEvent.setup()
    const onChange = renderTabs(backlogStatusIds(statuses))

    await user.click(screen.getByRole("tab", { name: "All Issues" }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  test("a hand-narrowed selection belongs to no preset", () => {
    renderTabs(["st-done"])

    for (const label of ["Active", "Backlog", "All Issues"]) {
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute(
        "aria-selected",
        "false"
      )
    }
  })

  test("re-selecting the current preset changes nothing", async () => {
    const user = userEvent.setup()
    const onChange = renderTabs(backlogStatusIds(statuses))

    await user.click(screen.getByRole("tab", { name: "Backlog" }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
