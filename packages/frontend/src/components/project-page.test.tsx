import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Project } from "@/lib/api"
import { ProjectPage } from "./project-page.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      listStatuses: vi.fn(),
      deleteStatus: vi.fn(),
      createStatus: vi.fn(),
      updateProject: vi.fn(),
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

const project: Project = {
  id: "pr-1",
  workspaceId: "ws-1",
  name: "Web",
  key: "WEB",
  icon: "Folder",
  color: "#94a3b8",
}

const statuses = [
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
    name: "In Review",
    category: "In Progress",
    color: "#0f783c",
    position: 1,
  },
] as const

describe("project page", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    listStatuses.mockResolvedValue([...statuses])
    listIssues.mockResolvedValue([])
    listMembers.mockResolvedValue([])
    listLabels.mockResolvedValue([])
  })

  test("keeps a screen-reader heading and shows the compact breadcrumb trail", async () => {
    render(
      <ProjectPage
        project={project}
        canManage={true}
        canWriteIssues={true}
        userId="user-owner"
      />
    )

    expect(
      await screen.findByRole("heading", { name: "Web" })
    ).toBeInTheDocument()
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i })
    expect(
      within(trail).getByRole("button", { name: "Web" })
    ).toBeInTheDocument()
    // The project crumb carries the project mark in its color.
    const mark = within(trail).getByTestId("project-icon-Folder")
    expect(mark).toBeInTheDocument()
    expect(mark).toHaveStyle({ color: "#94a3b8" })
    expect(
      within(trail).getByRole("button", { name: "Issues" })
    ).toBeInTheDocument()
    // No stacked title row, key badge, or inline workflow editor.
    expect(screen.queryByLabelText(/workflow/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/status name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/project key/i)).not.toBeInTheDocument()
    expect(screen.queryByText("WEB")).not.toBeInTheDocument()
  })

  test("star toggles and persists per project", async () => {
    const user = userEvent.setup()
    render(
      <ProjectPage
        project={project}
        canManage={true}
        canWriteIssues={true}
        userId="user-owner"
      />
    )
    const star = await screen.findByRole("button", { name: /star project/i })
    expect(star).toHaveAttribute("aria-pressed", "false")

    await user.click(star)
    expect(star).toHaveAttribute("aria-pressed", "true")
    expect(localStorage.getItem("zconnect:starred:pr-1")).toBe("1")

    await user.click(screen.getByRole("button", { name: /unstar project/i }))
    expect(
      screen.getByRole("button", { name: /star project/i })
    ).toHaveAttribute("aria-pressed", "false")
  })

  test("renders the issue list view with filters popover", async () => {
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
      />
    )
    expect(await screen.findByText("WEB-1")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^filters/i })
    ).toBeInTheDocument()
  })
})
