import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Issue, type Label, type Status } from "@/lib/api"
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

const listStatuses = vi.mocked(api.listStatuses)
const listIssues = vi.mocked(api.listIssues)
const listMembers = vi.mocked(api.listMembers)
const listLabels = vi.mocked(api.listLabels)
const listSubtasks = vi.mocked(api.listSubtasks)
const updateIssue = vi.mocked(api.updateIssue)
const deleteIssue = vi.mocked(api.deleteIssue)

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
  vi.mocked(api.listTimeline).mockResolvedValue({
    items: [],
    nextCursor: null,
  })
  vi.mocked(api.getWatch).mockResolvedValue({ watching: false })
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
    // A first visit lands on the Active preset: the open categories only.
    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: ["st-1"], text: "" })
      )
    )
  })

  test("narrowing the filter bar re-queries", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")
    listIssues.mockResolvedValue([issues[0]])

    await user.click(screen.getByRole("tab", { name: "All Issues" }))
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("button", { name: "Shipped" }))

    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: ["st-2"] })
      )
    )
  })

  test("toggling a status keeps stale issues mounted while re-querying", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    let resolveSecond!: (next: Issue[]) => void
    const second = new Promise<Issue[]>((resolve) => {
      resolveSecond = resolve
    })
    listIssues.mockReturnValueOnce(second)

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("button", { name: "Shipped" }))
    await waitFor(() => expect(listIssues).toHaveBeenCalledTimes(2))

    // The re-query is still in flight: stale rows stay, no full-page loader.
    expect(screen.getByText("WEB-1")).toBeInTheDocument()
    expect(screen.queryByText(/loading issues/i)).not.toBeInTheDocument()

    resolveSecond([])
    await waitFor(() =>
      expect(screen.queryByText("WEB-1")).not.toBeInTheDocument()
    )
  })

  test("filter choices persist per user per project", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("tab", { name: "All Issues" }))
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("button", { name: "Shipped" }))

    await waitFor(() =>
      expect(
        localStorage.getItem("zconnect:issue-filters:user-a:pr-1")
      ).toContain("st-2")
    )
  })

  test("group quick-add opens create-mode detail preselected to that status", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /add issue to backlog/i })
    )

    expect(screen.getByTestId("issue-create-detail")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /status for new/i })
    ).toHaveTextContent("Backlog")
  })

  test("grouping by priority regroups the list end to end", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.selectOptions(screen.getByLabelText(/grouping/i), "priority")

    expect(
      await screen.findByRole("heading", { name: "High" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Backlog" })
    ).not.toBeInTheDocument()
  })

  test("completing the lifecycle through a list action updates the row", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...issues[0], statusId: "st-2" })
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /status for WEB-1/i }))
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { statusId: "st-2" })
    )
  })

  test("a failed status change shows the error", async () => {
    const user = userEvent.setup()
    updateIssue.mockRejectedValueOnce(new Error("Invalid status"))
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("button", { name: /status for WEB-1/i }))
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

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

    await user.click(screen.getByRole("button", { name: /^filters/i }))
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

    await user.click(screen.getByRole("button", { name: /status for WEB-1/i }))
    await user.click(screen.getByRole("menuitemradio", { name: "Shipped" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/open subtask/i)
  })

  test("archiving and deleting through the detail view updates the list", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...issues[0], archived: true })
    deleteIssue.mockResolvedValue(undefined)
    setup(true, true)
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )
    const detail = await screen.findByTestId("issue-detail-WEB-1")

    await user.click(within(detail).getByRole("button", { name: /archive/i }))
    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { archived: true })
    )

    await user.click(
      within(detail).getByRole("button", { name: /delete permanently/i })
    )
    await waitFor(() => expect(deleteIssue).toHaveBeenCalledWith("WEB-1"))
    expect(screen.queryByText("WEB-1")).not.toBeInTheDocument()
  })

  test("opening detail loads the subtasks", async () => {
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

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    expect(await screen.findByText("Split it")).toBeInTheDocument()
    expect(listSubtasks).toHaveBeenCalledWith("WEB-1")
  })

  test("creating an issue happens in create-mode detail on title commit", async () => {
    const user = userEvent.setup()
    const createIssue = vi.mocked(api.createIssue)
    createIssue.mockResolvedValue({
      ...issues[0],
      id: "is-2",
      number: 2,
      identifier: "WEB-2",
      title: "New from detail",
    })
    setup()
    await screen.findByText("WEB-1")

    expect(screen.queryByLabelText(/issue title/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^new issue$/i }))
    expect(screen.getByTestId("issue-create-detail")).toBeInTheDocument()
    await user.type(screen.getByLabelText(/issue title/i), "New from detail")
    await user.keyboard("{Enter}")

    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith(
        "pr-1",
        expect.objectContaining({ title: "New from detail" })
      )
    )
    expect(await screen.findByTestId("issue-detail-WEB-2")).toBeInTheDocument()
    expect(screen.queryByTestId("issue-create-detail")).not.toBeInTheDocument()
  })
})

describe("issue filter presets and breadcrumb", () => {
  const storageKey = "zconnect:issue-filters:user-a:pr-1"
  const breadcrumb = () =>
    screen.getByRole("navigation", { name: /breadcrumb/i })
  const crumbs = () =>
    within(breadcrumb())
      .getAllByRole("button")
      .map((crumb) => crumb.textContent)

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test("a first visit lands on Active without freezing it into storage", async () => {
    setup()
    await screen.findByText("WEB-1")

    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: ["st-1"] })
      )
    )
    // The default is derived from the project's statuses, not a stored choice.
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  test("a stored preference wins over the Active default", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        statusIds: [],
        priorities: [],
        labels: [],
        text: "fix",
      })
    )
    setup()
    await screen.findByText("WEB-1")

    expect(listIssues).toHaveBeenLastCalledWith(
      "pr-1",
      expect.objectContaining({ statusIds: [], text: "fix" })
    )
    expect(screen.getByRole("tab", { name: "All Issues" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "false"
    )
  })

  test("All Issues drops the status constraint and keeps the archived default", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("tab", { name: "All Issues" }))

    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: [] })
      )
    )
    // Never a client-side archived override: the query keeps archived=false.
    expect(listIssues.mock.calls.at(-1)?.[1]).not.toHaveProperty("archived")
  })

  test("Backlog narrows the query to the Backlog category", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(screen.getByRole("tab", { name: "Backlog" }))

    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ statusIds: ["st-1"] })
      )
    )
  })

  test("the breadcrumb names the project, Issues, and the current view", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    expect(crumbs()).toEqual(["Web", "Issues", "List"])

    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Kanban" }))

    expect(crumbs()).toEqual(["Web", "Issues", "Kanban"])
  })

  test("the View crumb keeps that view", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    await user.click(screen.getByRole("tab", { name: "Table" }))
    await screen.findByTestId("issue-row-WEB-1")

    await user.click(
      within(breadcrumb()).getByRole("button", { name: "Table" })
    )

    expect(screen.getByTestId("issue-row-WEB-1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  test("the breadcrumb extends to the identifier on detail and navigates back", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")

    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    expect(crumbs()).toEqual(["Web", "Issues", "WEB-1"])
    expect(screen.getByTestId("issue-detail-WEB-1")).toBeInTheDocument()

    await user.click(
      within(breadcrumb()).getByRole("button", { name: "Issues" })
    )

    expect(screen.queryByTestId("issue-detail-WEB-1")).not.toBeInTheDocument()
    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
  })

  test("the project crumb returns to the issues root from detail", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")
    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    await user.click(within(breadcrumb()).getByRole("button", { name: "Web" }))

    expect(screen.queryByTestId("issue-detail-WEB-1")).not.toBeInTheDocument()
    expect(screen.getByTestId("issue-WEB-1")).toBeInTheDocument()
  })

  test("the identifier crumb keeps the detail it names", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("WEB-1")
    await user.click(
      screen.getByRole("button", { name: /open detail for WEB-1/i })
    )

    await user.click(
      within(breadcrumb()).getByRole("button", { name: "WEB-1" })
    )

    expect(screen.getByTestId("issue-detail-WEB-1")).toBeInTheDocument()
  })
})
