import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type {
  GitHubConnectionResponse,
  Project,
  ProjectRepositoriesResponse,
  ProjectRepositoryView,
} from "@/lib/api"
import { api } from "@/lib/api"
import { RepositoriesSettings } from "./repositories-settings.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getProjectRepositories: vi.fn(),
      setProjectRepositories: vi.fn(),
      getGitHubConnection: vi.fn(),
    },
  }
})

const getProjectRepositories = vi.mocked(api.getProjectRepositories)
const setProjectRepositories = vi.mocked(api.setProjectRepositories)
const getGitHubConnection = vi.mocked(api.getGitHubConnection)

const project: Project = {
  id: "pr-1",
  workspaceId: "ws-1",
  name: "Web",
  key: "WEB",
  icon: "Folder",
  color: "#94a3b8",
}

function repository(
  overrides: Partial<ProjectRepositoryView> = {}
): ProjectRepositoryView {
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
    linkedBy: "user-owner",
    linkedAt: "2026-10-02T00:00:00.000Z",
    ...overrides,
  }
}

function response(
  overrides: Partial<ProjectRepositoriesResponse> = {}
): ProjectRepositoriesResponse {
  return {
    items: [repository()],
    connection: { status: "active", login: "octocat" },
    ...overrides,
  }
}

function connection(
  overrides: Partial<GitHubConnectionResponse> = {}
): GitHubConnectionResponse {
  return {
    connection: {
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
      connectorName: "Ada",
      repositoryCount: 2,
    },
    repositories: [
      repository(),
      repository({
        id: "repo-2",
        githubId: "102",
        fullName: "acme/api",
        name: "api",
        private: true,
      }),
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getProjectRepositories.mockResolvedValue(response())
  getGitHubConnection.mockResolvedValue(connection())
  setProjectRepositories.mockResolvedValue(response())
})

describe("repositories settings", () => {
  test("an admin sees the allowlist, sync state, and saves the selection", async () => {
    const user = userEvent.setup()
    getProjectRepositories.mockResolvedValue(
      response({
        items: [
          repository({
            lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }),
        ],
      })
    )
    setProjectRepositories.mockResolvedValue(
      response({
        items: [
          repository({
            lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }),
          repository({
            id: "repo-2",
            githubId: "102",
            fullName: "acme/api",
            name: "api",
            private: true,
          }),
        ],
      })
    )
    render(<RepositoriesSettings project={project} canManage={true} />)

    expect(
      await screen.findByRole("checkbox", { name: "acme/web" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "acme/web" })).toBeChecked()
    )
    expect(screen.getByRole("checkbox", { name: "acme/api" })).not.toBeChecked()
    expect(screen.getByText(/last synced 5m ago/i)).toBeInTheDocument()
    expect(screen.getByText("Private")).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox", { name: "acme/api" }))
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() =>
      expect(setProjectRepositories).toHaveBeenCalledWith("pr-1", [
        "repo-1",
        "repo-2",
      ])
    )
    expect(
      await screen.findByText(/2 repositories linked/i)
    ).toBeInTheDocument()
    expect(screen.getByText("acme/api")).toBeInTheDocument()
  })

  test("an unavailable repository shows the marker instead of sync time", async () => {
    getProjectRepositories.mockResolvedValue(
      response({
        items: [
          repository({
            syncError: "Forbidden",
            unavailable: true,
            lastSyncedAt: "2026-10-09T00:00:00.000Z",
          }),
        ],
      })
    )
    render(<RepositoriesSettings project={project} canManage={false} />)

    expect(await screen.findByText("Unavailable")).toBeInTheDocument()
    expect(screen.queryByText(/last synced/i)).not.toBeInTheDocument()
  })

  test("members see the linked repositories without controls", async () => {
    render(<RepositoriesSettings project={project} canManage={false} />)

    expect(await screen.findByText("acme/web")).toBeInTheDocument()
    expect(screen.getByText("Not synced yet")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^save$/i })
    ).not.toBeInTheDocument()
    expect(getGitHubConnection).not.toHaveBeenCalled()
  })

  test("an unlinked project with no connection points admins at Connections", async () => {
    getProjectRepositories.mockResolvedValue({
      items: [],
      connection: null,
    })
    render(<RepositoriesSettings project={project} canManage={true} />)

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

  test("a connected workspace with an empty allowlist points at Connections", async () => {
    getProjectRepositories.mockResolvedValue({
      items: [],
      connection: { status: "active", login: "octocat" },
    })
    getGitHubConnection.mockResolvedValue({
      connection: connection().connection,
      repositories: [],
    })
    render(<RepositoriesSettings project={project} canManage={true} />)

    expect(
      await screen.findByText(/no repositories are in the workspace allowlist/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/settings → connections → github/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  test("a project with no linked repositories explains who can link them", async () => {
    getProjectRepositories.mockResolvedValue({
      items: [],
      connection: { status: "active", login: "octocat" },
    })
    render(<RepositoriesSettings project={project} canManage={false} />)

    expect(
      await screen.findByText(/no repositories are linked to this project yet/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/an owner or admin can link repositories/i)
    ).toBeInTheDocument()
  })

  test("load and save failures surface their messages", async () => {
    const user = userEvent.setup()
    getProjectRepositories.mockRejectedValueOnce(new Error("Forbidden"))
    const { unmount } = render(
      <RepositoriesSettings project={project} canManage={false} />
    )
    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
    unmount()

    getProjectRepositories.mockResolvedValue(response())
    setProjectRepositories.mockRejectedValueOnce(
      new Error("Unknown repository")
    )
    render(<RepositoriesSettings project={project} canManage={true} />)
    await screen.findByRole("checkbox", { name: "acme/web" })
    await user.click(screen.getByRole("button", { name: /^save$/i }))
    expect(await screen.findByText("Unknown repository")).toBeInTheDocument()
  })
})
