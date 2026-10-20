import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Issue, type Status } from "@/lib/api"
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
      listTimeline: vi.fn(),
      createComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
      getWatch: vi.fn(),
      watchIssue: vi.fn(),
      unwatchIssue: vi.fn(),
    },
  }
})

const { poll } = vi.hoisted(() => ({
  poll: {
    /** Every mounted polling surface (issue list + open detail activity). */
    handlers: new Set<() => void | Promise<void>>(),
    enabled: false,
  },
}))

vi.mock("@/hooks/use-polling", () => ({
  usePolling: (
    callback: () => void | Promise<void>,
    options?: { enabled?: boolean }
  ) => {
    poll.handlers.add(callback)
    poll.enabled = options?.enabled ?? true
  },
}))

const listStatuses = vi.mocked(api.listStatuses)
const listIssues = vi.mocked(api.listIssues)
const listMembers = vi.mocked(api.listMembers)
const listLabels = vi.mocked(api.listLabels)
const listSubtasks = vi.mocked(api.listSubtasks)
const updateIssue = vi.mocked(api.updateIssue)

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
  description: null,
  statusId: "st-1",
  priority: "High",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: [],
}

const secondIssue: Issue = {
  ...baseIssue,
  id: "is-2",
  number: 2,
  identifier: "WEB-2",
  title: "Ship homepage",
  statusId: "st-2",
  priority: "Low",
  assigneeId: "user-member",
}

function setup(issues: Issue[] = [baseIssue, secondIssue]) {
  listStatuses.mockResolvedValue(statuses)
  listMembers.mockResolvedValue([])
  listLabels.mockResolvedValue([])
  listSubtasks.mockResolvedValue([])
  listIssues.mockResolvedValue(issues)
  vi.mocked(api.listTimeline).mockResolvedValue({
    items: [],
    nextCursor: null,
  })
  vi.mocked(api.getWatch).mockResolvedValue({ watching: false })
  poll.handlers.clear()
  poll.enabled = false
  return render(
    <ProjectIssues project={project} userId="user-a" canWrite={true} />
  )
}

/** Drive one poll with a server response, like the 30 s timer would. */
async function runPoll(rows: Issue[]) {
  listIssues.mockResolvedValueOnce(rows)
  await act(async () => {
    await Promise.all([...poll.handlers].map((handler) => handler()))
  })
}

describe("project issues views", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test("list, table, and kanban share one filter bar", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    async function openViews() {
      await user.click(screen.getByRole("button", { name: /^filters/i }))
    }

    await openViews()
    expect(
      screen.getByRole("tablist", { name: "Issue views" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("tablist", { name: "Issue filter presets" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Table" }))
    expect(
      screen.getByRole("button", { name: /^filters/i })
    ).toBeInTheDocument()
    expect(screen.getByTestId("issue-row-WEB-1")).toBeInTheDocument()

    await openViews()
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    expect(
      screen.getByRole("button", { name: /^filters/i })
    ).toBeInTheDocument()
    expect(screen.getByTestId("kanban-card-WEB-1")).toBeInTheDocument()
  })

  test("the selected view persists per user per project across reloads", async () => {
    const user = userEvent.setup()
    const first = setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    await screen.findByTestId("kanban-card-WEB-1")
    expect(localStorage.getItem("zconnect:issue-view:user-a:pr-1")).toBe(
      "kanban"
    )

    first.unmount()
    setup()
    expect(await screen.findByTestId("kanban-card-WEB-1")).toBeInTheDocument()
  })

  test("an unknown stored view lands on List", async () => {
    localStorage.setItem("zconnect:issue-view:user-a:pr-1", "grid")
    setup()
    await screen.findByText("WEB-1")
    expect(screen.queryByTestId("kanban-card-WEB-1")).not.toBeInTheDocument()
  })

  test("filters narrow list, table, and kanban identically", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")
    listIssues.mockResolvedValue([baseIssue])

    // Widen to All Issues, then narrow to the Backlog status by hand.
    await user.click(screen.getByRole("tab", { name: "All Issues" }))
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("button", { name: "Backlog" }))
    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: ["st-1"] })
      )
    )
    await waitFor(() =>
      expect(screen.queryByText("Ship homepage")).not.toBeInTheDocument()
    )

    await user.click(screen.getByRole("tab", { name: "Table" }))
    await waitFor(() =>
      expect(screen.getByTestId("issue-row-WEB-1")).toBeInTheDocument()
    )
    expect(screen.queryByTestId("issue-row-WEB-2")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    await waitFor(() =>
      expect(screen.getByTestId("kanban-card-WEB-1")).toBeInTheDocument()
    )
    expect(screen.queryByTestId("kanban-card-WEB-2")).not.toBeInTheDocument()
  })

  test("a table cell edit patches the issue", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...baseIssue, priority: "Urgent" })
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Table" }))
    const row = await screen.findByTestId("issue-row-WEB-1")
    await user.click(
      within(row).getByRole("button", { name: "Priority for WEB-1" })
    )
    // The option name reads "UrgentUrgent" (icon label + text); match loosely.
    await user.click(screen.getByRole("menuitemradio", { name: /Urgent/ }))

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", {
        priority: "Urgent",
      })
    )
  })

  test("a table title opens the detail instead of editing inline", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Table" }))
    const row = await screen.findByTestId("issue-row-WEB-1")
    await user.click(
      within(row).getByRole("button", { name: /open detail for WEB-1/i })
    )

    expect(
      await screen.findByRole("button", { name: /back to issues/i })
    ).toBeInTheDocument()
  })

  test("a kanban move updates optimistically before the server answers", async () => {
    const user = userEvent.setup()
    let resolveUpdate!: (issue: Issue) => void
    updateIssue.mockReturnValueOnce(
      new Promise<Issue>((resolve) => {
        resolveUpdate = resolve
      })
    )
    setup([baseIssue])
    await screen.findByText("WEB-1")

    // Active preset hides the terminal Shipped column; show all boards first.
    await user.click(screen.getByRole("tab", { name: "All Issues" }))
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    await screen.findByTestId("kanban-card-WEB-1")
    await user.click(
      screen.getByRole("button", { name: /move WEB-1 to status/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { statusId: "st-2" })
    )
    const shipped = screen.getByTestId("kanban-column-st-2")
    expect(within(shipped).getByText("Fix login")).toBeInTheDocument()

    resolveUpdate({ ...baseIssue, statusId: "st-2" })
    await waitFor(() =>
      expect(within(shipped).getByText("Fix login")).toBeInTheDocument()
    )
  })

  test("a conflicting move resolves last-write-wins with a visible toast", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...baseIssue, statusId: "st-1" })
    setup([baseIssue])
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    await screen.findByTestId("kanban-card-WEB-1")
    await user.click(
      screen.getByRole("button", { name: /move WEB-1 to status/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(await screen.findByText(/conflict resolved/i)).toBeInTheDocument()
    const backlog = screen.getByTestId("kanban-column-st-1")
    expect(within(backlog).getByText("Fix login")).toBeInTheDocument()
  })

  test("a failed move rolls back and shows the error", async () => {
    const user = userEvent.setup()
    updateIssue.mockRejectedValueOnce(new Error("Move failed"))
    setup([baseIssue])
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))
    await screen.findByTestId("kanban-card-WEB-1")
    await user.click(
      screen.getByRole("button", { name: /move WEB-1 to status/i })
    )
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(await screen.findByText(/move failed/i)).toBeInTheDocument()
    const backlog = screen.getByTestId("kanban-column-st-1")
    expect(within(backlog).getByText("Fix login")).toBeInTheDocument()
  })

  test("a poll picks up an insert without a filter re-query", async () => {
    setup([baseIssue])
    await screen.findByText("WEB-1")
    expect(poll.enabled).toBe(true)

    await runPoll([baseIssue, { ...secondIssue, statusId: "st-1" }])

    expect(await screen.findByText("WEB-2")).toBeInTheDocument()
    expect(screen.queryByText(/loading issues/i)).not.toBeInTheDocument()
  })

  test("a poll applies a remote update in place", async () => {
    setup([baseIssue])
    await screen.findByText("Fix login")

    await runPoll([{ ...baseIssue, title: "Fix login faster" }])

    expect(await screen.findByText("Fix login faster")).toBeInTheDocument()
  })

  test("a stale poll keeps the newer row and toasts the conflict", async () => {
    setup([
      {
        ...baseIssue,
        title: "Newer",
        updatedAt: "2026-10-15T12:00:00.000Z",
      },
    ])
    await screen.findByText("Newer")

    await runPoll([
      {
        ...baseIssue,
        title: "Older",
        updatedAt: "2026-10-15T11:00:00.000Z",
      },
    ])

    await waitFor(() => expect(screen.getByText("Newer")).toBeInTheDocument())
    expect(screen.queryByText("Older")).not.toBeInTheDocument()
    expect(await screen.findByText(/conflict resolved/i)).toBeInTheDocument()
  })

  test("a poll while editing holds the row behind the conflict banner", async () => {
    const user = userEvent.setup()
    setup([baseIssue])
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )
    await user.click(
      await screen.findByRole("button", { name: /edit title for WEB-1/i })
    )
    await user.type(screen.getByLabelText(/title for WEB-1/i), " and faster")

    await runPoll([{ ...baseIssue, title: "Changed elsewhere" }])

    expect(
      await screen.findByTestId("conflict-banner-WEB-1")
    ).toBeInTheDocument()
    expect(screen.queryByText("Changed elsewhere")).not.toBeInTheDocument()
  })

  test("a poll refreshes an open subtask footer", async () => {
    const user = userEvent.setup()
    const child: Issue = {
      ...baseIssue,
      id: "is-2",
      number: 2,
      identifier: "WEB-2",
      title: "Split it",
      parentId: "is-1",
    }
    setup([baseIssue])
    vi.mocked(api.listSubtasks).mockResolvedValue([child])
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )
    expect(await screen.findByText("Split it")).toBeInTheDocument()

    await runPoll([baseIssue, { ...child, title: "Split it now" }])

    expect(await screen.findByText("Split it now")).toBeInTheDocument()
  })
})
