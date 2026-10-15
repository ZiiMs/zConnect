import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import type { Issue, Status } from "@/lib/api"
import { SubtaskList } from "./subtask-list.js"

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

const subtasks: Issue[] = [
  {
    id: "is-2",
    projectId: "pr-1",
    number: 2,
    keyPrefix: "WEB",
    identifier: "WEB-2",
    title: "Split the form",
    description: null,
    statusId: "st-1",
    priority: "Medium",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
    parentId: "is-1",
  },
]

describe("subtask list", () => {
  test("renders each subtask with identifier, title and status", () => {
    render(<SubtaskList subtasks={subtasks} statuses={statuses} />)

    expect(screen.getByText("WEB-2")).toBeInTheDocument()
    expect(screen.getByText("Split the form")).toBeInTheDocument()
    expect(screen.getByText("Backlog")).toBeInTheDocument()
  })

  test("shows an empty state without subtasks", () => {
    render(<SubtaskList subtasks={[]} statuses={statuses} />)

    expect(screen.getByText(/no subtasks yet/i)).toBeInTheDocument()
  })
})
