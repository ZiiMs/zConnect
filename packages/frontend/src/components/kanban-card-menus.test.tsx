import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Issue, Status } from "@/lib/api"
import { KanbanBoard } from "./kanban-board.js"

/**
 * Card menus under the real dnd-kit sensors (the board unit tests mock
 * DndContext). Guards the regression where the pointer sensor claimed
 * pointer-down and clicks on the pill/avatar never fired.
 */
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
]

const members = [{ userId: "user-member" }]

describe("kanban card menus under real sensors", () => {
  test("status pill menu moves the card", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <KanbanBoard
        issues={issues}
        statuses={statuses}
        members={members}
        canEdit={true}
        onMove={onMove}
        onAssign={() => {}}
      />
    )

    await user.click(
      screen.getByRole("button", { name: /move WEB-1 to status/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(onMove).toHaveBeenCalledWith(issues[0], "st-2")
  })

  test("avatar menu assigns the card", async () => {
    const user = userEvent.setup()
    const onAssign = vi.fn()
    render(
      <KanbanBoard
        issues={issues}
        statuses={statuses}
        members={members}
        canEdit={true}
        onMove={() => {}}
        onAssign={onAssign}
      />
    )

    await user.click(
      screen.getByRole("button", { name: /assignee for WEB-1/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "user-member" }))

    expect(onAssign).toHaveBeenCalledWith(issues[0], "user-member")
  })
})
