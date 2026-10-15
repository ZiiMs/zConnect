import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api, type Project } from "@/lib/api"
import { ProjectPage } from "./project-page.js"

vi.mock("@/lib/api", () => ({
  api: {
    listStatuses: vi.fn(),
    deleteStatus: vi.fn(),
    createStatus: vi.fn(),
    updateProject: vi.fn(),
  },
}))

const listStatuses = vi.mocked(api.listStatuses)
const deleteStatus = vi.mocked(api.deleteStatus)

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
  test("renders statuses as ordered sections with categories", async () => {
    listStatuses.mockResolvedValue([...statuses])
    render(
      <ProjectPage
        project={project}
        canManage={true}
        onProjectUpdated={() => {}}
      />
    )

    expect(await screen.findByText("Backlog")).toBeInTheDocument()
    const names = screen
      .getAllByTestId("status-name")
      .map((el) => el.textContent)
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
        onProjectUpdated={() => {}}
      />
    )

    await screen.findByText("Backlog")
    const sections = screen.getAllByTestId("status-name")
    const backlog = sections[0].closest("section")
    if (!(backlog instanceof HTMLElement)) throw new Error("Missing section")
    await user.click(within(backlog).getByRole("button", { name: /delete/i }))
    await waitFor(() =>
      expect(deleteStatus).toHaveBeenCalledWith("pr-1", "st-1")
    )
    await waitFor(() =>
      expect(screen.queryByText("Backlog")).not.toBeInTheDocument()
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
    render(
      <ProjectPage
        project={project}
        canManage={false}
        onProjectUpdated={() => {}}
      />
    )
    expect(await screen.findByText(/no statuses yet/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/project key/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/status name/i)).not.toBeInTheDocument()
  })
})
