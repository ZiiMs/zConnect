import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Issue, type Status } from "@/lib/api"
import { ProjectIssues } from "./project-issues.js"

vi.mock("@/lib/api", () => ({
  api: {
    listStatuses: vi.fn(),
    listIssues: vi.fn(),
    listMembers: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
  },
}))

const listStatuses = vi.mocked(api.listStatuses)
const listIssues = vi.mocked(api.listIssues)
const listMembers = vi.mocked(api.listMembers)
const updateIssue = vi.mocked(api.updateIssue)

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

function setup(canWrite = true) {
  listStatuses.mockResolvedValue(statuses)
  listMembers.mockResolvedValue([])
  listIssues.mockResolvedValue(issues)
  return render(
    <ProjectIssues project={project} userId="user-a" canWrite={canWrite} />
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
})
