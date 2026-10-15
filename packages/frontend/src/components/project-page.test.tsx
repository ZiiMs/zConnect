import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Project } from "@/lib/api"
import { ProjectPage } from "./project-page.js"

vi.mock("@/lib/api", () => ({
  api: {
    listStatuses: vi.fn(),
    deleteStatus: vi.fn(),
    createStatus: vi.fn(),
    updateProject: vi.fn(),
    listIssues: vi.fn(),
    listMembers: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
  },
}))

const listStatuses = vi.mocked(api.listStatuses)
const deleteStatus = vi.mocked(api.deleteStatus)
const listIssues = vi.mocked(api.listIssues)
const listMembers = vi.mocked(api.listMembers)

const project: Project = {
  id: "pr-1",
  workspaceId: "ws-1",
  name: "Web",
  key: "WEB",
}

const statuses = [
  {
    id: "st-3",
    projectId: "pr-1",
    name: "Shipped",
    category: "Done",
    position: 2,
  },
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
    name: "In Review",
    category: "In Progress",
    position: 1,
  },
] as const

describe("project page", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    listIssues.mockResolvedValue([])
    listMembers.mockResolvedValue([])
  })

  test("renders statuses as ordered sections with categories", async () => {
    listStatuses.mockResolvedValue([...statuses])
    render(
      <ProjectPage
        project={project}
        canManage={true}
        canWriteIssues={true}
        userId="user-owner"
        onProjectUpdated={() => {}}
      />
    )

    const names = (await screen.findAllByTestId("status-name")).map(
      (el) => el.textContent
    )
    expect(names).toEqual(["Backlog", "In Review", "Shipped"])
    const categories = screen
      .getAllByTestId("status-category")
      .map((el) => el.textContent)
    expect(categories).toEqual(["Todo", "In Progress", "Done"])
  })

  test("shows an empty state without statuses", async () => {
    listStatuses.mockResolvedValue([])
    render(
      <ProjectPage
        project={project}
        canManage={true}
        canWriteIssues={true}
        userId="user-owner"
        onProjectUpdated={() => {}}
      />
    )
    expect(await screen.findByText(/no statuses yet/i)).toBeInTheDocument()
  })

  test("deleting a status removes it; a blocked delete shows the error", async () => {
    const user = userEvent.setup()
    listStatuses.mockResolvedValue([
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
        name: "Done",
        category: "Done",
        position: 1,
      },
    ])
    deleteStatus.mockResolvedValueOnce(undefined)
    deleteStatus.mockRejectedValueOnce(
      new Error("Cannot delete a status that holds issues")
    )
    render(
      <ProjectPage
        project={project}
        canManage={true}
        canWriteIssues={true}
        userId="user-owner"
        onProjectUpdated={() => {}}
      />
    )

    await screen.findAllByTestId("status-name")
    const sections = screen.getAllByTestId("status-name")
    const backlog = sections[0].closest("section")
    if (!(backlog instanceof HTMLElement)) throw new Error("Missing section")
    await user.click(within(backlog).getByRole("button", { name: /delete/i }))
    await waitFor(() =>
      expect(deleteStatus).toHaveBeenCalledWith("pr-1", "st-1")
    )
    await waitFor(() =>
      expect(
        screen.getAllByTestId("status-name").map((el) => el.textContent)
      ).not.toContain("Backlog")
    )

    const doneSection = screen
      .getAllByTestId("status-name")
      .find((el) => el.textContent === "Done")
      ?.closest("section")
    if (!(doneSection instanceof HTMLElement))
      throw new Error("Missing section")
    const done = doneSection
    await user.click(within(done).getByRole("button", { name: /delete/i }))
    expect(await screen.findByText(/holds issues/i)).toBeInTheDocument()
  })

  test("hides manage controls from read-only viewers", async () => {
    listStatuses.mockResolvedValue([])
    listIssues.mockResolvedValue([])
    listMembers.mockResolvedValue([])
    render(
      <ProjectPage
        project={project}
        canManage={false}
        canWriteIssues={false}
        userId="user-viewer"
        onProjectUpdated={() => {}}
      />
    )
    expect(await screen.findByText(/no statuses yet/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/project key/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/status name/i)).not.toBeInTheDocument()
  })

  test("renders the issue list view below the workflow", async () => {
    listStatuses.mockResolvedValue([])
    listMembers.mockResolvedValue([])
    listIssues.mockResolvedValue([
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
    ])
    render(
      <ProjectPage
        project={project}
        canManage={true}
        canWriteIssues={true}
        userId="user-owner"
        onProjectUpdated={() => {}}
      />
    )
    expect(await screen.findByText("WEB-1")).toBeInTheDocument()
    expect(screen.getByLabelText(/search issues/i)).toBeInTheDocument()
  })
})
