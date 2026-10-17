import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Issue, type Status } from "@/lib/api"
import { ProjectIssues } from "./project-issues.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listStatuses: vi.fn(),
      listIssues: vi.fn(),
      listMembers: vi.fn(),
      listLabels: vi.fn(),
      listSubtasks: vi.fn(),
      getIssue: vi.fn(),
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
const getIssue = vi.mocked(api.getIssue)

const project = {
  id: "pr-1",
  workspaceId: "ws-1",
  name: "Web",
  key: "WEB",
  icon: "Folder",
  color: "#94a3b8",
}

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
    name: "Done",
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
  {
    id: "is-2",
    projectId: "pr-1",
    number: 2,
    keyPrefix: "WEB",
    identifier: "WEB-2",
    title: "Ship it",
    description: null,
    statusId: "st-2",
    priority: "Medium",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
  },
]

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  listStatuses.mockResolvedValue(statuses)
  listMembers.mockResolvedValue([])
  listLabels.mockResolvedValue([])
  listSubtasks.mockResolvedValue([])
  listIssues.mockResolvedValue(issues)
  getIssue.mockImplementation(async (ref: string) => {
    const found = issues.find(
      (i) => i.identifier.toUpperCase() === String(ref).toUpperCase()
    )
    if (!found) throw new Error("Not found")
    return found
  })
})

describe("issue URL sync", () => {
  test("opening a row notifies the shell so it can push the canonical URL", async () => {
    const user = userEvent.setup()
    const onOpenIssue = vi.fn()
    render(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite
        activeIssueIdentifier={null}
        onOpenIssue={onOpenIssue}
        onCloseIssue={() => {}}
      />
    )
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    await waitFor(() =>
      expect(onOpenIssue).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: "WEB-1" }),
        undefined
      )
    )
    expect(await screen.findByTestId("issue-detail-WEB-1")).toBeInTheDocument()
  })

  test("closing the detail notifies the shell so it can return to root", async () => {
    const user = userEvent.setup()
    const onCloseIssue = vi.fn()
    render(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite
        activeIssueIdentifier={null}
        onOpenIssue={() => {}}
        onCloseIssue={onCloseIssue}
      />
    )
    await screen.findByText("WEB-1")
    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )
    await screen.findByTestId("issue-detail-WEB-1")

    await user.click(screen.getByRole("button", { name: /back to issues/i }))

    await waitFor(() => expect(onCloseIssue).toHaveBeenCalled())
  })

  test("a deep-linked identifier opens the detail even when filtered out", async () => {
    // Landing query is Active only, so WEB-2 (Done) is absent from the list.
    render(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite
        activeIssueIdentifier="WEB-2"
        deepIssue={issues[1]}
        onOpenIssue={() => {}}
        onCloseIssue={() => {}}
      />
    )

    expect(await screen.findByTestId("issue-detail-WEB-2")).toBeInTheDocument()
  })

  test("back/forward drives the detail: identifier -> null closes it", async () => {
    const { rerender } = render(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite
        activeIssueIdentifier="WEB-1"
        deepIssue={issues[0]}
        onOpenIssue={() => {}}
        onCloseIssue={() => {}}
      />
    )
    expect(await screen.findByTestId("issue-detail-WEB-1")).toBeInTheDocument()

    rerender(
      <ProjectIssues
        project={project}
        userId="user-a"
        canWrite
        activeIssueIdentifier={null}
        deepIssue={null}
        onOpenIssue={() => {}}
        onCloseIssue={() => {}}
      />
    )

    await waitFor(() =>
      expect(screen.queryByTestId("issue-detail-WEB-1")).not.toBeInTheDocument()
    )
  })
})
