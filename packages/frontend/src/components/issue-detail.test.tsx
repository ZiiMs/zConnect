import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Issue, type Status } from "@/lib/api"
import { IssueDetail } from "./issue-detail.js"
import { ProjectIssues } from "./project-issues.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      listStatuses: vi.fn(),
      listIssues: vi.fn(),
      listMembers: vi.fn(),
      listLabels: vi.fn(),
      listSubtasks: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      deleteIssue: vi.fn(),
    },
  }
})

const listStatuses = vi.mocked(api.listStatuses)
const listIssues = vi.mocked(api.listIssues)
const listMembers = vi.mocked(api.listMembers)
const listLabels = vi.mocked(api.listLabels)
const listSubtasks = vi.mocked(api.listSubtasks)
const updateIssue = vi.mocked(api.updateIssue)

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

const baseIssue: Issue = {
  id: "is-1",
  projectId: "pr-1",
  number: 1,
  keyPrefix: "WEB",
  identifier: "WEB-1",
  title: "Fix login",
  description: "Reset the session token.",
  statusId: "st-1",
  priority: "High",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: ["bug"],
}

const childIssue: Issue = {
  ...baseIssue,
  id: "is-2",
  number: 2,
  identifier: "WEB-2",
  title: "Split it",
  parentId: "is-1",
}

const registry = [
  { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
]

function stubLinkFetches() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  )
}

function renderDetail(issue: Issue = baseIssue, canEdit = true) {
  const callbacks = {
    onBack: vi.fn(),
    onStatusChange: vi.fn(),
    onUpdate: vi.fn(),
    onArchivedChanged: vi.fn(),
    onDeleted: vi.fn(),
  }
  render(
    <IssueDetail
      issue={issue}
      statuses={statuses}
      members={[]}
      labels={registry}
      subtasks={[childIssue]}
      canEdit={canEdit}
      canAdmin={false}
      onBack={callbacks.onBack}
      onStatusChange={callbacks.onStatusChange}
      onUpdate={callbacks.onUpdate}
      onArchivedChanged={callbacks.onArchivedChanged}
      onDeleted={callbacks.onDeleted}
    />
  )
  return callbacks
}

describe("issue detail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLinkFetches()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("renders the two-column header, description, and properties", async () => {
    renderDetail()

    const detail = screen.getByTestId("issue-detail-WEB-1")
    expect(
      within(detail).getByRole("heading", { name: "Fix login" })
    ).toBeInTheDocument()
    expect(
      within(detail).getByText("Reset the session token.")
    ).toBeInTheDocument()
    expect(within(detail).getAllByText("Backlog").length).toBeGreaterThan(0)
    expect(within(detail).getByLabelText("Properties")).toBeInTheDocument()
    expect(
      await within(detail).findByText(/no linked prs/i)
    ).toBeInTheDocument()
  })

  test("renders subtasks and label chips from container data", () => {
    renderDetail()

    const detail = screen.getByTestId("issue-detail-WEB-1")
    expect(within(detail).getByTestId("subtask-WEB-2")).toHaveTextContent(
      "Split it"
    )
    expect(within(detail).getByText("bug")).toBeInTheDocument()
    expect(within(detail).getByTestId("label-dot-bug")).toBeInTheDocument()
  })

  test("falls back to the empty description", () => {
    renderDetail({ ...baseIssue, description: null })

    expect(screen.getByText("No description yet.")).toBeInTheDocument()
  })

  test("back calls onBack", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(screen.getByRole("button", { name: /back to issues/i }))

    expect(callbacks.onBack).toHaveBeenCalledTimes(1)
  })

  test("the status text opens a menu on the status-change path", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(screen.getByRole("button", { name: /status for WEB-1/i }))
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "WEB-1" }),
      "st-2"
    )
  })

  test("the priority pill opens a menu on the update path", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(
      screen.getByRole("button", { name: /priority for WEB-1/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Urgent" }))

    expect(callbacks.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "WEB-1" }),
      { priority: "Urgent" }
    )
  })

  test("the assignee avatar opens a menu on the update path", async () => {
    const user = userEvent.setup()
    const callbacks = renderDetail()

    await user.click(
      screen.getByRole("button", { name: /assignee for WEB-1/i })
    )
    const unassigned = screen.getByRole("menuitemradio", {
      name: "Unassigned",
    })
    expect(unassigned).toHaveAttribute("aria-checked", "true")
    await user.click(unassigned)

    expect(callbacks.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "WEB-1" }),
      { assigneeId: null }
    )
  })

  test("read-only viewers see values but no editors or row actions", () => {
    renderDetail(baseIssue, false)

    const detail = screen.getByTestId("issue-detail-WEB-1")
    expect(
      within(detail).queryByLabelText(/status for WEB-1/i)
    ).not.toBeInTheDocument()
    expect(
      within(detail).queryByRole("button", { name: /archive/i })
    ).not.toBeInTheDocument()
    expect(within(detail).getByText("Unassigned")).toBeInTheDocument()
  })
})

describe("project issues detail selection", () => {
  const project = {
    id: "pr-1",
    workspaceId: "ws-1",
    name: "Web",
    key: "WEB",
    icon: "Folder",
    color: "#94a3b8",
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    stubLinkFetches()
    listStatuses.mockResolvedValue(statuses)
    listMembers.mockResolvedValue([])
    listLabels.mockResolvedValue(registry)
    listSubtasks.mockResolvedValue([childIssue])
    listIssues.mockResolvedValue([{ ...baseIssue, labels: [] }])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("detail opens from a kanban card and back returns to the board", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...baseIssue, statusId: "st-2" })
    render(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite={true}
        canAdmin={false}
      />
    )
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    const detail = await screen.findByTestId("issue-detail-WEB-1")
    expect(
      within(detail).getByRole("heading", { name: "Fix login" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /back to issues/i }))
    expect(await screen.findByTestId("kanban-card-WEB-1")).toBeInTheDocument()
    expect(screen.queryByTestId("issue-detail-WEB-1")).not.toBeInTheDocument()
  })

  test("detail opens from the row and back returns to the list", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...baseIssue, statusId: "st-2" })
    render(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite={true}
        canAdmin={false}
      />
    )
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    const detail = await screen.findByTestId("issue-detail-WEB-1")
    expect(
      within(detail).getByRole("heading", { name: "Fix login" })
    ).toBeInTheDocument()
    expect(listSubtasks).toHaveBeenCalledWith("WEB-1")
    expect(
      await within(detail).findByTestId("subtask-WEB-2")
    ).toBeInTheDocument()

    await user.click(
      within(detail).getByRole("button", { name: /status for WEB-1/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))
    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", {
        statusId: "st-2",
      })
    )

    await user.click(screen.getByRole("button", { name: /back to issues/i }))
    expect(await screen.findByTestId("issue-WEB-1")).toBeInTheDocument()
    expect(screen.queryByTestId("issue-detail-WEB-1")).not.toBeInTheDocument()
  })
})
