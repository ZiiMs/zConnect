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
    category: "Todo",
    position: 0,
  },
  {
    id: "st-2",
    projectId: "pr-1",
    name: "Shipped",
    category: "Done",
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

function setup(onMove: (issue: Issue, statusId: string) => void = () => {}) {
  capturedDragEnd = null
  return render(
    <KanbanBoard
      issues={issues}
      statuses={statuses}
      canEdit={true}
      onMove={onMove}
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

  test("the keyboard move control calls through with the new status", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    setup(onMove)

    await user.selectOptions(
      screen.getByLabelText(/move WEB-1 to status/i),
      "st-2"
    )

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
      screen.queryByLabelText(/move WEB-1 to status/i)
    ).not.toBeInTheDocument()
    expect(screen.getByText("Fix login")).toBeInTheDocument()
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
