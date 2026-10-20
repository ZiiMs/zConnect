import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type MyIssue } from "@/lib/api"
import { MyIssues } from "./my-issues.js"

vi.mock("@/lib/api", () => ({
  api: {
    listMyIssues: vi.fn(),
  },
}))

const listMyIssues = vi.mocked(api.listMyIssues)

function myIssue(overrides: Partial<MyIssue> = {}): MyIssue {
  return {
    id: "is-1",
    projectId: "pr-1",
    number: 1,
    keyPrefix: "WEB",
    identifier: "WEB-1",
    title: "Fix login",
    description: null,
    statusId: "st-1",
    priority: "High",
    assigneeId: "user-1",
    dueDate: null,
    archived: false,
    labels: [],
    createdBy: "user-1",
    createdAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    workspaceId: "ws-1",
    workspaceName: "Acme",
    projectName: "Web",
    projectKey: "WEB",
    projectIcon: "Folder",
    projectColor: "#94a3b8",
    statusName: "Todo",
    statusCategory: "Unstarted",
    statusColor: "#e2e2e2",
    ...overrides,
  }
}

function setup() {
  const onOpenIssue = vi.fn()
  render(<MyIssues onOpenIssue={onOpenIssue} />)
  return { onOpenIssue }
}

beforeEach(() => {
  vi.clearAllMocks()
  listMyIssues.mockResolvedValue([])
})

describe("my issues", () => {
  test("each tab fetches its tab and renders project, status, priority, and time", async () => {
    const user = userEvent.setup()
    const assigned = myIssue()
    const created = myIssue({
      id: "is-2",
      identifier: "WEB-2",
      title: "Created issue",
      projectName: "Mobile",
      projectIcon: "Rocket",
      projectColor: "#f2c94c",
      statusName: "In Progress",
      statusCategory: "In Progress",
      statusColor: "#f2c94c",
      priority: "Urgent",
    })
    const watched = myIssue({
      id: "is-3",
      identifier: "WEB-3",
      title: "Watched issue",
      statusName: "Done",
      statusCategory: "Completed",
      statusColor: "#5e6ad2",
    })
    listMyIssues.mockImplementation(async (tab) => {
      if (tab === "created") return [created]
      if (tab === "watched") return [watched]
      return [assigned]
    })
    setup()

    expect(await screen.findByText("Fix login")).toBeInTheDocument()
    expect(listMyIssues).toHaveBeenCalledWith("assigned")
    expect(screen.getByText("Web")).toBeInTheDocument()
    expect(screen.getByTestId("project-icon-Folder")).toBeInTheDocument()
    expect(screen.getByText("Todo")).toBeInTheDocument()
    expect(
      screen.getByRole("img", { name: "Priority: High" })
    ).toBeInTheDocument()
    expect(screen.getByText("2h ago")).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /created/i }))
    expect(await screen.findByText("Created issue")).toBeInTheDocument()
    expect(listMyIssues).toHaveBeenCalledWith("created")
    expect(screen.getByText("Mobile")).toBeInTheDocument()
    expect(screen.getByText("In Progress")).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /watched/i }))
    expect(await screen.findByText("Watched issue")).toBeInTheDocument()
    expect(listMyIssues).toHaveBeenCalledWith("watched")
    expect(screen.getByText("Done")).toBeInTheDocument()
  })

  test("has a per-tab empty state", async () => {
    const user = userEvent.setup()
    setup()

    expect(
      await screen.findByText("Nothing assigned to you.")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /created/i }))
    expect(
      await screen.findByText("You have not created any issues.")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /watched/i }))
    expect(
      await screen.findByText("You are not watching any issues.")
    ).toBeInTheDocument()
  })

  test("clicking a row opens that issue", async () => {
    const user = userEvent.setup()
    const issue = myIssue()
    listMyIssues.mockResolvedValue([issue])
    const { onOpenIssue } = setup()

    await user.click(
      await screen.findByRole("button", { name: /WEB-1.*Fix login/i })
    )

    await waitFor(() => expect(onOpenIssue).toHaveBeenCalledWith(issue))
  })
})
