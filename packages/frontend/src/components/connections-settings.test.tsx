import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type {
  GitHubConnection,
  GitHubConnectionResponse,
  GitHubRepositoryView,
  RemoteRepositoryOption,
} from "@/lib/api"
import { ApiError, api } from "@/lib/api"
import { ConnectionsSettings } from "./connections-settings.js"

const linkSocial = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth-client", () => ({
  authClient: { linkSocial },
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getGitHubConnection: vi.fn(),
      connectGitHubConnection: vi.fn(),
      disconnectGitHubConnection: vi.fn(),
      searchGitHubRepositories: vi.fn(),
      setGitHubAllowlist: vi.fn(),
    },
  }
})

const getGitHubConnection = vi.mocked(api.getGitHubConnection)
const connectGitHubConnection = vi.mocked(api.connectGitHubConnection)
const disconnectGitHubConnection = vi.mocked(api.disconnectGitHubConnection)
const searchGitHubRepositories = vi.mocked(api.searchGitHubRepositories)
const setGitHubAllowlist = vi.mocked(api.setGitHubAllowlist)

function connection(
  overrides: Partial<GitHubConnection> = {}
): GitHubConnection {
  return {
    id: "gc-1",
    workspaceId: "ws-1",
    connectorUserId: "user-owner",
    connectorAccountId: "ba-1",
    login: "octocat",
    scopes: ["repo"],
    status: "active",
    lastSyncedAt: null,
    lastManualRefreshAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    connectorName: "Ada Lovelace",
    repositoryCount: 1,
    ...overrides,
  }
}

function repository(
  overrides: Partial<GitHubRepositoryView> = {}
): GitHubRepositoryView {
  return {
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
    lastSyncedAt: null,
    syncError: null,
    unavailable: false,
    ...overrides,
  }
}

function remote(
  overrides: Partial<RemoteRepositoryOption> = {}
): RemoteRepositoryOption {
  return {
    githubId: "101",
    fullName: "acme/web",
    owner: "acme",
    name: "web",
    private: false,
    archived: false,
    issuesEnabled: true,
    defaultBranch: "main",
    pushedAt: null,
    selected: false,
    ...overrides,
  }
}

function response(
  overrides: Partial<GitHubConnectionResponse> = {}
): GitHubConnectionResponse {
  return {
    connection: connection(),
    repositories: [repository()],
    ...overrides,
  }
}

const remoteRepositories = [
  remote(),
  remote({
    githubId: "102",
    fullName: "acme/api",
    name: "api",
    private: true,
  }),
  remote({
    githubId: "103",
    fullName: "acme/legacy",
    name: "legacy",
    archived: true,
  }),
]

beforeEach(() => {
  vi.clearAllMocks()
  linkSocial.mockReset()
  linkSocial.mockResolvedValue(undefined)
  window.history.replaceState(null, "", "/acme/settings/connections")
  getGitHubConnection.mockResolvedValue(response())
  searchGitHubRepositories.mockResolvedValue({ items: remoteRepositories })
  disconnectGitHubConnection.mockResolvedValue(undefined)
  setGitHubAllowlist.mockResolvedValue({
    repositories: [repository()],
    removed: 0,
  })
})

describe("connections settings", () => {
  test("a disconnected workspace offers Connect and starts GitHub OAuth", async () => {
    const user = userEvent.setup()
    getGitHubConnection.mockResolvedValue({
      connection: null,
      repositories: [],
    })
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    expect(
      await screen.findByText(/GitHub is not connected/i)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /connect GitHub/i }))

    expect(linkSocial).toHaveBeenCalledWith({
      provider: "github",
      scopes: ["repo"],
      callbackURL: expect.stringContaining(
        "/acme/settings/connections?linked=1"
      ),
    })
  })

  test("shows connector, status, last sync, and the read-only allowlist", async () => {
    getGitHubConnection.mockResolvedValue(
      response({
        connection: connection({
          lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        }),
        repositories: [
          repository(),
          repository({
            id: "repo-2",
            githubId: "102",
            fullName: "acme/api",
            private: true,
          }),
        ],
      })
    )
    render(<ConnectionsSettings workspaceId="ws-1" canManage={false} />)

    expect(await screen.findByText("octocat")).toBeInTheDocument()
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.getByText(/active/i)).toBeInTheDocument()
    expect(screen.getByText(/last synced 5m ago/i)).toBeInTheDocument()
    expect(screen.getByText("acme/web")).toBeInTheDocument()
    expect(screen.getByText("acme/api")).toBeInTheDocument()
    expect(screen.getByText("Private")).toBeInTheDocument()
  })

  test("reconnect_required surfaces the status and a Reconnect action", async () => {
    getGitHubConnection.mockResolvedValue(
      response({ connection: connection({ status: "reconnect_required" }) })
    )
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    expect(await screen.findByText(/reconnect required/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^reconnect$/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /disconnect GitHub/i })
    ).toBeInTheDocument()
  })

  test("?linked=1 finalizes once and lands on the active connection", async () => {
    window.history.replaceState(null, "", "/acme/settings/connections?linked=1")
    connectGitHubConnection.mockResolvedValue(response())
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    expect(await screen.findByText("octocat")).toBeInTheDocument()
    expect(connectGitHubConnection).toHaveBeenCalledTimes(1)
    expect(connectGitHubConnection).toHaveBeenCalledWith("ws-1")
    expect(window.location.search).toBe("")
  })

  test("a failed finalize keeps ?linked=1 and explains the failure", async () => {
    window.history.replaceState(null, "", "/acme/settings/connections?linked=1")
    connectGitHubConnection.mockRejectedValue(
      new ApiError(400, "GitHub account not linked")
    )
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    expect(
      await screen.findByText(/GitHub account not linked/i)
    ).toBeInTheDocument()
    expect(window.location.search).toBe("?linked=1")
  })

  test("a failed OAuth start surfaces instead of looking like a no-op", async () => {
    const user = userEvent.setup()
    getGitHubConnection.mockResolvedValue({
      connection: null,
      repositories: [],
    })
    linkSocial.mockRejectedValue(new Error("Provider not configured"))
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    await screen.findByText(/GitHub is not connected/i)
    await user.click(screen.getByRole("button", { name: /connect GitHub/i }))

    expect(
      await screen.findByText(/Provider not configured/i)
    ).toBeInTheDocument()
  })

  test("members see status and repositories but no controls", async () => {
    render(<ConnectionsSettings workspaceId="ws-1" canManage={false} />)

    expect(await screen.findByText("octocat")).toBeInTheDocument()
    expect(screen.getByText("acme/web")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /connect GitHub/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^reconnect$/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /disconnect GitHub/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Search repositories")).toBeNull()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /save allowlist/i })
    ).not.toBeInTheDocument()
  })

  test("the picker searches, marks private and archived, and saves the selection", async () => {
    const user = userEvent.setup()
    setGitHubAllowlist.mockResolvedValue({
      repositories: [
        repository(),
        repository({
          id: "repo-2",
          githubId: "102",
          fullName: "acme/api",
          private: true,
        }),
      ],
      removed: 0,
    })
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    const search = await screen.findByLabelText("Search repositories")
    await user.type(search, "acme")

    await waitFor(() =>
      expect(searchGitHubRepositories).toHaveBeenLastCalledWith("ws-1", "acme")
    )
    expect(
      await screen.findByRole("checkbox", { name: "acme/api" })
    ).not.toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "acme/legacy" })
    ).toBeInTheDocument()
    expect(screen.getByText("Private")).toBeInTheDocument()
    expect(screen.getByText("Archived")).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox", { name: "acme/api" }))
    await user.click(screen.getByRole("button", { name: /save allowlist/i }))

    await waitFor(() =>
      expect(setGitHubAllowlist).toHaveBeenCalledWith("ws-1", ["101", "102"])
    )
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  test("removing an allowlisted repository confirms what is dropped and what survives", async () => {
    const user = userEvent.setup()
    getGitHubConnection.mockResolvedValue(
      response({
        connection: connection({ repositoryCount: 2 }),
        repositories: [
          repository(),
          repository({
            id: "repo-2",
            githubId: "102",
            fullName: "acme/api",
            private: true,
          }),
        ],
      })
    )
    setGitHubAllowlist.mockResolvedValue({
      repositories: [repository()],
      removed: 1,
    })
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    await user.click(await screen.findByRole("checkbox", { name: "acme/api" }))
    await user.click(screen.getByRole("button", { name: /save allowlist/i }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/acme\/api/)).toBeInTheDocument()
    expect(within(dialog).getByText(/cached GitHub items/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/project repository links/i)
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/External Links on Issues/i)
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/last known title and state/i)
    ).toBeInTheDocument()
    expect(setGitHubAllowlist).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }))
    expect(setGitHubAllowlist).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "acme/api" })).not.toBeChecked()

    await user.click(screen.getByRole("button", { name: /save allowlist/i }))
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /save changes/i,
      })
    )

    await waitFor(() =>
      expect(setGitHubAllowlist).toHaveBeenCalledWith("ws-1", ["101"])
    )
    expect(
      await screen.findByText(/saved 1 repositories; removed 1\./i)
    ).toBeInTheDocument()
  })

  test("a 401 from the repository picker flips the pane to the reconnect state", async () => {
    const user = userEvent.setup()
    searchGitHubRepositories.mockRejectedValue(
      new ApiError(409, "GitHub connection needs to be reconnected")
    )
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    await user.type(await screen.findByLabelText("Search repositories"), "acme")

    expect(
      await screen.findByText("GitHub connection needs to be reconnected")
    ).toBeInTheDocument()
    expect(await screen.findByText("Reconnect required")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^reconnect$/i })
    ).toBeInTheDocument()
  })

  test("the allowlist is capped at 50 repositories", async () => {
    const user = userEvent.setup()
    const fifty = Array.from({ length: 50 }, (_, index) =>
      repository({
        id: `repo-${index}`,
        githubId: String(index + 1),
        fullName: `acme/repo-${index}`,
        name: `repo-${index}`,
      })
    )
    getGitHubConnection.mockResolvedValue(
      response({ connection: connection(), repositories: fifty })
    )
    searchGitHubRepositories.mockResolvedValue({
      items: [
        ...fifty.map((item) =>
          remote({ githubId: item.githubId, fullName: item.fullName })
        ),
        remote({ githubId: "999", fullName: "acme/extra", name: "extra" }),
      ],
    })
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    expect(await screen.findByText("50 of 50 selected")).toBeInTheDocument()
    await user.click(
      await screen.findByRole("checkbox", { name: "acme/extra" })
    )
    expect(
      await screen.findByText(/at most 50 repositories/i)
    ).toBeInTheDocument()
    expect(screen.getByText("50 of 50 selected")).toBeInTheDocument()
  })

  test("disconnect confirms what is dropped and what survives", async () => {
    const user = userEvent.setup()
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)

    await screen.findByText("octocat")
    await user.click(screen.getByRole("button", { name: /disconnect GitHub/i }))

    expect(await screen.findByText(/cached GitHub items/i)).toBeInTheDocument()
    expect(screen.getByText(/repository links/i)).toBeInTheDocument()
    expect(screen.getByText(/External Links on Issues/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^cancel$/i }))
    expect(disconnectGitHubConnection).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: /disconnect GitHub/i }))
    await user.click(screen.getByRole("button", { name: /^disconnect$/i }))

    await waitFor(() =>
      expect(disconnectGitHubConnection).toHaveBeenCalledWith("ws-1")
    )
    expect(
      await screen.findByText(/GitHub is not connected/i)
    ).toBeInTheDocument()
  })

  test("shows loading and API errors", async () => {
    getGitHubConnection.mockRejectedValueOnce(
      new Error("GitHub connection is not configured")
    )
    render(<ConnectionsSettings workspaceId="ws-1" canManage={true} />)
    expect(await screen.findByText(/not configured/i)).toBeInTheDocument()
  })
})
