import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
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

let capturedDragStart: ((event: { active: { id: string } }) => void) | null =
  null
let capturedDragEnd:
  | ((event: { active: { id: string }; over: { id: string } | null }) => void)
  | null = null
let capturedDragCancel: (() => void) | null = null

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>()
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragStart,
      onDragCancel,
    }: {
      children: React.ReactNode
      onDragEnd?: (event: {
        active: { id: string }
        over: { id: string } | null
      }) => void
      onDragStart?: (event: { active: { id: string } }) => void
      onDragCancel?: () => void
    }) => {
      capturedDragEnd = onDragEnd ?? null
      capturedDragStart = onDragStart ?? null
      capturedDragCancel = onDragCancel ?? null
      return <>{children}</>
    },
    // The real overlay portals off the mocked context, so tests observe it
    // as a plain passthrough: when the board renders preview children the
    // test DOM contains them, otherwise nothing.
    DragOverlay: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
  }
})

const {
  KanbanBoard,
  resolveKanbanDrop,
  loadCollapsedStatuses,
  saveCollapsedStatuses,
} = await import("./kanban-board.js")

const members = [{ userId: "user-member" }, { userId: "user-owner" }]

function setup(
  onMove: (issue: Issue, statusId: string) => void = () => {},
  onAssign: (issue: Issue, assigneeId: string | null) => void = () => {}
) {
  capturedDragStart = null
  capturedDragEnd = null
  capturedDragCancel = null
  return render(
    <KanbanBoard
      issues={issues}
      statuses={statuses}
      members={members}
      userId="user-a"
      projectId="pr-1"
      canEdit={true}
      onMove={onMove}
      onAssign={onAssign}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
})

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

  test("a status filter hides the filtered-out boards", () => {
    render(
      <KanbanBoard
        issues={issues.filter((issue) => issue.statusId === "st-1")}
        statuses={statuses}
        members={members}
        userId="user-a"
        projectId="pr-1"
        canEdit={true}
        visibleStatusIds={["st-1"]}
        onMove={() => {}}
      />
    )

    expect(screen.getByTestId("kanban-column-st-1")).toBeInTheDocument()
    expect(screen.queryByTestId("kanban-column-st-2")).not.toBeInTheDocument()
  })

  test("an empty status filter shows every board", () => {
    render(
      <KanbanBoard
        issues={issues}
        statuses={statuses}
        members={members}
        userId="user-a"
        projectId="pr-1"
        canEdit={true}
        visibleStatusIds={[]}
        onMove={() => {}}
      />
    )

    expect(screen.getByTestId("kanban-column-st-1")).toBeInTheDocument()
    expect(screen.getByTestId("kanban-column-st-2")).toBeInTheDocument()
  })

  test("lanes fill the remaining height with tight gutters", () => {
    setup()

    const column = screen.getByTestId("kanban-column-st-1")
    expect(column.className).toContain("overflow-y-auto")
    const lanes = column.parentElement as HTMLElement
    expect(lanes.className).toContain("items-stretch")
    expect(lanes.className).toContain("gap-2")
    expect(lanes.className).toContain("min-h-0")
    expect(lanes.className).toContain("flex-1")
    // Only sideways: `overflow-x-auto` alone would also enable a vertical
    // scrollbar, so the lanes pin the vertical axis shut.
    expect(lanes.className).toContain("overflow-x-auto")
    expect(lanes.className).toContain("overflow-y-hidden")
  })

  test("a drop on another column moves the card", () => {
    const onMove = vi.fn()
    setup(onMove)

    act(() => {
      capturedDragEnd?.({ active: { id: "is-1" }, over: { id: "st-2" } })
    })

    expect(onMove).toHaveBeenCalledWith(issues[0], "st-2")
  })

  test("a drag shows an overlay preview during the drag", () => {
    setup()

    expect(screen.queryByTestId("kanban-drag-overlay")).not.toBeInTheDocument()

    act(() => {
      capturedDragStart?.({ active: { id: "is-1" } })
    })

    const overlay = screen.getByTestId("kanban-drag-overlay")
    expect(within(overlay).getByText("Fix login")).toBeInTheDocument()

    act(() => {
      capturedDragEnd?.({ active: { id: "is-1" }, over: { id: "st-2" } })
    })
    expect(screen.queryByTestId("kanban-drag-overlay")).not.toBeInTheDocument()
  })

  test("cancelling a drag clears the overlay preview", () => {
    setup()

    act(() => {
      capturedDragStart?.({ active: { id: "is-1" } })
    })
    expect(screen.getByTestId("kanban-drag-overlay")).toBeInTheDocument()

    act(() => {
      capturedDragCancel?.()
    })
    expect(screen.queryByTestId("kanban-drag-overlay")).not.toBeInTheDocument()
  })

  test("a drop on the same column moves nothing", () => {
    const onMove = vi.fn()
    setup(onMove)

    act(() => {
      capturedDragEnd?.({ active: { id: "is-1" }, over: { id: "st-1" } })
    })

    expect(onMove).not.toHaveBeenCalled()
  })

  test("the status text menu calls through with the new status", async () => {
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
        userId="user-a"
        projectId="pr-1"
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
        userId="user-a"
        projectId="pr-1"
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
        userId="user-a"
        projectId="pr-1"
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
    expect(within(card).getByTestId("assignee-user-member")).toBeInTheDocument()
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
        userId="user-a"
        projectId="pr-1"
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
        userId="user-a"
        projectId="pr-1"
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

  test("cards carry an icon-only Priority mark after the identifier", () => {
    setup()

    const card = screen.getByTestId("kanban-card-WEB-1")
    // No priority text on the card, just the mark.
    const mark = within(card).getByRole("img", {
      name: /priority for WEB-1: high/i,
    })
    expect(mark).toHaveAttribute("title", "High")
    expect(within(card).queryByText("High")).not.toBeInTheDocument()
    // Softened tone (2026-10-16 review): the priority's own token, mixed
    // toward the muted palette in oklab so the hue survives and only chroma
    // drops.
    expect(mark.getAttribute("style")).toContain(
      "color-mix(in oklab, var(--priority-high) 60%, var(--muted-foreground))"
    )
  })

  test("cards cap labels at two and roll the rest into +n", () => {
    const many: Issue[] = [{ ...issues[0], labels: ["bug", "perf", "a11y"] }]
    render(
      <KanbanBoard
        issues={many}
        statuses={statuses}
        labels={[
          { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
          { id: "lb-2", workspaceId: "ws-1", name: "perf", color: "#22c55e" },
          { id: "lb-3", workspaceId: "ws-1", name: "a11y", color: "#3b82f6" },
        ]}
        userId="user-a"
        projectId="pr-1"
        canEdit={true}
        onMove={() => {}}
      />
    )

    const card = screen.getByTestId("kanban-card-WEB-1")
    expect(within(card).getByText("bug")).toBeInTheDocument()
    expect(within(card).getByText("perf")).toBeInTheDocument()
    expect(within(card).queryByText("a11y")).not.toBeInTheDocument()
    // The overflow pill carries the full list as its tooltip.
    const overflow = within(card).getByTestId("label-overflow-WEB-1")
    expect(overflow).toHaveTextContent("+1")
    expect(overflow).toHaveAttribute("title", "bug, perf, a11y")
  })

  test("the card surface carries no status accent", () => {
    setup()

    const card = screen.getByTestId("kanban-card-WEB-1")
    // Status colour was removed from the surface (2026-10-16 review): no 4px
    // rail in status.color and no color-mix wash, so status reads from the
    // footer mark and name only.
    expect(card.style.borderLeft).toBe("")
    expect(card.style.backgroundColor).toBe("")
    expect(card.className).toContain("bg-card")
  })

  test("the clamped title keeps the full text on hover", () => {
    const long: Issue[] = [
      {
        ...issues[0],
        title: "Realtime subscription leaks when switching projects quickly",
      },
    ]
    render(
      <KanbanBoard
        issues={long}
        statuses={statuses}
        userId="user-a"
        projectId="pr-1"
        canEdit={true}
        onMove={() => {}}
      />
    )

    expect(
      screen.getByText(
        "Realtime subscription leaks when switching projects quickly"
      )
    ).toHaveAttribute(
      "title",
      "Realtime subscription leaks when switching projects quickly"
    )
  })
})

describe("kanban status collapse", () => {
  test("the header control collapses a status to a strip and expands it again", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole("button", { name: /collapse backlog/i }))

    const collapsed = screen.getByTestId("kanban-column-st-1")
    expect(collapsed.className).toContain("w-11")
    // The cards are gone; the strip keeps the mark, name and count.
    expect(within(collapsed).queryByText("Fix login")).not.toBeInTheDocument()
    expect(
      within(collapsed).getByRole("heading", { name: /backlog/i })
    ).toBeInTheDocument()
    expect(within(collapsed).getByText("Backlog")).toHaveClass(
      "[writing-mode:vertical-rl]"
    )
    expect(
      within(collapsed).getByTestId("status-icon-Backlog")
    ).toBeInTheDocument()
    expect(within(collapsed).getByText("1")).toBeInTheDocument()
    // Its neighbour is untouched.
    expect(
      within(screen.getByTestId("kanban-column-st-2")).getByText(
        "Ship homepage"
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /expand backlog/i }))
    expect(
      within(screen.getByTestId("kanban-column-st-1")).getByText("Fix login")
    ).toBeInTheDocument()
  })

  test("the control reports the collapsed state", async () => {
    const user = userEvent.setup()
    setup()

    const collapse = screen.getByRole("button", { name: /collapse backlog/i })
    expect(collapse).toHaveAttribute("aria-expanded", "true")

    await user.click(collapse)
    expect(
      screen.getByRole("button", { name: /expand backlog/i })
    ).toHaveAttribute("aria-expanded", "false")
  })

  test("read-only viewers can still collapse a status", async () => {
    const user = userEvent.setup()
    render(
      <KanbanBoard
        issues={issues}
        statuses={statuses}
        userId="user-a"
        projectId="pr-1"
        canEdit={false}
        onMove={() => {}}
      />
    )

    await user.click(screen.getByRole("button", { name: /collapse backlog/i }))
    expect(
      within(screen.getByTestId("kanban-column-st-1")).queryByText("Fix login")
    ).not.toBeInTheDocument()
  })

  test("the collapsed set round-trips through localStorage per user and project", () => {
    saveCollapsedStatuses("user-a", "pr-1", ["st-2"])
    expect(loadCollapsedStatuses("user-a", "pr-1")).toEqual(["st-2"])
    // Another viewer, and another project, start expanded.
    expect(loadCollapsedStatuses("user-b", "pr-1")).toEqual([])
    expect(loadCollapsedStatuses("user-a", "pr-2")).toEqual([])
    // Unreadable storage reads as nothing collapsed.
    localStorage.setItem("zconnect:kanban-collapsed:user-a:pr-1", "not-json{{{")
    expect(loadCollapsedStatuses("user-a", "pr-1")).toEqual([])
  })

  test("a stored collapse is restored on render and lifted on expand", async () => {
    const user = userEvent.setup()
    saveCollapsedStatuses("user-a", "pr-1", ["st-1"])
    setup()

    expect(
      within(screen.getByTestId("kanban-column-st-1")).queryByText("Fix login")
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /expand backlog/i }))
    expect(loadCollapsedStatuses("user-a", "pr-1")).toEqual([])
  })
})
