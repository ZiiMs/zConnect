import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Project, Status } from "@/lib/api"
import { api } from "@/lib/api"
import { WorkflowSettings } from "./workflow-settings.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listStatuses: vi.fn(),
      createStatus: vi.fn(),
      updateStatus: vi.fn(),
      deleteStatus: vi.fn(),
    },
  }
})

const listStatuses = vi.mocked(api.listStatuses)
const createStatus = vi.mocked(api.createStatus)
const updateStatus = vi.mocked(api.updateStatus)
const deleteStatus = vi.mocked(api.deleteStatus)

const project: Project = {
  id: "pr-1",
  workspaceId: "w-1",
  name: "Web",
  key: "WEB",
  icon: "Folder",
  color: "#94a3b8",
}

const seed: Status[] = [
  {
    id: "st-backlog",
    projectId: "pr-1",
    name: "Queued",
    category: "Backlog",
    color: "#94a3b8",
    position: 0,
    issueCount: 47,
  },
  {
    id: "st-todo",
    projectId: "pr-1",
    name: "Todo",
    category: "Unstarted",
    color: "#eab308",
    position: 1,
    issueCount: 1,
    isDefault: true,
    description: "Ready to start",
  },
  {
    id: "st-doing",
    projectId: "pr-1",
    name: "Doing",
    category: "In Progress",
    color: "#3b82f6",
    position: 2,
    issueCount: 3,
  },
  {
    id: "st-done",
    projectId: "pr-1",
    name: "Done",
    category: "Completed",
    color: "#22c55e",
    position: 3,
  },
  {
    id: "st-wontfix",
    projectId: "pr-1",
    name: "Wontfix",
    category: "Canceled",
    color: "#6b7280",
    position: 4,
    issueCount: 0,
  },
  {
    id: "st-dupe",
    projectId: "pr-1",
    name: "Dupe",
    category: "Duplicate",
    color: "#a855f7",
    position: 5,
    issueCount: 2,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  listStatuses.mockResolvedValue(seed)
  deleteStatus.mockResolvedValue(undefined)
})

describe("workflow settings", () => {
  test("groups statuses under the six category headers with counts and Default badge", async () => {
    render(<WorkflowSettings project={project} canManage />)

    for (const category of [
      "Backlog",
      "Unstarted",
      "In Progress",
      "Completed",
      "Canceled",
      "Duplicate",
    ]) {
      expect(
        await screen.findByRole("heading", { name: category })
      ).toBeInTheDocument()
    }

    expect(screen.getByText("Queued")).toBeInTheDocument()
    expect(screen.getByText("Todo")).toBeInTheDocument()
    expect(screen.getByText("Doing")).toBeInTheDocument()
    expect(screen.getByText("Done")).toBeInTheDocument()
    expect(screen.getByText("47 issues")).toBeInTheDocument()
    expect(screen.getByText("1 issue")).toBeInTheDocument()
    expect(screen.getByText("3 issues")).toBeInTheDocument()
    expect(screen.getByText("2 issues")).toBeInTheDocument()
    // Done has no issueCount (falls back to 0) and Wontfix has 0.
    expect(screen.getAllByText("0 issues")).toHaveLength(2)
    expect(screen.getByText("Default")).toBeInTheDocument()
    expect(screen.getByText("Ready to start")).toBeInTheDocument()
  })

  test("plus for Unstarted opens a create row that appends the created status", async () => {
    const user = userEvent.setup()
    createStatus.mockResolvedValue({
      id: "st-new",
      projectId: "pr-1",
      name: "Refined",
      category: "Unstarted",
      color: "#94a3b8",
      position: 99,
    })
    render(<WorkflowSettings project={project} canManage />)
    await screen.findByText("Todo")

    await user.click(
      screen.getByRole("button", { name: "Add status to Unstarted" })
    )

    const input = screen.getByLabelText("New Unstarted status")
    await user.type(input, "  Refined  ")
    await user.click(screen.getByRole("button", { name: /^Add$/ }))

    await waitFor(() =>
      expect(createStatus).toHaveBeenCalledWith("pr-1", {
        name: "Refined",
        category: "Unstarted",
        color: "#94a3b8",
      })
    )
    expect(await screen.findByText("Refined")).toBeInTheDocument()
  })

  function dragEvent(
    type: string,
    target: Element,
    dataTransfer: object,
    extra?: Record<string, unknown>
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, { dataTransfer, ...extra })
    target.dispatchEvent(event)
    return event
  }

  function makeDataTransfer() {
    const store = new Map<string, string>()
    return {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn((format: string, data: string) => {
        store.set(format, data)
      }),
      getData: vi.fn((format: string) => store.get(format) ?? ""),
    }
  }

  test("drag and drop swaps with the next sibling and re-reads the order", async () => {
    const pair: Status[] = [
      {
        id: "st-todo",
        projectId: "pr-1",
        name: "Todo",
        category: "Unstarted",
        color: "#eab308",
        position: 0,
      },
      {
        id: "st-refined",
        projectId: "pr-1",
        name: "Refined",
        category: "Unstarted",
        color: "#94a3b8",
        position: 1,
      },
      {
        id: "st-doing",
        projectId: "pr-1",
        name: "Doing",
        category: "In Progress",
        color: "#3b82f6",
        position: 2,
      },
    ]
    const swapped: Status[] = [pair[1], pair[0], pair[2]].map(
      (status, position) => ({ ...status, position })
    )
    listStatuses
      .mockResolvedValueOnce(pair)
      .mockResolvedValueOnce(swapped as Status[])
    updateStatus.mockResolvedValue({ ...pair[0], position: 1 })
    render(<WorkflowSettings project={project} canManage />)
    await screen.findByText("Todo")

    const todoRow = screen.getByText("Todo").closest("li") as HTMLElement
    const refinedRow = screen.getByText("Refined").closest("li") as HTMLElement
    const dataTransfer = makeDataTransfer()
    dragEvent("dragstart", todoRow, dataTransfer)
    // Lower half of the target row (jsdom rects are zero) drops after it.
    dragEvent("dragover", refinedRow, dataTransfer, { clientY: 10 })
    dragEvent("drop", refinedRow, dataTransfer)

    await waitFor(() =>
      expect(updateStatus).toHaveBeenCalledWith("pr-1", "st-todo", {
        position: 1,
      })
    )
    await waitFor(() =>
      expect(
        screen
          .getByText("Refined")
          .compareDocumentPosition(screen.getByText("Todo"))
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    )
  })

  test("dropping onto another category is ignored", async () => {
    const pair: Status[] = [
      {
        id: "st-todo",
        projectId: "pr-1",
        name: "Todo",
        category: "Unstarted",
        color: "#eab308",
        position: 0,
      },
      {
        id: "st-doing",
        projectId: "pr-1",
        name: "Doing",
        category: "In Progress",
        color: "#3b82f6",
        position: 1,
      },
    ]
    listStatuses.mockResolvedValueOnce(pair)
    render(<WorkflowSettings project={project} canManage />)
    await screen.findByText("Todo")

    const todoRow = screen.getByText("Todo").closest("li") as HTMLElement
    const doingRow = screen.getByText("Doing").closest("li") as HTMLElement
    const dataTransfer = makeDataTransfer()
    dragEvent("dragstart", todoRow, dataTransfer)
    dragEvent("dragover", doingRow, dataTransfer, { clientY: 10 })
    dragEvent("drop", doingRow, dataTransfer)

    await waitFor(() => expect(screen.getByText("Doing")).toBeInTheDocument())
    expect(updateStatus).not.toHaveBeenCalled()
  })

  test("delete calls deleteStatus and removes the row", async () => {
    const user = userEvent.setup()
    listStatuses
      .mockResolvedValueOnce(seed)
      .mockResolvedValueOnce(seed.filter((status) => status.id !== "st-todo"))
    render(<WorkflowSettings project={project} canManage />)
    await screen.findByText("Todo")

    await user.click(screen.getByRole("button", { name: "Delete Todo" }))

    await waitFor(() =>
      expect(deleteStatus).toHaveBeenCalledWith("pr-1", "st-todo")
    )
    await waitFor(() =>
      expect(screen.queryByText("Todo")).not.toBeInTheDocument()
    )
  })

  test("canManage=false hides add and delete controls and disables drag", async () => {
    render(<WorkflowSettings project={project} canManage={false} />)
    await screen.findByText("Todo")

    expect(
      screen.queryByRole("button", { name: "Add status to Unstarted" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Delete Todo" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("Todo").closest("li")).toHaveAttribute(
      "draggable",
      "false"
    )
  })

  test("shows an empty message when the project has no statuses", async () => {
    listStatuses.mockResolvedValue([])
    render(<WorkflowSettings project={project} canManage />)

    expect(await screen.findByText(/no statuses yet/i)).toBeInTheDocument()
  })
})
