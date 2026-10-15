import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Issue, Status } from "@/lib/api"
import { IssueList } from "./issue-list.js"

const statuses: Status[] = [
  {
    id: "st-1",
    projectId: "pr-1",
    name: "Backlog",
    category: "Backlog",
    position: 0,
  },
  {
    id: "st-2",
    projectId: "pr-1",
    name: "Shipped",
    category: "Completed",
    position: 1,
  },
  {
    id: "st-3",
    projectId: "pr-1",
    name: "In Review",
    category: "In Progress",
    position: 2,
  },
]

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
  {
    id: "is-3",
    projectId: "pr-1",
    number: 3,
    keyPrefix: "WEB",
    identifier: "WEB-3",
    title: "Review API",
    description: null,
    statusId: "st-3",
    priority: "Medium",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
  },
]

describe("issue list", () => {
  test("renders every issue with identifier, title and priority", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )

    expect(screen.getByText("WEB-1")).toBeInTheDocument()
    expect(screen.getByText("Fix login")).toBeInTheDocument()
    expect(screen.getByText("WEB-2")).toBeInTheDocument()
    expect(screen.getByText("High")).toBeInTheDocument()
  })

  test("shows an empty state without issues", () => {
    render(
      <IssueList
        issues={[]}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )
    expect(screen.getByText(/no issues match/i)).toBeInTheDocument()
  })

  test("changing the status calls through with the issue and new status", async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={onStatusChange}
      />
    )

    const row = screen.getByTestId("issue-WEB-1")
    await user.selectOptions(
      within(row).getByLabelText(/status for WEB-1/i),
      "st-2"
    )

    expect(onStatusChange).toHaveBeenCalledWith(issues[0], "st-2")
  })

  test("hides status controls from read-only viewers", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={false}
        onStatusChange={() => {}}
      />
    )
    expect(screen.queryByLabelText(/status for WEB-1/i)).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId("issue-WEB-1")).getByText("Backlog")
    ).toBeInTheDocument()
  })

  test("renders label names on the row", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )
    const row = screen.getByTestId("issue-WEB-2")
    expect(within(row).getByText("feature")).toBeInTheDocument()
  })

  test("renders per-row actions when provided", async () => {
    const user = userEvent.setup()
    const onArchive = vi.fn()
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        actions={(issue) => (
          <button type="button" onClick={() => onArchive(issue.identifier)}>
            Archive {issue.identifier}
          </button>
        )}
      />
    )

    await user.click(screen.getByRole("button", { name: "Archive WEB-1" }))
    expect(onArchive).toHaveBeenCalledWith("WEB-1")
  })

  test("renders no actions by default", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )
    expect(
      screen.queryByRole("button", { name: /archive/i })
    ).not.toBeInTheDocument()
  })

  test("renders all six category groups in roster order", () => {
    const sixStatuses: Status[] = [
      "Backlog",
      "Unstarted",
      "In Progress",
      "Completed",
      "Canceled",
      "Duplicate",
    ].map((category, index) => ({
      id: `six-${index}`,
      projectId: "pr-1",
      name: category,
      category: category as Status["category"],
      position: index,
    }))
    // Deliberately out of roster order: grouping, not input order, sets the
    // heading order.
    const sixIssues: Issue[] = [...sixStatuses].reverse().map((status, i) => ({
      id: `six-issue-${i}`,
      projectId: "pr-1",
      number: i + 1,
      keyPrefix: "WEB",
      identifier: `WEB-6${i}`,
      title: `Issue in ${status.category}`,
      description: null,
      statusId: status.id,
      priority: "None",
      assigneeId: null,
      dueDate: null,
      archived: false,
      labels: [],
    }))

    render(
      <IssueList
        issues={sixIssues}
        statuses={sixStatuses}
        canEdit={false}
        onStatusChange={() => {}}
      />
    )

    const headings = screen.getAllByRole("heading").map((el) => el.textContent)
    expect(headings).toEqual([
      "Backlog",
      "Unstarted",
      "In Progress",
      "Completed",
      "Canceled",
      "Duplicate",
    ])

    const duplicate = screen.getByTestId("issue-WEB-60").closest("section")
    expect(
      within(duplicate as HTMLElement).getByRole("heading", {
        name: "Duplicate",
      })
    ).toBeInTheDocument()
  })

  test("filtered-out issues take their empty groups with them", () => {
    render(
      <IssueList
        issues={[issues[0]]}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )

    expect(screen.getByRole("heading", { name: "Backlog" })).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "In Progress" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Completed" })
    ).not.toBeInTheDocument()
  })

  test("renders the registry color as a swatch on label chips", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        labels={[
          {
            id: "lb-1",
            workspaceId: "ws-1",
            name: "feature",
            color: "#22c55e",
          },
        ]}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )
    const row = screen.getByTestId("issue-WEB-2")
    const swatch = within(row).getByTestId("label-dot-feature")
    expect(swatch).toBeInTheDocument()
    expect(swatch).toHaveStyle({ backgroundColor: "#22c55e" })
  })
})
