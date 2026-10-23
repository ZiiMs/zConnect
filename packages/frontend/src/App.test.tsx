import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  api,
  type InvitationDetails,
  type Issue,
  type Member,
  type Project,
  type Workspace,
} from "@/lib/api"
import { App } from "./App.js"

const authState = vi.hoisted(() => ({
  user: { id: "user-1", email: "dev@example.com" } as {
    id: string
    email: string
    name?: string
    image?: string | null
  } | null,
}))

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: authState.user ? { user: authState.user } : null,
    isPending: false,
  }),
  signOut: vi.fn(),
  authClient: { linkSocial: vi.fn() },
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
      createProject: vi.fn(),
      listProjects: vi.fn(),
      listStatuses: vi.fn(),
      listIssues: vi.fn(),
      listMembers: vi.fn(),
      listLabels: vi.fn(),
      listSubtasks: vi.fn(),
      listNotifications: vi.fn(),
      markNotificationRead: vi.fn(),
      markAllNotificationsRead: vi.fn(),
      unreadNotificationCount: vi.fn(),
      getNotificationSettings: vi.fn(),
      updateNotificationSettings: vi.fn(),
      listMyIssues: vi.fn(),
      getInvitation: vi.fn(),
      acceptInvitation: vi.fn(),
      getGitHubConnection: vi.fn(),
      connectGitHubConnection: vi.fn(),
      disconnectGitHubConnection: vi.fn(),
      searchGitHubRepositories: vi.fn(),
      setGitHubAllowlist: vi.fn(),
      getProjectRepositories: vi.fn(),
      setProjectRepositories: vi.fn(),
      listPullRequests: vi.fn(),
      listGitHubIssues: vi.fn(),
      refreshGitHub: vi.fn(),
      getGitHubStatus: vi.fn(),
      linkGitHubItem: vi.fn(),
      deleteExternalLink: vi.fn(),
    },
  }
})

const listWorkspaces = vi.mocked(api.listWorkspaces)
const createWorkspace = vi.mocked(api.createWorkspace)
const createProject = vi.mocked(api.createProject)
const listProjects = vi.mocked(api.listProjects)
const getInvitation = vi.mocked(api.getInvitation)
const acceptInvitation = vi.mocked(api.acceptInvitation)
const getGitHubConnection = vi.mocked(api.getGitHubConnection)
const getProjectRepositories = vi.mocked(api.getProjectRepositories)
const listPullRequests = vi.mocked(api.listPullRequests)
const listGitHubIssues = vi.mocked(api.listGitHubIssues)
const refreshGitHub = vi.mocked(api.refreshGitHub)
const linkGitHubItem = vi.mocked(api.linkGitHubItem)

const githubViewResponse = {
  items: [
    {
      id: "pr-row-12",
      repositoryId: "repo-1",
      number: 12,
      title: "Add the GitHub View",
      state: "open" as const,
      draft: false,
      authorLogin: "octocat",
      authorAvatarUrl: null,
      url: "https://github.com/acme/web/pull/12",
      sourceBranch: "feature/github-view",
      targetBranch: "main",
      checksState: "success",
      reviewDecision: "approved",
      commentCount: 2,
      bodyExcerpt: null,
      githubCreatedAt: "2026-10-01T10:00:00.000Z",
      githubUpdatedAt: "2026-10-02T11:00:00.000Z",
      mergedAt: null,
      closedAt: null,
      syncedAt: "2026-10-10T12:00:00.000Z",
      repository: "acme/web",
      linkedIssues: [],
    },
  ],
  nextCursor: null,
  lastSyncedAt: "2026-10-10T12:00:00.000Z",
  connection: { status: "active" as const, login: "octocat" },
  repositories: [
    {
      id: "repo-1",
      fullName: "acme/web",
      issuesEnabled: true,
      unavailable: false,
    },
  ],
  filters: { authors: ["octocat"], labels: [] },
}

const githubIssueViewResponse = {
  items: [
    {
      id: "issue-row-5",
      repositoryId: "repo-1",
      number: 5,
      title: "Login redirect loops",
      state: "open" as const,
      authorLogin: "hubot",
      authorAvatarUrl: null,
      url: "https://github.com/acme/web/issues/5",
      labels: [{ name: "bug", color: "d73a4a" }],
      assignees: [{ login: "octocat", avatarUrl: null }],
      commentCount: 3,
      bodyExcerpt: null,
      githubCreatedAt: "2026-10-01T09:00:00.000Z",
      githubUpdatedAt: "2026-10-05T11:00:00.000Z",
      closedAt: null,
      syncedAt: "2026-10-10T12:00:00.000Z",
      repository: "acme/web",
      linkedIssues: [],
    },
  ],
  nextCursor: null,
  lastSyncedAt: "2026-10-10T12:00:00.000Z",
  connection: { status: "active" as const, login: "octocat" },
  repositories: [
    {
      id: "repo-1",
      fullName: "acme/web",
      issuesEnabled: true,
      unavailable: false,
    },
  ],
  filters: {
    authors: ["hubot"],
    labels: [{ name: "bug", color: "d73a4a" }],
  },
}

const workspaces: Workspace[] = [
  { id: "ws-1", name: "Acme", role: "Owner" },
  { id: "ws-2", name: "Beta", role: "Member" },
]

const acmeProjects: Project[] = [
  {
    id: "pr-1",
    workspaceId: "ws-1",
    name: "Web",
    key: "WEB",
    icon: "Folder",
    color: "#94a3b8",
  },
  {
    id: "pr-2",
    workspaceId: "ws-1",
    name: "Mobile",
    key: "MOB",
    icon: "Rocket",
    color: "#f2c94c",
  },
]

const betaProjects: Project[] = [
  {
    id: "pr-3",
    workspaceId: "ws-2",
    name: "Beta App",
    key: "BET",
    icon: "Globe",
    color: "#5e6ad2",
  },
]

function renderShell() {
  const utils = render(<App />)
  const rail = () => within(utils.getByTestId("rail"))
  return { ...utils, rail }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, "", "/")
  authState.user = { id: "user-1", email: "dev@example.com" }
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
  vi.mocked(api.unreadNotificationCount).mockResolvedValue({ count: 0 })
  vi.mocked(api.listNotifications).mockResolvedValue({
    notifications: [],
    nextCursor: null,
    unreadCount: 0,
  })
  vi.mocked(api.listMyIssues).mockResolvedValue([])
  vi.mocked(api.getGitHubConnection).mockResolvedValue({
    connection: null,
    repositories: [],
  })
  getProjectRepositories.mockResolvedValue({
    items: [],
    connection: null,
  })
  listPullRequests.mockResolvedValue(githubViewResponse)
  listGitHubIssues.mockResolvedValue(githubIssueViewResponse)
  refreshGitHub.mockResolvedValue({
    accepted: true,
    enqueued: 1,
    lastSyncedAt: "2026-10-10T12:00:00.000Z",
  })
  vi.mocked(api.getGitHubStatus).mockResolvedValue({
    connection: { status: "active", login: "octocat" },
    repositories: githubViewResponse.repositories,
    lastSyncedAt: githubViewResponse.lastSyncedAt,
  })
  linkGitHubItem.mockResolvedValue({
    link: {
      id: "link-1",
      issueId: "issue-1",
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/12",
      title: "Add the GitHub View",
      state: "open",
    },
    issue: { id: "issue-1", identifier: "WEB-2", title: "Target issue" },
    linkedIssues: [],
  })
})

describe("rail IA", () => {
  test("single rail: dropdown switches workspaces, no extra serverbar", async () => {
    const { rail } = renderShell()

    // One rail only — no separate server strip.
    expect(screen.queryByTestId("serverbar")).not.toBeInTheDocument()

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
    renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    await user.click(screen.getByTestId("rail-workspace-trigger"))
    await user.click(screen.getByRole("menuitemradio", { name: /beta/i }))

    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("ws-2"))
    expect(
      within(screen.getByTestId("rail-workspace-trigger")).getByText("Beta")
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("heading", { name: /beta app/i })
    ).toBeInTheDocument()
  })

  test("main column uses the entire screen width", async () => {
    const { container } = renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    const main = container.querySelector("main > div")
    expect(main).toBeInTheDocument()
    expect(main).not.toHaveClass("max-w-5xl")
    expect(main).not.toHaveClass("mx-auto")
  })

  test("creates a workspace from the dropdown modal and switches to it", async () => {
    const user = userEvent.setup()
    const created: Workspace = { id: "ws-3", name: "Gamma", role: "Owner" }
    createWorkspace.mockResolvedValue(created)
    listWorkspaces
      .mockResolvedValueOnce(workspaces)
      .mockResolvedValue([...workspaces, created])

    renderShell()
    await screen.findByTestId("rail-workspace-trigger")

    await user.click(screen.getByTestId("rail-workspace-trigger"))
    await user.click(screen.getByRole("menuitem", { name: /new workspace/i }))

    await user.type(screen.getByLabelText(/workspace name/i), "Gamma")
    await user.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith("Gamma"))
    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("ws-3"))
  })

  test("creates a project from the full-width creation view", async () => {
    const user = userEvent.setup()
    const created: Project = {
      id: "pr-9",
      workspaceId: "ws-1",
      name: "API",
      key: "API",
      icon: "Folder",
      color: "#94a3b8",
    }
    createProject.mockResolvedValue(created)
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    // The rail stays visible; only the main column swaps to the form.
    await user.click(rail().getByRole("button", { name: /new project/i }))
    expect(
      screen.getByRole("region", { name: "New project" })
    ).toBeInTheDocument()
    expect(rail().getByRole("button", { name: /web/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/project name/i), "API")
    const key = screen.getByLabelText(/project key/i)
    await user.clear(key)
    await user.type(key, "API")
    await user.click(screen.getByRole("button", { name: /create project/i }))

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({ name: "API", key: "API" })
      )
    )
  })

  test("backing out of creation returns to the project", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /new project/i }))
    expect(
      screen.getByRole("region", { name: "New project" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /back/i }))

    expect(
      screen.queryByRole("region", { name: "New project" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /web/i })).toBeInTheDocument()
  })

  test("expands one project at a time and the main column tracks the selection", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()

    const web = await rail().findByRole("button", { name: /web/i })
    const mobile = rail().getByRole("button", { name: /mobile/i })
    // Each project row carries its mark in its color.
    expect(rail().getByTestId("project-icon-Folder")).toBeInTheDocument()
    expect(rail().getByTestId("project-icon-Rocket")).toBeInTheDocument()
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
    // The content view tabs live in the main column's Filters popover,
    // never in the rail.
    await user.click(screen.getByRole("button", { name: /^filters/i }))
    expect(
      await screen.findByRole("tab", { name: /table/i })
    ).toBeInTheDocument()
  })

  test("rail replaces Home with live My Issues and Inbox entries", async () => {
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    expect(rail().queryByText("Dashboard (soon)")).not.toBeInTheDocument()
    expect(
      rail().queryByRole("button", { name: /home/i })
    ).not.toBeInTheDocument()
    expect(rail().getByRole("button", { name: /my issues/i })).toBeEnabled()
    expect(rail().getByRole("button", { name: /inbox/i })).toBeEnabled()
  })

  test("My Issues opens its view and fetches the assigned tab", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /my issues/i }))

    expect(
      await screen.findByRole("heading", { name: "My Issues" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(api.listMyIssues).toHaveBeenCalledWith("assigned")
    )
    expect(
      await screen.findByText("Nothing assigned to you.")
    ).toBeInTheDocument()
  })

  test("Inbox opens its view and fetches notifications", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /inbox/i }))

    expect(
      await screen.findByRole("heading", { name: "Inbox" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(api.listNotifications).toHaveBeenCalledWith({ filter: "all" })
    )
    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument()
  })

  test("the Inbox badge shows unread notifications and caps at 99+", async () => {
    vi.mocked(api.unreadNotificationCount).mockResolvedValue({ count: 120 })
    renderShell()

    expect(await screen.findByTestId("inbox-unread-badge")).toHaveTextContent(
      "99+"
    )
  })

  test("the Inbox badge is hidden when nothing is unread", async () => {
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })
    await waitFor(() => expect(api.unreadNotificationCount).toHaveBeenCalled())

    expect(screen.queryByTestId("inbox-unread-badge")).not.toBeInTheDocument()
  })

  test("selecting a project from My Issues returns to the project view", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    const web = await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /my issues/i }))
    expect(
      await screen.findByRole("heading", { name: "My Issues" })
    ).toBeInTheDocument()

    await user.click(web)

    expect(
      await screen.findByRole("heading", { name: /web/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "My Issues" })
    ).not.toBeInTheDocument()
  })

  test("Settings exposes the Notifications tab and its email modes", async () => {
    const user = userEvent.setup()
    vi.mocked(api.getNotificationSettings).mockResolvedValue({
      emailMode: "digest",
    })
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /settings/i }))
    await user.click(
      await rail().findByRole("button", { name: /^notifications$/i })
    )

    expect(await screen.findByRole("radio", { name: /digest/i })).toBeChecked()
    expect(
      screen.getByRole("radio", { name: /immediate/i })
    ).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /off/i })).toBeInTheDocument()
  })

  test("Board and Table stay content view-tabs, not rail children", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    expect(rail().queryByText("Board")).not.toBeInTheDocument()
    expect(rail().queryByText("Table")).not.toBeInTheDocument()
    expect(
      rail().queryByRole("tab", { name: /table/i })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^filters/i }))
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

const inviteDetails: InvitationDetails = {
  id: "inv-1",
  email: "dev@example.com",
  role: "Member",
  expiresAt: "2030-01-15T12:00:00.000Z",
  workspace: { id: "ws-1", name: "Acme" },
  inviter: { id: "user-2", name: "Ada", email: "ada@example.com" },
}

const inviteMembership: Member = {
  workspaceId: "ws-1",
  userId: "user-1",
  role: "Member",
  name: "Dev",
}

describe("invite route", () => {
  test("signed-out invite links show the auth form, not the shell", async () => {
    authState.user = null
    window.history.replaceState(null, "", "/invite/inv-1")
    render(<App />)

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to accept your invitation",
      })
    ).toBeInTheDocument()
    expect(screen.queryByTestId("rail")).not.toBeInTheDocument()
    expect(getInvitation).not.toHaveBeenCalled()
  })

  test("signed-in invite links render the accept page outside the shell", async () => {
    window.history.replaceState(null, "", "/invite/inv-1")
    getInvitation.mockResolvedValue(inviteDetails)
    render(<App />)

    expect(await screen.findByText("Acme")).toBeInTheDocument()
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Member")).toBeInTheDocument()
    expect(screen.getByTestId("invite-page")).toBeInTheDocument()
    expect(screen.queryByTestId("rail")).not.toBeInTheDocument()
  })

  test("joining refreshes workspaces and navigates to the workspace path", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/invite/inv-1")
    getInvitation.mockResolvedValue(inviteDetails)
    acceptInvitation.mockResolvedValue(inviteMembership)
    render(<App />)
    await screen.findByText("Acme")

    await user.click(screen.getByRole("button", { name: /join workspace/i }))

    // The workspace home canonicalizes to its open project once loaded.
    await waitFor(() => expect(window.location.pathname).toBe("/acme/WEB"))
    expect(acceptInvitation).toHaveBeenCalledWith("inv-1")
    expect(listWorkspaces.mock.calls.length).toBeGreaterThan(1)
  })
})

describe("URL as the state store", () => {
  test("rail navigation pushes workspace-scoped URLs", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })
    // Landing canonicalizes from `/` to the open project.
    await waitFor(() => expect(window.location.pathname).toBe("/acme/WEB"))

    await user.click(rail().getByRole("button", { name: /my issues/i }))
    expect(
      await screen.findByRole("heading", { name: "My Issues" })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/my-issues")

    await user.click(rail().getByRole("button", { name: /^inbox$/i }))
    expect(
      await screen.findByRole("heading", { name: "Inbox" })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/inbox")

    await user.click(rail().getByRole("button", { name: /settings/i }))
    expect(
      await screen.findByRole("region", { name: "Workspace" })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/settings")
    expect(
      rail().getByRole("button", { name: /back to app/i })
    ).toBeInTheDocument()
    expect(
      rail().queryByRole("button", { name: /new project/i })
    ).not.toBeInTheDocument()

    await user.click(rail().getByRole("button", { name: /back to app/i }))
    await user.click(rail().getByRole("button", { name: /new project/i }))
    expect(
      screen.getByRole("region", { name: "New project" })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/new-project")
  })

  test("switching projects pushes the project URL", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /mobile/i })
    await waitFor(() => expect(window.location.pathname).toBe("/acme/WEB"))

    await user.click(rail().getByRole("button", { name: /mobile/i }))
    await user.click(rail().getByRole("button", { name: /^issues$/i }))
    expect(
      await screen.findByRole("heading", { name: /mobile/i })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/MOB")
  })

  test("settings tabs push their URLs", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /settings/i }))
    expect(
      await screen.findByRole("region", { name: "Workspace" })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/settings")
    // The bare URL is the index homepage, organized by category.
    expect(screen.getByRole("region", { name: "Issues" })).toBeInTheDocument()

    // The index list navigates like the sidebar.
    await user.click(screen.getByRole("button", { name: /manage members/i }))
    expect(window.location.pathname).toBe("/acme/settings/members")

    await user.click(rail().getByRole("button", { name: /^workflow$/i }))
    expect(window.location.pathname).toBe("/acme/settings/workflow")

    await user.click(rail().getByRole("button", { name: /^labels$/i }))
    expect(window.location.pathname).toBe("/acme/settings/labels")
    expect(
      await screen.findByRole("region", { name: "Labels" })
    ).toBeInTheDocument()

    await user.click(rail().getByRole("button", { name: /^general$/i }))
    expect(window.location.pathname).toBe("/acme/settings/general")
  })

  test("settings connections renders the GitHub surface", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /settings/i }))
    await user.click(rail().getByRole("button", { name: /^github$/i }))

    expect(window.location.pathname).toBe("/acme/settings/connections")
    expect(
      await screen.findByRole("region", { name: "GitHub connection" })
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/GitHub is not connected/i)
    ).toBeInTheDocument()
    expect(getGitHubConnection).toHaveBeenCalledWith("ws-1")
  })

  test("settings connections shows the active connection and picker", async () => {
    vi.mocked(api.getGitHubConnection).mockResolvedValue({
      connection: {
        id: "gc-1",
        workspaceId: "ws-1",
        connectorUserId: "user-1",
        connectorAccountId: "ba-1",
        login: "octocat",
        scopes: ["repo"],
        status: "active",
        lastSyncedAt: new Date(Date.now() - 60_000).toISOString(),
        lastManualRefreshAt: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        connectorName: "Ada",
        repositoryCount: 1,
      },
      repositories: [],
    })
    vi.mocked(api.searchGitHubRepositories).mockResolvedValue({
      items: [
        {
          githubId: "101",
          fullName: "acme/web",
          owner: "acme",
          name: "web",
          private: true,
          archived: false,
          issuesEnabled: true,
          defaultBranch: "main",
          pushedAt: null,
          selected: false,
        },
      ],
    })
    window.history.replaceState(null, "", "/acme/settings/connections")
    renderShell()

    expect(await screen.findByText("octocat")).toBeInTheDocument()
    expect(screen.getByText(/active/i)).toBeInTheDocument()
    expect(
      await screen.findByRole("checkbox", { name: "acme/web" })
    ).toBeInTheDocument()
    expect(screen.getByText("Private")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /disconnect GitHub/i })
    ).toBeInTheDocument()
  })

  test("a member sees the settings state without controls", async () => {
    vi.mocked(api.getGitHubConnection).mockResolvedValue({
      connection: {
        id: "gc-2",
        workspaceId: "ws-2",
        connectorUserId: "user-owner",
        connectorAccountId: "ba-1",
        login: "octocat",
        scopes: ["repo"],
        status: "reconnect_required",
        lastSyncedAt: null,
        lastManualRefreshAt: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        connectorName: "Ada",
        repositoryCount: 1,
      },
      repositories: [
        {
          id: "repo-1",
          connectionId: "gc-2",
          githubId: "101",
          fullName: "beta/app",
          owner: "beta",
          name: "app",
          private: false,
          archived: false,
          issuesEnabled: true,
          defaultBranch: "main",
          pushedAt: null,
          selectedAt: "2026-10-01T00:00:00.000Z",
          lastSyncedAt: null,
          syncError: null,
          unavailable: false,
        },
      ],
    })
    window.history.replaceState(null, "", "/beta/settings/connections")
    renderShell()

    expect(await screen.findByText("octocat")).toBeInTheDocument()
    expect(screen.getByText(/reconnect required/i)).toBeInTheDocument()
    expect(screen.getByText("beta/app")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /connect GitHub/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /disconnect GitHub/i })
    ).not.toBeInTheDocument()
  })

  test("settings repositories lets an admin link from the workspace allowlist", async () => {
    const user = userEvent.setup()
    const lastSyncedAt = new Date(Date.now() - 5 * 60_000).toISOString()
    const repository = {
      id: "repo-1",
      connectionId: "gc-1",
      githubId: "101",
      fullName: "acme/web",
      owner: "acme",
      name: "web",
      private: false,
      archived: false,
      issuesEnabled: true,
      defaultBranch: "main",
      pushedAt: null,
      selectedAt: "2026-10-01T00:00:00.000Z",
      lastSyncedAt,
      syncError: null,
      unavailable: false,
      linkedBy: "user-1",
      linkedAt: "2026-10-02T00:00:00.000Z",
    }
    getProjectRepositories.mockResolvedValue({
      items: [repository],
      connection: { status: "active", login: "octocat" },
    })
    getGitHubConnection.mockResolvedValue({
      connection: {
        id: "gc-1",
        workspaceId: "ws-1",
        connectorUserId: "user-1",
        connectorAccountId: "ba-1",
        login: "octocat",
        scopes: ["repo"],
        status: "active",
        lastSyncedAt: null,
        lastManualRefreshAt: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        connectorName: "Ada",
        repositoryCount: 1,
      },
      repositories: [repository],
    })
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /settings/i }))
    await user.click(rail().getByRole("button", { name: /^repositories$/i }))
    expect(window.location.pathname).toBe("/acme/settings/repositories")

    const region = await screen.findByRole("region", {
      name: "Project repositories",
    })
    expect(
      await within(region).findByRole("checkbox", { name: "acme/web" })
    ).toBeChecked()
    expect(within(region).getByText(/last synced 5m ago/i)).toBeInTheDocument()
    expect(
      within(region).getByRole("button", { name: /^save$/i })
    ).toBeInTheDocument()
    expect(getProjectRepositories).toHaveBeenCalledWith("pr-1")
  })

  test("a member sees the Repositories tab read-only", async () => {
    const user = userEvent.setup()
    getProjectRepositories.mockResolvedValue({
      items: [
        {
          id: "repo-3",
          connectionId: "gc-2",
          githubId: "201",
          fullName: "beta/app",
          owner: "beta",
          name: "app",
          private: false,
          archived: false,
          issuesEnabled: true,
          defaultBranch: "main",
          pushedAt: null,
          selectedAt: "2026-10-01T00:00:00.000Z",
          lastSyncedAt: null,
          syncError: null,
          unavailable: false,
          linkedBy: "user-owner",
          linkedAt: "2026-10-02T00:00:00.000Z",
        },
      ],
      connection: { status: "active", login: "octocat" },
    })
    const { rail } = renderShell()
    await screen.findByTestId("rail-workspace-trigger")
    await user.click(screen.getByTestId("rail-workspace-trigger"))
    await user.click(screen.getByRole("menuitemradio", { name: /beta/i }))
    await waitFor(() => expect(listProjects).toHaveBeenCalledWith("ws-2"))

    await user.click(rail().getByRole("button", { name: /settings/i }))
    await user.click(rail().getByRole("button", { name: /^repositories$/i }))
    expect(window.location.pathname).toBe("/beta/settings/repositories")

    await waitFor(() =>
      expect(getProjectRepositories).toHaveBeenCalledWith("pr-3")
    )
    expect(await screen.findByText("beta/app")).toBeInTheDocument()
    expect(screen.getByText("Not synced yet")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^save$/i })
    ).not.toBeInTheDocument()
    expect(getGitHubConnection).not.toHaveBeenCalled()
  })

  test("an unlinked project points an admin at the GitHub connection", async () => {
    getProjectRepositories.mockResolvedValue({
      items: [],
      connection: null,
    })
    window.history.replaceState(null, "", "/acme/settings/repositories")
    renderShell()

    expect(
      await screen.findByText(/GitHub is not connected/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/settings → connections → github/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^save$/i })
    ).not.toBeInTheDocument()
  })

  test("settings detail pages link back to the index", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /settings/i }))
    await user.click(rail().getByRole("button", { name: /^members$/i }))
    expect(window.location.pathname).toBe("/acme/settings/members")

    await user.click(
      await screen.findByRole("button", { name: /all settings/i })
    )
    expect(window.location.pathname).toBe("/acme/settings")
    expect(
      screen.getByRole("region", { name: "Workspace" })
    ).toBeInTheDocument()
  })

  test("my-issues and inbox filters push their URLs", async () => {
    const user = userEvent.setup()
    const { rail } = renderShell()
    await rail().findByRole("button", { name: /web/i })

    await user.click(rail().getByRole("button", { name: /my issues/i }))
    expect(
      await screen.findByRole("heading", { name: "My Issues" })
    ).toBeInTheDocument()
    await user.click(await screen.findByRole("tab", { name: /^created$/i }))
    expect(window.location.pathname).toBe("/acme/my-issues/created")

    await user.click(rail().getByRole("button", { name: /^inbox$/i }))
    expect(
      await screen.findByRole("heading", { name: "Inbox" })
    ).toBeInTheDocument()
    await user.click(await screen.findByRole("tab", { name: /^unread$/i }))
    expect(window.location.pathname).toBe("/acme/inbox/unread")
  })

  test("deep links restore their page on reload", async () => {
    window.history.replaceState(null, "", "/acme/settings/labels")
    const { rail } = renderShell()
    expect(
      await screen.findByRole("region", { name: "Labels" })
    ).toBeInTheDocument()
    expect(rail().getByRole("button", { name: /^labels$/i })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  test("a project deep link selects that project", async () => {
    window.history.replaceState(null, "", "/acme/MOB")
    renderShell()
    expect(
      await screen.findByRole("heading", { name: /mobile/i })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/MOB")
  })

  test("an unknown project key falls back to the open project", async () => {
    window.history.replaceState(null, "", "/acme/NOPE")
    renderShell()
    await screen.findByTestId("rail-workspace-trigger")
    await waitFor(() => expect(window.location.pathname).toBe("/acme/WEB"))
  })

  test("a GitHub deep link renders the Pull Requests tab and keeps its URL", async () => {
    window.history.replaceState(null, "", "/acme/WEB/github")
    renderShell()

    expect(
      await screen.findByRole("heading", { name: /web github view/i })
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("tab", { name: "Pull Requests" })
    ).toHaveAttribute("aria-selected", "true")
    expect(await screen.findByText("Add the GitHub View")).toBeInTheDocument()
    expect(window.location.pathname).toBe("/acme/WEB/github")
    expect(listPullRequests).toHaveBeenCalledWith("pr-1", {
      state: "open",
      author: "",
      label: "",
      q: "",
    })
  })

  test("the Issues | GitHub nav switches between the project surfaces", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/acme/WEB")
    renderShell()
    await screen.findByRole("heading", { name: "Web" })

    await user.click(screen.getByRole("tab", { name: "GitHub" }))
    await waitFor(() =>
      expect(window.location.pathname).toBe("/acme/WEB/github")
    )
    expect(
      await screen.findByRole("heading", { name: /web github view/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "Issues" }))
    await waitFor(() => expect(window.location.pathname).toBe("/acme/WEB"))
  })

  test("GitHub View filters update the query string", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/acme/WEB/github")
    renderShell()
    await screen.findByRole("table", { name: "Pull requests" })

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Pull request state" }),
      "merged"
    )
    await waitFor(() =>
      expect(window.location.search).toContain("state=merged")
    )
    expect(window.location.pathname).toBe("/acme/WEB/github")
    expect(listPullRequests).toHaveBeenLastCalledWith(
      "pr-1",
      expect.objectContaining({ state: "merged" })
    )
  })

  test("GitHub View empty states explain missing repositories and pull requests", async () => {
    listPullRequests.mockResolvedValueOnce({
      ...githubViewResponse,
      items: [],
      repositories: [],
    })
    window.history.replaceState(null, "", "/acme/WEB/github")
    const first = renderShell()
    expect(
      await screen.findByText("No repositories are linked to this project.")
    ).toBeInTheDocument()
    first.unmount()

    listPullRequests.mockResolvedValueOnce({
      ...githubViewResponse,
      items: [],
    })
    renderShell()
    expect(
      await screen.findByText("No open pull requests.")
    ).toBeInTheDocument()
  })

  test("clicking a GitHub View row opens the Pull Request URL", async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    window.history.replaceState(null, "", "/acme/WEB/github")
    renderShell()

    await user.click(await screen.findByTestId("pull-request-row-12"))
    expect(open).toHaveBeenCalledWith(
      "https://github.com/acme/web/pull/12",
      "_blank",
      "noopener,noreferrer"
    )
    open.mockRestore()
  })

  test("a writer links a Pull Request to an Issue and sees the chip", async () => {
    const user = userEvent.setup()
    const target: Issue = {
      id: "issue-2",
      projectId: "pr-1",
      number: 2,
      keyPrefix: "WEB",
      identifier: "WEB-2",
      title: "Invite your teammates to this workspace",
      description: null,
      statusId: "status-1",
      priority: "None",
      assigneeId: null,
      dueDate: null,
      archived: false,
      labels: [],
    }
    vi.mocked(api.listIssues).mockResolvedValue([target])
    linkGitHubItem.mockResolvedValue({
      link: {
        id: "link-1",
        issueId: target.id,
        provider: "github",
        kind: "pr",
        url: "https://github.com/acme/web/pull/12",
        title: "Add the GitHub View",
        state: "open",
      },
      issue: {
        id: target.id,
        identifier: target.identifier,
        title: target.title,
      },
      linkedIssues: [
        {
          linkId: "link-1",
          issueId: target.id,
          identifier: target.identifier,
          title: target.title,
        },
      ],
    })
    window.history.replaceState(null, "", "/acme/WEB/github")
    renderShell()

    const row = await screen.findByTestId("pull-request-row-12")
    await user.click(
      within(row).getByRole("button", { name: "GitHub item actions" })
    )
    expect(
      screen.getByRole("menuitem", { name: "Open on GitHub" })
    ).toHaveAttribute("href", "https://github.com/acme/web/pull/12")
    await user.click(screen.getByRole("menuitem", { name: "Link to Issue" }))

    const dialog = await screen.findByRole("dialog")
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search issues" }),
      "WEB-2"
    )
    await waitFor(() =>
      expect(api.listIssues).toHaveBeenLastCalledWith("pr-1", {
        text: "WEB-2",
      })
    )
    await user.click(
      await within(dialog).findByRole("button", { name: /WEB-2/ })
    )
    await user.click(within(dialog).getByRole("button", { name: "Link" }))

    await waitFor(() =>
      expect(linkGitHubItem).toHaveBeenCalledWith("pr-1", {
        kind: "pr",
        repositoryId: "repo-1",
        number: 12,
        issue: "WEB-2",
      })
    )
    expect(await within(row).findByText("WEB-2")).toBeInTheDocument()
  })

  test("a Viewer reads the GitHub View without write affordances", async () => {
    listWorkspaces.mockResolvedValue([
      { id: "ws-1", name: "Acme", role: "Viewer" },
      { id: "ws-2", name: "Beta", role: "Member" },
    ])
    window.history.replaceState(null, "", "/acme/WEB/github")
    renderShell()

    expect(await screen.findByTestId("github-view")).toHaveAttribute(
      "data-can-write",
      "false"
    )
    expect(screen.queryByRole("button", { name: "New issue" })).toBeNull()
    expect(
      screen.queryByRole("button", { name: "GitHub item actions" })
    ).toBeNull()
    expect(
      await screen.findByRole("table", { name: "Pull requests" })
    ).toBeInTheDocument()
  })

  test("a GitHub Issues deep link renders the Issues tab and keeps its URL", async () => {
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    renderShell()

    expect(
      await screen.findByRole("heading", { name: /web github view/i })
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("tab", { name: "GitHub Issues" })
    ).toHaveAttribute("aria-selected", "true")
    expect(await screen.findByText("Login redirect loops")).toBeInTheDocument()
    expect(listGitHubIssues).toHaveBeenCalledWith("pr-1", {
      state: "open",
      author: "",
      label: "",
      q: "",
    })
    expect(listPullRequests).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/acme/WEB/github/issues")
  })

  test("GitHub Issues filters update the query string and keep the Issues path", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    renderShell()
    await screen.findByRole("table", { name: "GitHub issues" })

    await user.selectOptions(
      screen.getByRole("combobox", { name: "GitHub issue label" }),
      "bug"
    )
    await waitFor(() => expect(window.location.search).toContain("label=bug"))
    expect(window.location.pathname).toBe("/acme/WEB/github/issues")
    expect(listGitHubIssues).toHaveBeenLastCalledWith(
      "pr-1",
      expect.objectContaining({
        state: "open",
        label: "bug",
        author: "",
        q: "",
      })
    )
  })

  test("an Issues-disabled repository explains the empty Issues tab", async () => {
    listGitHubIssues.mockResolvedValueOnce({
      ...githubIssueViewResponse,
      items: [],
      repositories: [
        {
          id: "repo-1",
          fullName: "acme/web",
          issuesEnabled: false,
          unavailable: false,
        },
      ],
      filters: { authors: [], labels: [] },
    })
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    renderShell()

    expect(
      await screen.findByText("GitHub Issues are disabled on this repository.")
    ).toBeInTheDocument()
  })
})
