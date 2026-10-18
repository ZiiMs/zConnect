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
  {
    id: "st-3",
    projectId: "pr-1",
    name: "In Review",
    category: "In Progress",
    color: "#0f783c",
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
  test("renders rows with key, mark, title, avatar and labels", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )

    const row = screen.getByTestId("issue-WEB-2")
    expect(within(row).getByText("WEB-2")).toBeInTheDocument()
    expect(within(row).getByText("Ship homepage")).toBeInTheDocument()
    expect(within(row).getByTestId("status-icon-Shipped")).toBeInTheDocument()
    expect(within(row).getByTestId("assignee-user-member")).toBeInTheDocument()
    // Priority moved to the Table/Detail views; the row stays dense.
    expect(screen.queryByText("High")).not.toBeInTheDocument()
    expect(screen.queryByText("Low")).not.toBeInTheDocument()
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

    await user.click(screen.getByRole("button", { name: /status for WEB-1/i }))
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

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
      within(screen.getByTestId("issue-WEB-1")).getByTestId(
        "status-icon-Backlog"
      )
    ).toBeInTheDocument()
    // No far-right status text: the mark carries the status via title/tooltip.
    expect(
      within(screen.getByTestId("issue-WEB-1")).queryByText("Backlog")
    ).not.toBeInTheDocument()
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

  test("renders one collapsible group per status in position order", () => {
    const ordered: Status[] = [
      "Backlog",
      "Unstarted",
      "In Progress",
      "Completed",
      "Canceled",
      "Duplicate",
    ].map((name, index) => ({
      id: `six-${index}`,
      projectId: "pr-1",
      name,
      category: "Backlog" as Status["category"],
      color: "#94a3b8",
      position: index,
    }))
    // Deliberately out of position order: grouping, not input order, sets
    // the section order.
    const shuffled = [...ordered].reverse()
    const sixIssues: Issue[] = ordered.map((status, i) => ({
      id: `six-issue-${i}`,
      projectId: "pr-1",
      number: i + 1,
      keyPrefix: "WEB",
      identifier: `WEB-6${i}`,
      title: `Issue in ${status.name}`,
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
        statuses={shuffled}
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

    const duplicate = screen.getByTestId("issue-WEB-65").closest("section")
    expect(
      within(duplicate as HTMLElement).getByRole("heading", {
        name: "Duplicate",
      })
    ).toBeInTheDocument()
  })

  test("collapsing a group hides its rows", async () => {
    const user = userEvent.setup()
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )

    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: /collapse backlog issues/i })
    )

    expect(screen.queryByTestId("issue-WEB-1")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: /expand backlog issues/i })
    )
    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
  })

  test("clicking anywhere on the header collapses the group", async () => {
    const user = userEvent.setup()
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )

    await user.click(screen.getByRole("heading", { name: "Backlog" }))
    expect(screen.queryByTestId("issue-WEB-1")).not.toBeInTheDocument()

    await user.click(screen.getByRole("heading", { name: "Backlog" }))
    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
  })

  test("group headers wash in the status color", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
      />
    )

    const header = screen
      .getByRole("heading", { name: "Backlog" })
      .closest("header")
    expect(header).toHaveStyle({
      backgroundImage:
        "linear-gradient(90deg, color-mix(in oklch, #bec2c8 24%, transparent), transparent 75%)",
    })
  })

  test("titles open the detail view when wired", async () => {
    const user = userEvent.setup()
    const onOpenDetail = vi.fn()
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        onOpenDetail={onOpenDetail}
      />
    )

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )
    expect(onOpenDetail).toHaveBeenCalledWith(issues[0])
  })

  test("the group quick-add reports its status", async () => {
    const user = userEvent.setup()
    const onAddIssue = vi.fn()
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        onAddIssue={onAddIssue}
      />
    )

    await user.click(
      screen.getByRole("button", { name: /add issue to backlog/i })
    )
    expect(onAddIssue).toHaveBeenCalledWith("st-1")
    // The quick-add sits above the header toggle: rows stay visible.
    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
  })

  test("priority lanes follow urgency order", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        groupBy="priority"
      />
    )

    const headings = screen.getAllByRole("heading").map((el) => el.textContent)
    expect(headings).toEqual(["High", "Medium", "Low"])
  })

  test("assignee lanes put known members first and Unassigned last", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        members={[{ userId: "user-member" }, { userId: "user-owner" }]}
        canEdit={true}
        onStatusChange={() => {}}
        groupBy="assignee"
      />
    )

    const headings = screen.getAllByRole("heading").map((el) => el.textContent)
    expect(headings).toEqual(["user-member", "Unassigned"])
    const lane = screen
      .getByTestId("issue-WEB-2")
      .closest("section") as HTMLElement
    expect(
      within(lane).getByRole("heading", { name: "user-member" })
    ).toBeInTheDocument()
  })

  test("no grouping renders one flat list without headers", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        groupBy="none"
      />
    )

    expect(screen.queryByRole("heading")).not.toBeInTheDocument()
    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
    expect(screen.getByTestId("issue-WEB-2")).toBeInTheDocument()
    expect(screen.getByTestId("issue-WEB-3")).toBeInTheDocument()
  })

  test("newest ordering reverses rows inside each lane", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        groupBy="none"
        order="newest"
      />
    )

    const rows = screen
      .getAllByTestId(/^issue-WEB-/, { exact: false })
      .map((el) => el.getAttribute("data-testid"))
    expect(rows).toEqual(["issue-WEB-3", "issue-WEB-2", "issue-WEB-1"])
  })

  test("empty groups show when enabled", () => {
    render(
      <IssueList
        issues={[issues[0]]}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        showEmptyGroups
      />
    )

    const headings = screen.getAllByRole("heading").map((el) => el.textContent)
    expect(headings).toEqual(["Backlog", "Shipped", "In Review"])
  })

  test("display flags hide row elements", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        display={{
          id: false,
          status: false,
          priority: false,
          assignee: false,
          due: false,
          labels: false,
        }}
      />
    )

    const row = screen.getByTestId("issue-WEB-2")
    expect(within(row).queryByText("WEB-2")).not.toBeInTheDocument()
    expect(within(row).queryByText("feature")).not.toBeInTheDocument()
    expect(
      within(row).queryByTestId("assignee-user-member")
    ).not.toBeInTheDocument()
    expect(
      within(row).queryByTestId("status-icon-Shipped")
    ).not.toBeInTheDocument()
    expect(within(row).getByText("Ship homepage")).toBeInTheDocument()
  })

  test("priority shows as an icon left of the slug without text", () => {
    render(
      <IssueList
        issues={issues}
        statuses={statuses}
        canEdit={true}
        onStatusChange={() => {}}
        display={{
          id: true,
          status: true,
          priority: true,
          assignee: true,
          due: true,
          labels: true,
        }}
      />
    )

    const row = screen.getByTestId("issue-WEB-2")
    // Icon-only mark carries the priority via its accessible name.
    expect(
      within(row).getByRole("img", { name: /priority for WEB-2: low/i })
    ).toBeInTheDocument()
    expect(within(row).queryByText("Low")).not.toBeInTheDocument()
    // Priority sits before the slug in DOM order.
    const rowText = within(row).getByText("WEB-2")
    const mark = within(row).getByRole("img", {
      name: /priority for WEB-2/i,
    })
    expect(
      mark.compareDocumentPosition(rowText) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
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
