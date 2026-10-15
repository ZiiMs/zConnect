import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Issue, type Label, type Status } from "@/lib/api"
import { ProjectIssues } from "./project-issues.js"

vi.mock("@/lib/api", () => ({
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
}))

const listStatuses = vi.mocked(api.listStatuses)
const listIssues = vi.mocked(api.listIssues)
const listMembers = vi.mocked(api.listMembers)
const listLabels = vi.mocked(api.listLabels)
const listSubtasks = vi.mocked(api.listSubtasks)
const updateIssue = vi.mocked(api.updateIssue)
const deleteIssue = vi.mocked(api.deleteIssue)

const project = { id: "pr-1", workspaceId: "ws-1", name: "Web", key: "WEB" }

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
]

function setup(canWrite = true, canAdmin = false, registry: Label[] = []) {
  listStatuses.mockResolvedValue(statuses)
  listMembers.mockResolvedValue([])
  listLabels.mockResolvedValue(registry)
  listSubtasks.mockResolvedValue([])
  listIssues.mockResolvedValue(issues)
  return render(
    <ProjectIssues
      project={project}
      userId="user-a"
      canWrite={canWrite}
      canAdmin={canAdmin}
    />
  )
}

describe("project issues list view", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test("renders the filtered issue query for the project", async () => {
    setup()

    expect(await screen.findByText("WEB-1")).toBeInTheDocument()
    await waitFor(() =>
      expect(listIssues).toHaveBeenCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: [], text: "" })
      )
    )
  })

  test("narrowing the filter bar re-queries", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("checkbox", { name: "Backlog" }))

    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: ["st-1"] })
      )
    )
  })

  test("filter choices persist per user per project", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("checkbox", { name: "Backlog" }))

    await waitFor(() =>
      expect(
        localStorage.getItem("zconnect:issue-filters:user-a:pr-1")
      ).toContain("st-1")
    )
  })

  test("completing the lifecycle through a list action updates the row", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...issues[0], statusId: "st-2" })
    setup()
    await screen.findByText("WEB-1")

    const row = screen.getByTestId("issue-WEB-1")
    await user.selectOptions(
      within(row).getByLabelText(/status for WEB-1/i),
      "st-2"
    )

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { statusId: "st-2" })
    )
  })

  test("a failed status change shows the error", async () => {
    const user = userEvent.setup()
    updateIssue.mockRejectedValueOnce(new Error("Invalid status"))
    setup()
    await screen.findByText("WEB-1")

    const row = screen.getByTestId("issue-WEB-1")
    await user.selectOptions(
      within(row).getByLabelText(/status for WEB-1/i),
      "st-2"
    )

    expect(await screen.findByText(/invalid status/i)).toBeInTheDocument()
  })

  test("read-only viewers see no create form or status controls", async () => {
    setup(false)
    await screen.findByText("WEB-1")

    expect(screen.queryByLabelText(/issue title/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/status for WEB-1/i)).not.toBeInTheDocument()
  })

  test("registry labels narrow the query", async () => {
    const user = userEvent.setup()
    setup(true, false, [
      { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
    ])
    await screen.findByText("WEB-1")

    const bar = screen.getByRole("region", { name: /issue filters/i })
    await user.click(within(bar).getByRole("checkbox", { name: "bug" }))

    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ labels: ["bug"] })
      )
    )
  })

  test("completing with open subtasks shows the warning", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({
      ...issues[0],
      statusId: "st-2",
      warnings: ["Completing with 1 open subtask: WEB-2"],
    })
    setup()
    await screen.findByText("WEB-1")

    const row = screen.getByTestId("issue-WEB-1")
    await user.selectOptions(
      within(row).getByLabelText(/status for WEB-1/i),
      "st-2"
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(/open subtask/i)
  })

  test("archiving and deleting through row actions updates the list", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...issues[0], archived: true })
    deleteIssue.mockResolvedValue(undefined)
    setup(true, true)
    await screen.findByText("WEB-1")
    const row = screen.getByTestId("issue-WEB-1")

    await user.click(within(row).getByRole("button", { name: /archive/i }))
    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { archived: true })
    )

    await user.click(
      within(row).getByRole("button", { name: /delete permanently/i })
    )
    await waitFor(() => expect(deleteIssue).toHaveBeenCalledWith("WEB-1"))
    expect(screen.queryByText("WEB-1")).not.toBeInTheDocument()
  })

  test("expanding subtasks loads the children", async () => {
    const user = userEvent.setup()
    setup()
    listSubtasks.mockResolvedValue([
      {
        ...issues[0],
        id: "is-2",
        number: 2,
        identifier: "WEB-2",
        title: "Split it",
        parentId: "is-1",
      },
    ])
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /subtasks/i }))

    expect(await screen.findByText("Split it")).toBeInTheDocument()
    expect(listSubtasks).toHaveBeenCalledWith("WEB-1")
  })

  test("creating an issue happens in a modal that closes on success", async () => {
    const user = userEvent.setup()
    const createIssue = vi.mocked(api.createIssue)
    createIssue.mockResolvedValue({
      ...issues[0],
      id: "is-2",
      number: 2,
      identifier: "WEB-2",
      title: "New from modal",
    })
    setup()
    await screen.findByText("WEB-1")

    expect(screen.queryByLabelText(/issue title/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^new issue$/i }))
    await user.type(screen.getByLabelText(/issue title/i), "New from modal")
    await user.click(screen.getByRole("button", { name: /^create issue$/i }))

    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith(
        "pr-1",
        expect.objectContaining({ title: "New from modal" })
      )
    )
    expect(await screen.findByText("WEB-2")).toBeInTheDocument()
    expect(screen.queryByLabelText(/issue title/i)).not.toBeInTheDocument()
  })
})
