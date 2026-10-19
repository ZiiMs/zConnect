import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Issue, Status } from "@/lib/api"
import { IssueTable } from "./issue-table.js"

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

const issues: Issue[] = [
  {
    id: "is-1",
    projectId: "pr-1",
    number: 1,
    keyPrefix: "WEB",
    identifier: "WEB-1",
    title: "Fix login",
    description: null,
    statusId: "st-1",
    priority: "High",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
  },
  {
    id: "is-2",
    projectId: "pr-1",
    number: 2,
    keyPrefix: "WEB",
    identifier: "WEB-2",
    title: "Ship homepage",
    description: null,
    statusId: "st-2",
    priority: "Low",
    assigneeId: "user-member",
    dueDate: null,
    archived: false,
    labels: ["feature"],
  },
]

function setup(
  canEdit = true,
  onUpdate: (issue: Issue, input: object) => void = () => {}
) {
  return render(
    <IssueTable
      issues={issues}
      statuses={statuses}
      members={members}
      canEdit={canEdit}
      onUpdate={onUpdate}
    />
  )
}

describe("issue table", () => {
  test("renders one row per issue with identifier and title", () => {
    setup()

    expect(screen.getByText("WEB-1")).toBeInTheDocument()
    expect(screen.getByLabelText(/title for WEB-2/i)).toHaveValue(
      "Ship homepage"
    )
    expect(screen.getAllByRole("row")).toHaveLength(3)
  })

  test("work items merge the key and title under one header", () => {
    setup()

    expect(
      screen.getByRole("columnheader", { name: "Work items" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("columnheader", { name: "Title" })
    ).not.toBeInTheDocument()
    const row = screen.getByTestId("issue-row-WEB-1")
    expect(within(row).getByText("WEB-1")).toBeInTheDocument()
    expect(within(row).getByDisplayValue("Fix login")).toBeInTheDocument()
  })

  test("state cells show the status mark in its color next to the name", () => {
    setup(false)

    const row = screen.getByTestId("issue-row-WEB-1")
    expect(within(row).getByTestId("status-icon-Backlog")).toHaveStyle({
      color: "#bec2c8",
    })
    expect(within(row).getByText("Backlog")).toBeInTheDocument()
  })

  test("due dates read formatted for viewers", () => {
    render(
      <IssueTable
        issues={[{ ...issues[0], dueDate: "2026-10-14T00:00:00.000Z" }]}
        statuses={statuses}
        members={members}
        canEdit={false}
        onUpdate={() => {}}
      />
    )
    const row = screen.getByTestId("issue-row-WEB-1")
    expect(within(row).getByText("Oct 14, 2026")).toBeInTheDocument()
  })

  test("shows an empty state without issues", () => {
    render(
      <IssueTable
        issues={[]}
        statuses={statuses}
        members={members}
        canEdit={true}
        onUpdate={() => {}}
      />
    )
    expect(screen.getByText(/no issues match/i)).toBeInTheDocument()
  })

  test("editing the status cell calls through with the new status", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    setup(true, onUpdate)

    const row = screen.getByTestId("issue-row-WEB-1")
    await user.click(
      within(row).getByRole("button", { name: /status for WEB-1/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(onUpdate).toHaveBeenCalledWith(issues[0], { statusId: "st-2" })
  })

  test("editing the priority cell calls through with the new priority", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    setup(true, onUpdate)

    const row = screen.getByTestId("issue-row-WEB-1")
    await user.click(
      within(row).getByRole("button", { name: /priority for WEB-1/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Urgent" }))

    expect(onUpdate).toHaveBeenCalledWith(issues[0], { priority: "Urgent" })
  })

  test("editing the assignee cell calls through with the new assignee", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    setup(true, onUpdate)

    const row = screen.getByTestId("issue-row-WEB-2")
    await user.click(
      within(row).getByRole("button", { name: /assignee for WEB-2/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "user-owner" }))

    expect(onUpdate).toHaveBeenCalledWith(issues[1], {
      assigneeId: "user-owner",
    })
  })

  test("unassigning from the assignee cell sends null", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    setup(true, onUpdate)

    const row = screen.getByTestId("issue-row-WEB-2")
    await user.click(
      within(row).getByRole("button", { name: /assignee for WEB-2/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Unassigned" }))

    expect(onUpdate).toHaveBeenCalledWith(issues[1], { assigneeId: null })
  })

  test("hides cell controls from read-only viewers", () => {
    setup(false)

    expect(screen.queryByLabelText(/status for WEB-1/i)).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText(/priority for WEB-1/i)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText(/assignee for WEB-1/i)
    ).not.toBeInTheDocument()
    expect(screen.getByText("Backlog")).toBeInTheDocument()
  })

  test("editing the title cell calls through with the new title", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    setup(true, onUpdate)

    const row = screen.getByTestId("issue-row-WEB-1")
    const input = within(row).getByLabelText(/title for WEB-1/i)
    await user.clear(input)
    await user.type(input, "Fix login faster")
    await user.tab()

    expect(onUpdate).toHaveBeenCalledWith(issues[0], {
      title: "Fix login faster",
    })
  })

  test("editing the due date cell calls through with the new date", async () => {
    const onUpdate = vi.fn()
    setup(true, onUpdate)

    const row = screen.getByTestId("issue-row-WEB-1")
    const input = within(row).getByLabelText(/due date for WEB-1/i)
    fireEvent.change(input, { target: { value: "2026-11-01" } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith(issues[0], {
      dueDate: "2026-11-01",
    })
  })

  test("clearing the due date cell sends null", async () => {
    const dated: Issue = { ...issues[0], dueDate: "2026-10-01" }
    const onUpdate = vi.fn()
    render(
      <IssueTable
        issues={[dated]}
        statuses={statuses}
        members={members}
        canEdit={true}
        onUpdate={onUpdate}
      />
    )

    const row = screen.getByTestId("issue-row-WEB-1")
    const input = within(row).getByLabelText(/due date for WEB-1/i)
    expect(input).toHaveValue("2026-10-01")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith(dated, { dueDate: null })
  })

  test("column toggles hide and reshow optional columns", async () => {
    const user = userEvent.setup()
    setup()

    expect(screen.getByLabelText(/due date for WEB-1/i)).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Due date" }))

    expect(
      screen.queryByLabelText(/due date for WEB-1/i)
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(/title for WEB-1/i)).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox", { name: "Due date" }))
    expect(screen.getByLabelText(/due date for WEB-1/i)).toBeInTheDocument()
  })

  test("renders the registry color as a swatch on label chips", () => {
    render(
      <IssueTable
        issues={issues}
        statuses={statuses}
        members={members}
        labels={[
          {
            id: "lb-1",
            workspaceId: "ws-1",
            name: "feature",
            color: "#22c55e",
          },
        ]}
        canEdit={true}
        onUpdate={() => {}}
      />
    )
    const row = screen.getByTestId("issue-row-WEB-2")
    const swatch = within(row).getByTestId("label-dot-feature")
    expect(swatch).toBeInTheDocument()
    expect(swatch).toHaveStyle({ backgroundColor: "#22c55e" })
  })

  test("title opens the detail view when wired instead of editing", async () => {
    const user = userEvent.setup()
    const onOpenDetail = vi.fn()
    render(
      <IssueTable
        issues={issues}
        statuses={statuses}
        members={members}
        canEdit={true}
        onUpdate={() => {}}
        onOpenDetail={onOpenDetail}
      />
    )

    const row = screen.getByTestId("issue-row-WEB-1")
    await user.click(
      within(row).getByRole("button", { name: /open detail for WEB-1/i })
    )
    expect(onOpenDetail).toHaveBeenCalledWith(issues[0])
    expect(
      within(row).queryByRole("textbox", { name: /title for WEB-1/i })
    ).not.toBeInTheDocument()
  })

  test("pencil toggles the inline title editor when detail is wired", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <IssueTable
        issues={issues}
        statuses={statuses}
        members={members}
        canEdit={true}
        onUpdate={onUpdate}
        onOpenDetail={() => {}}
      />
    )

    const row = screen.getByTestId("issue-row-WEB-1")
    await user.click(
      within(row).getByRole("button", { name: /edit title for WEB-1/i })
    )
    const input = within(row).getByLabelText(/title for WEB-1/i)
    await user.clear(input)
    await user.type(input, "Fix login faster")
    await user.tab()

    expect(onUpdate).toHaveBeenCalledWith(issues[0], {
      title: "Fix login faster",
    })
  })
})
