import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { describe, expect, test, vi } from "vitest"
import type { Status } from "@/lib/api"
import {
  emptyIssueFilters,
  IssueFilterBar,
  type IssueFilterValue,
  loadIssueFilters,
  saveIssueFilters,
} from "./issue-filter-bar.js"

const statuses: Status[] = [
  {
    id: "st-1",
    projectId: "pr-1",
    name: "Backlog",
    category: "Backlog",
    color: "#bec2c8",
    position: 0,
  },
  {
    id: "st-2",
    projectId: "pr-1",
    name: "Shipped",
    category: "Completed",
    color: "#5e6ad2",
    position: 1,
  },
]

const members = [{ userId: "user-member" }, { userId: "user-owner" }]

function renderBar(
  value: IssueFilterValue = emptyIssueFilters(),
  onChange: (value: IssueFilterValue) => void = () => {}
) {
  return render(
    <IssueFilterBar
      statuses={statuses}
      members={members}
      value={value}
      onChange={onChange}
    />
  )
}

describe("issue filter bar", () => {
  test("renders status, priority, assignee and text controls", () => {
    renderBar()
    expect(screen.getByLabelText(/search issues/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Backlog" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Urgent" })).toBeInTheDocument()
  })

  test("toggling a status notifies with the narrowed value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderBar(emptyIssueFilters(), onChange)

    await user.click(screen.getByRole("button", { name: "Backlog" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ statusIds: ["st-1"] })
    )
  })

  test("toggling a priority notifies with the narrowed value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderBar(emptyIssueFilters(), onChange)

    await user.click(screen.getByRole("button", { name: "High" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ priorities: ["High"] })
    )
  })

  test("typing text notifies with the search value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    function StatefulBar() {
      const [value, setValue] = React.useState(emptyIssueFilters())
      return (
        <IssueFilterBar
          statuses={statuses}
          members={members}
          value={value}
          onChange={(next) => {
            setValue(next)
            onChange(next)
          }}
        />
      )
    }
    render(<StatefulBar />)

    await user.type(screen.getByLabelText(/search issues/i), "fix")

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "fix" })
    )
  })

  test("picking an assignee notifies with the member", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderBar(emptyIssueFilters(), onChange)

    await user.selectOptions(screen.getByLabelText(/assignee/i), "user-member")

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: "user-member" })
    )
  })

  test("pressed state reflects the current value", () => {
    renderBar({
      ...emptyIssueFilters(),
      statusIds: ["st-1"],
      priorities: ["Urgent"],
      text: "fix",
    })
    expect(screen.getByRole("button", { name: "Backlog" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Shipped" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    expect(screen.getByRole("button", { name: "Urgent" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByLabelText(/search issues/i)).toHaveValue("fix")
  })

  test("visible statuses highlight, hidden ones fade", () => {
    renderBar({ ...emptyIssueFilters(), statusIds: ["st-1"] })
    const selected = screen.getByRole("button", { name: "Backlog" })
    const unselected = screen.getByRole("button", { name: "Shipped" })
    expect(selected).toHaveAttribute("aria-pressed", "true")
    expect(unselected).toHaveAttribute("aria-pressed", "false")
    // Visibility cue: accent pill when visible, faded when hidden.
    // No ring outline, no inline color wash either way.
    expect(selected.getAttribute("style")).toBeNull()
    expect(unselected.getAttribute("style")).toBeNull()
    expect(selected.className).toContain("font-medium")
    expect(selected.className).toContain("bg-accent")
    expect(selected.className).not.toContain("border-ring")
    expect(selected.className).not.toContain("opacity-50")
    expect(unselected.className).toContain("text-muted-foreground")
    expect(unselected.className).toContain("opacity-50")
    expect(unselected.className).not.toContain("font-medium")
    // The status mark matches everywhere else (category icon in status color).
    expect(
      within(selected).getByTestId("status-icon-Backlog")
    ).toBeInTheDocument()
  })
})

describe("filter persistence", () => {
  test("round-trips per user per project through localStorage", () => {
    const value: IssueFilterValue = {
      ...emptyIssueFilters(),
      statusIds: ["st-1"],
      text: "fix",
    }
    saveIssueFilters("user-a", "pr-1", value)
    expect(loadIssueFilters("user-a", "pr-1")).toEqual(value)
  })

  test("keys are scoped: another user or project sees nothing", () => {
    saveIssueFilters("user-a", "pr-1", {
      ...emptyIssueFilters(),
      text: "fix",
    })
    expect(loadIssueFilters("user-b", "pr-1")).toBeNull()
    expect(loadIssueFilters("user-a", "pr-2")).toBeNull()
  })

  test("corrupt stored JSON loads as nothing", () => {
    localStorage.setItem("zconnect:issue-filters:user-a:pr-1", "not-json{{{")
    expect(loadIssueFilters("user-a", "pr-1")).toBeNull()
  })

  test("view prefs round-trip and fall back to defaults when unknown", () => {
    const value: IssueFilterValue = {
      ...emptyIssueFilters(),
      groupBy: "priority",
      order: "newest",
      showEmptyGroups: true,
      display: {
        id: true,
        status: false,
        priority: true,
        assignee: false,
        due: false,
        labels: false,
      },
    }
    saveIssueFilters("user-a", "pr-1", value)
    expect(loadIssueFilters("user-a", "pr-1")).toEqual(value)

    localStorage.setItem(
      "zconnect:issue-filters:user-a:pr-1",
      JSON.stringify({ groupBy: "nope", order: "random", display: null })
    )
    expect(loadIssueFilters("user-a", "pr-1")).toEqual(emptyIssueFilters())
  })
})

describe("label filters", () => {
  const registry = [
    { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
    { id: "lb-2", workspaceId: "ws-1", name: "feature", color: "#22c55e" },
  ]

  function renderWithLabels(
    value: IssueFilterValue = emptyIssueFilters(),
    onChange: (value: IssueFilterValue) => void = () => {}
  ) {
    return render(
      <IssueFilterBar
        statuses={statuses}
        members={members}
        labels={registry}
        value={value}
        onChange={onChange}
      />
    )
  }

  test("renders registry labels with colors in the filter bar", () => {
    renderWithLabels()
    expect(screen.getByRole("checkbox", { name: "bug" })).toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", { name: "feature" })
    ).toBeInTheDocument()
    expect(screen.getByTestId("label-dot-bug")).toHaveStyle({
      backgroundColor: "#ef4444",
    })
    expect(screen.getByTestId("label-dot-feature")).toHaveStyle({
      backgroundColor: "#22c55e",
    })
  })

  test("toggling a label notifies with the narrowed value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithLabels(emptyIssueFilters(), onChange)

    await user.click(screen.getByRole("checkbox", { name: "bug" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ["bug"] })
    )
  })

  test("label choices persist per user per project", () => {
    const value: IssueFilterValue = {
      ...emptyIssueFilters(),
      labels: ["bug"],
    }
    saveIssueFilters("user-a", "pr-1", value)
    expect(loadIssueFilters("user-a", "pr-1")).toEqual(value)
  })
})
