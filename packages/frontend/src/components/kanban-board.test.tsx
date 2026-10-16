import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { describe, expect, test, vi } from "vitest"
import type { Issue, Status } from "@/lib/api"

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
    labels: [],
  },
]

let capturedDragEnd:
  | ((event: { active: { id: string }; over: { id: string } | null }) => void)
  | null = null

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>()
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode
      onDragEnd?: (event: {
        active: { id: string }
        over: { id: string } | null
      }) => void
    }) => {
      capturedDragEnd = onDragEnd ?? null
      return <>{children}</>
    },
  }
})

const { KanbanBoard, resolveKanbanDrop } = await import("./kanban-board.js")

const members = [{ userId: "user-member" }, { userId: "user-owner" }]

function setup(
  onMove: (issue: Issue, statusId: string) => void = () => {},
  onAssign: (issue: Issue, assigneeId: string | null) => void = () => {}
) {
  capturedDragEnd = null
  return render(
    <KanbanBoard
      issues={issues}
      statuses={statuses}
      members={members}
      canEdit={true}
      onMove={onMove}
      onAssign={onAssign}
    />
  )
}

describe("resolveKanbanDrop", () => {
  test("dropping a card on a column targets that status", () => {
    expect(resolveKanbanDrop("is-1", "st-2", issues, statuses)).toEqual({
      issue: issues[0],
      toStatusId: "st-2",
    })
  })

  test("dropping a card on another card targets its column", () => {
    expect(resolveKanbanDrop("is-1", "is-2", issues, statuses)).toEqual({
      issue: issues[0],
      toStatusId: "st-2",
    })
  })

  test("drops outside a column or onto the same column resolve to null", () => {
    expect(resolveKanbanDrop("is-1", null, issues, statuses)).toBeNull()
    expect(resolveKanbanDrop("is-1", "st-1", issues, statuses)).toBeNull()
    expect(resolveKanbanDrop("nope", "st-2", issues, statuses)).toBeNull()
    expect(resolveKanbanDrop("is-1", "nope", issues, statuses)).toBeNull()
  })
})

describe("kanban board", () => {
  test("renders one column per status with its cards", () => {
    setup()

    const backlog = screen.getByTestId("kanban-column-st-1")
    const shipped = screen.getByTestId("kanban-column-st-2")
    expect(within(backlog).getByText("Fix login")).toBeInTheDocument()
    expect(within(shipped).getByText("Ship homepage")).toBeInTheDocument()
    expect(within(backlog).queryByText("Ship homepage")).not.toBeInTheDocument()
    // Column headers carry the status mark in its color.
    const header = within(backlog).getByRole("heading", { name: /backlog/i })
    expect(within(header).getByTestId("status-icon-Backlog")).toHaveStyle({
      color: "#bec2c8",
    })
  })

  test("lanes stretch full height with tight gutters", () => {
    setup()

    const column = screen.getByTestId("kanban-column-st-1")
    expect(column.className).toContain("overflow-y-auto")
    const lanes = column.parentElement as HTMLElement
    expect(lanes.className).toContain("items-stretch")
    expect(lanes.className).toContain("gap-2")
    expect(lanes.className).toContain("calc(100svh-5rem)")
  })

  test("a drop on another column moves the card", () => {
    const onMove = vi.fn()
    setup(onMove)

    act(() => {
      capturedDragEnd?.({ active: { id: "is-1" }, over: { id: "st-2" } })
    })

    expect(onMove).toHaveBeenCalledWith(issues[0], "st-2")
  })

  test("a drop on the same column moves nothing", () => {
    const onMove = vi.fn()
    setup(onMove)

    act(() => {
      capturedDragEnd?.({ active: { id: "is-1" }, over: { id: "st-1" } })
    })

    expect(onMove).not.toHaveBeenCalled()
  })

  test("the status pill menu calls through with the new status", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    setup(onMove)

    await user.click(
      screen.getByRole("button", { name: /move WEB-1 to status/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(onMove).toHaveBeenCalledWith(issues[0], "st-2")
  })

  test("read-only viewers get no drag handles or move controls", () => {
    render(
      <KanbanBoard
        issues={issues}
        statuses={statuses}
        canEdit={false}
        onMove={() => {}}
      />
    )

    expect(
      screen.queryByRole("button", { name: /move WEB-1 to status/i })
    ).not.toBeInTheDocument()
    expect(screen.getByText("Fix login")).toBeInTheDocument()
    // Static mark and name instead of the pill.
    expect(
      within(screen.getByTestId("kanban-card-WEB-1")).getByTestId(
        "status-icon-Backlog"
      )
    ).toBeInTheDocument()
  })

  test("shows an empty state without issues", () => {
    render(
      <KanbanBoard
        issues={[]}
        statuses={statuses}
        canEdit={true}
        onMove={() => {}}
      />
    )
    expect(screen.getByText(/no issues match/i)).toBeInTheDocument()
  })

  test("cards show the status mark, assignee, and due row", () => {
    const dated: Issue = {
      ...issues[1],
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }
    render(
      <KanbanBoard
        issues={[issues[0], dated]}
        statuses={statuses}
        canEdit={true}
        onMove={() => {}}
      />
    )
    const card = screen.getByTestId("kanban-card-WEB-2")
    // Status pill carries the mark in the status color.
    const pill = within(card).getByRole("button", {
      name: /move WEB-2 to status/i,
    })
    expect(within(pill).getByTestId("status-icon-Shipped")).toHaveStyle({
      color: "#5e6ad2",
    })
    // Assignee avatar, and no description/priority filler lines.
    expect(within(card).getByTitle("user-member")).toBeInTheDocument()
    expect(
      within(card).queryByText("No description yet.")
    ).not.toBeInTheDocument()
    // Overdue due row reads red.
    const due = within(card).getByText("1d overdue")
    expect(due).toBeInTheDocument()
    expect(due).toHaveClass("text-destructive")

    const plain = screen.getByTestId("kanban-card-WEB-1")
    expect(within(plain).queryByText("1d overdue")).not.toBeInTheDocument()
  })

  test("assigned cards show an avatar that quick-assigns from a menu", async () => {
    const user = userEvent.setup()
    const onAssign = vi.fn()
    setup(() => {}, onAssign)

    await user.click(
      screen.getByRole("button", { name: /assignee for WEB-2/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "user-owner" }))

    expect(onAssign).toHaveBeenCalledWith(issues[1], "user-owner")
  })

  test("unassigned cards show a ghost avatar with unassign marked", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(
      screen.getByRole("button", { name: /assignee for WEB-1/i })
    )
    expect(
      screen.getByRole("menuitemradio", { name: "Unassigned" })
    ).toHaveAttribute("aria-checked", "true")
  })

  test("card titles open the detail view when wired", async () => {
    const user = userEvent.setup()
    const onOpenDetail = vi.fn()
    render(
      <KanbanBoard
        issues={issues}
        statuses={statuses}
        members={members}
        canEdit={true}
        onMove={() => {}}
        onAssign={() => {}}
        onOpenDetail={onOpenDetail}
      />
    )

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )
    expect(onOpenDetail).toHaveBeenCalledWith(issues[0])
  })

  test("cards render the registry color as a swatch on label chips", () => {
    const labeled: Issue[] = [{ ...issues[0], labels: ["bug"] }]
    render(
      <KanbanBoard
        issues={labeled}
        statuses={statuses}
        labels={[
          { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
        ]}
        canEdit={true}
        onMove={() => {}}
      />
    )
    const card = screen.getByTestId("kanban-card-WEB-1")
    expect(within(card).getByText("bug")).toBeInTheDocument()
    expect(within(card).getByTestId("label-dot-bug")).toHaveStyle({
      backgroundColor: "#ef4444",
    })
  })
})
