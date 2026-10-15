import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Project, type Workspace } from "@/lib/api"
import { App } from "./App.js"

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "user-1", email: "dev@example.com" } },
    isPending: false,
  }),
  signOut: vi.fn(),
}))

// Mock only the network seam; keep the pure helpers (schema/merge/filter)
// real so the shell is exercised through its real hooks.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkspaces: vi.fn(),
      createWorkspace: vi.fn(),
      listProjects: vi.fn(),
      listStatuses: vi.fn(),
      listIssues: vi.fn(),
      listMembers: vi.fn(),
      listLabels: vi.fn(),
      listSubtasks: vi.fn(),
    },
  }
})

const listWorkspaces = vi.mocked(api.listWorkspaces)
const createWorkspace = vi.mocked(api.createWorkspace)
const listProjects = vi.mocked(api.listProjects)

const workspaces: Workspace[] = [
  { id: "ws-1", name: "Acme", role: "Owner" },
  { id: "ws-2", name: "Beta", role: "Member" },
]

const acmeProjects: Project[] = [
  { id: "pr-1", workspaceId: "ws-1", name: "Web", key: "WEB" },
  { id: "pr-2", workspaceId: "ws-1", name: "Mobile", key: "MOB" },
]

const betaProjects: Project[] = [
  { id: "pr-3", workspaceId: "ws-2", name: "Beta App", key: "BET" },
]

function renderShell() {
  const utils = render(<App />)
  const rail = () => within(utils.getByTestId("rail"))
  return { ...utils, rail }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  listWorkspaces.mockResolvedValue(workspaces)
  listProjects.mockImplementation(async (workspaceId: string) =>
    workspaceId === "ws-1"
      ? acmeProjects
      : workspaceId === "ws-2"
        ? betaProjects
        : []
  )
  vi.mocked(api.listStatuses).mockResolvedValue([])
  vi.mocked(api.listIssues).mockResolvedValue([])
  vi.mocked(api.listMembers).mockResolvedValue([])
  vi.mocked(api.listLabels).mockResolvedValue([])
  vi.mocked(api.listSubtasks).mockResolvedValue([])
})

describe("rail IA", () => {
  test("shows the selected workspace in the dropdown and drops the flat list", async () => {
    const { rail } = renderShell()

    const trigger = await screen.findByTestId("rail-workspace-trigger")
    expect(within(trigger).getByText("Acme")).toBeInTheDocument()
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    // The menu is closed: no other workspace is on screen, and the old
    // flat "Workspaces" section (a group) is gone.
    expect(rail().queryByText("Beta")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("group", { name: /workspaces/i })
    ).not.toBeInTheDocument()
  })

  test("opens the dropdown and switches workspace; the main column follows", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    await user.click(screen.getByTestId("rail-workspace-trigger"))
    await user.click(rail().getByRole("menuitemradio", { name: /beta/i }))

    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("ws-2"))
    expect(
      within(screen.getByTestId("rail-workspace-trigger")).getByText("Beta")
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("heading", { name: /beta app/i })
    ).toBeInTheDocument()
  })

  test("creates a workspace from inside the dropdown and switches to it", async () => {
    const user = userEvent.setup()
    const created: Workspace = { id: "ws-3", name: "Gamma", role: "Owner" }
    createWorkspace.mockResolvedValue(created)
    listWorkspaces
      .mockResolvedValueOnce(workspaces)
      .mockResolvedValue([...workspaces, created])

    const { rail } = renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    await user.click(screen.getByTestId("rail-workspace-trigger"))
    await user.click(rail().getByRole("menuitem", { name: /new workspace/i }))

    await user.type(rail().getByLabelText(/workspace name/i), "Gamma")
    await user.click(rail().getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith("Gamma"))
    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("ws-3"))
  })

  test("expands one project at a time and the main column tracks the selection", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()

    const web = await rail().findByRole("button", { name: /web/i })
    const mobile = rail().getByRole("button", { name: /mobile/i })
    expect(web).toHaveAttribute("aria-expanded", "true")
    expect(mobile).toHaveAttribute("aria-expanded", "false")
    expect(rail().getAllByRole("button", { name: /^issues$/i })).toHaveLength(1)

    await user.click(mobile)

    expect(mobile).toHaveAttribute("aria-expanded", "true")
    expect(web).toHaveAttribute("aria-expanded", "false")
    // Exactly one project is open, so exactly one Issues row.
    expect(rail().getAllByRole("button", { name: /^issues$/i })).toHaveLength(1)
    expect(
      await screen.findByRole("heading", { name: /mobile/i })
    ).toBeInTheDocument()
  })

  test("collapses the selected project but the main column still tracks it", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()

    const web = await rail().findByRole("button", { name: /web/i })
    await user.click(web)

    expect(web).toHaveAttribute("aria-expanded", "false")
    expect(
      rail().queryByRole("button", { name: /^issues$/i })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /web/i })).toBeInTheDocument()
  })

  test("the Issues child row opens the project's issues screen", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()

    // Expand a project that is not the auto-selected first one.
    await user.click(await rail().findByRole("button", { name: /mobile/i }))
    await user.click(rail().getByRole("button", { name: /^issues$/i }))

    expect(
      await screen.findByRole("heading", { name: /mobile/i })
    ).toBeInTheDocument()
    // The content view tabs live in the main column, never in the rail.
    expect(
      await screen.findByRole("tab", { name: /table/i })
    ).toBeInTheDocument()
  })

  test("Home is disabled with its hint and is never a live link", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    const home = rail().getByRole("button", { name: /home/i })
    expect(home).toBeDisabled()
    expect(home).toHaveAttribute("title", "Dashboard (soon)")
    expect(rail().getByText("Dashboard (soon)")).toBeInTheDocument()
    expect(
      rail().queryByRole("link", { name: /home/i })
    ).not.toBeInTheDocument()

    await user.click(home)
    expect(screen.getByRole("heading", { name: /web/i })).toBeInTheDocument()
  })

  test("Board and Table stay content view-tabs, not rail children", async () => {
    const { rail } = renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    expect(rail().queryByText("Board")).not.toBeInTheDocument()
    expect(rail().queryByText("Table")).not.toBeInTheDocument()
    expect(
      rail().queryByRole("tab", { name: /table/i })
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("tab", { name: /table/i })
    ).toBeInTheDocument()
  })

  test("keeps the collapsible section surfaces", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()

    const toggle = await rail().findByRole("button", { name: /projects/i })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await rail().findByRole("button", { name: /web/i })

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(
      rail().queryByRole("button", { name: /web/i })
    ).not.toBeInTheDocument()
  })
})
