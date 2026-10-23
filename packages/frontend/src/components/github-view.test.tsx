import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  api,
  type PullRequestListResponse,
  type PullRequestRow,
} from "@/lib/api"
import { GitHubView } from "./github-view.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listPullRequests: vi.fn(),
      refreshGitHub: vi.fn(),
    },
  }
})

const listPullRequests = vi.mocked(api.listPullRequests)
const refreshGitHub = vi.mocked(api.refreshGitHub)

const workspace = { id: "ws-1", name: "Acme", role: "Owner" as const }
const project = {
  id: "pr-1",
  workspaceId: "ws-1",
  name: "Web",
  key: "WEB",
  icon: "Folder",
  color: "#94a3b8",
}

const openRow: PullRequestRow = {
  id: "row-12",
  repositoryId: "repo-1",
  number: 12,
  title: "Add the GitHub View",
  state: "open",
  draft: true,
  authorLogin: "octocat",
  authorAvatarUrl: null,
  url: "https://github.com/acme/web/pull/12",
  sourceBranch: "feature/github-view",
  targetBranch: "main",
  checksState: "success",
  reviewDecision: "approved",
  commentCount: 4,
  bodyExcerpt: null,
  githubCreatedAt: "2026-10-01T10:00:00.000Z",
  githubUpdatedAt: "2026-10-02T11:00:00.000Z",
  mergedAt: null,
  closedAt: null,
  syncedAt: "2026-10-10T12:00:00.000Z",
  repository: "acme/web",
  linkedIssues: [
    {
      linkId: "link-1",
      issueId: "issue-1",
      identifier: "WEB-1",
      title: "Fix login",
    },
  ],
}

const secondRow: PullRequestRow = {
  ...openRow,
  id: "row-7",
  number: 7,
  title: "API view endpoint",
  draft: false,
  authorLogin: "hubot",
  url: "https://github.com/acme/api/pull/7",
  repository: "acme/api",
  checksState: "failure",
  reviewDecision: "changes_requested",
  linkedIssues: [],
}

function response(
  overrides: Partial<PullRequestListResponse> = {}
): PullRequestListResponse {
  return {
    items: [openRow, secondRow],
    nextCursor: null,
    lastSyncedAt: "2026-10-10T12:00:00.000Z",
    connection: { status: "active", login: "octocat" },
    repositories: [
      {
        id: "repo-1",
        fullName: "acme/web",
        issuesEnabled: true,
        unavailable: false,
      },
      {
        id: "repo-2",
        fullName: "acme/api",
        issuesEnabled: true,
        unavailable: false,
      },
    ],
    filters: { authors: ["hubot", "octocat"], labels: [] },
    ...overrides,
  }
}

function renderView(tab: "pull-requests" | "issues" = "pull-requests") {
  return render(
    <GitHubView
      workspace={workspace}
      project={project}
      tab={tab}
      canWrite={true}
      canAdmin={true}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, "", "/acme/WEB/github")
  listPullRequests.mockResolvedValue(response())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("github view", () => {
  test("lists Pull Requests with the decision signals and linked Issue chips", async () => {
    renderView()

    const table = await screen.findByRole("table", { name: "Pull requests" })
    expect(within(table).getByText("Add the GitHub View")).toBeInTheDocument()
    expect(within(table).getByText("#12")).toBeInTheDocument()
    expect(within(table).getByText("octocat")).toBeInTheDocument()
    expect(
      within(screen.getByTestId("pull-request-row-12")).getByText(
        "feature/github-view → main"
      )
    ).toBeInTheDocument()
    expect(within(table).getByText("Checks passed")).toBeInTheDocument()
    expect(within(table).getByText("Approved")).toBeInTheDocument()
    expect(within(table).getByText("Draft")).toBeInTheDocument()
    expect(within(table).getByText("WEB-1")).toBeInTheDocument()
    // Two linked repositories: the repository column is shown.
    expect(within(table).getByText("acme/api")).toBeInTheDocument()
    expect(listPullRequests).toHaveBeenCalledWith("pr-1", {
      state: "open",
      author: "",
      label: "",
      q: "",
    })
  })

  test("state, author, and text filters update the query string and the query", async () => {
    const user = userEvent.setup()
    renderView()
    await screen.findByRole("table", { name: "Pull requests" })

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Pull request state" }),
      "merged"
    )
    await waitFor(() =>
      expect(window.location.search).toContain("state=merged")
    )
    await waitFor(() =>
      expect(listPullRequests).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ state: "merged" })
      )
    )

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Pull request author" }),
      "hubot"
    )
    await waitFor(() =>
      expect(window.location.search).toContain("author=hubot")
    )

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter pull requests" }),
      { target: { value: "view" } }
    )
    await waitFor(() => expect(window.location.search).toContain("q=view"))
    await waitFor(() =>
      expect(listPullRequests).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({ q: "view", author: "hubot", state: "merged" })
      )
    )
  })

  test("Load more appends the next cursor page", async () => {
    const user = userEvent.setup()
    listPullRequests
      .mockResolvedValueOnce(response({ nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(
        response({
          items: [{ ...openRow, id: "row-5", number: 5, title: "Older" }],
          nextCursor: null,
        })
      )
    renderView()

    await user.click(await screen.findByRole("button", { name: "Load more" }))
    expect(listPullRequests).toHaveBeenLastCalledWith("pr-1", {
      state: "open",
      author: "",
      label: "",
      q: "",
      cursor: "cursor-2",
    })
    expect(await screen.findByText("Older")).toBeInTheDocument()
  })

  test("clicking a row opens the GitHub URL in a new tab", async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    renderView()

    await user.click(await screen.findByTestId("pull-request-row-12"))
    expect(open).toHaveBeenCalledWith(
      "https://github.com/acme/web/pull/12",
      "_blank",
      "noopener,noreferrer"
    )
  })

  test("manual refresh enqueues and reloads the list", async () => {
    const user = userEvent.setup()
    refreshGitHub.mockResolvedValue({
      accepted: true,
      enqueued: 2,
      lastSyncedAt: null,
    })
    renderView()
    await screen.findByRole("table", { name: "Pull requests" })
    expect(listPullRequests).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Refresh" }))
    expect(refreshGitHub).toHaveBeenCalledWith("pr-1")
    expect(
      await screen.findByText("Refresh requested for 2 repositories.")
    ).toBeInTheDocument()
    await waitFor(() => expect(listPullRequests).toHaveBeenCalledTimes(2))
  })

  test("shows a stale chip when the last sync is older than five minutes", async () => {
    listPullRequests.mockResolvedValue(
      response({ lastSyncedAt: "2020-01-01T00:00:00.000Z" })
    )
    renderView()
    expect(await screen.findByText("Stale")).toBeInTheDocument()
  })

  test("empty states: no connection, no linked repositories, no open pull requests", async () => {
    listPullRequests.mockResolvedValueOnce(
      response({ items: [], connection: null, repositories: [] })
    )
    const first = renderView()
    expect(
      await screen.findByText("GitHub is not connected for this workspace.")
    ).toBeInTheDocument()
    first.unmount()

    listPullRequests.mockResolvedValueOnce(
      response({ items: [], repositories: [] })
    )
    const second = renderView()
    expect(
      await screen.findByText("No repositories are linked to this project.")
    ).toBeInTheDocument()
    second.unmount()

    listPullRequests.mockResolvedValueOnce(response({ items: [] }))
    renderView()
    expect(
      await screen.findByText("No open pull requests.")
    ).toBeInTheDocument()
  })

  test("a Viewer keeps the read-only surface: no New issue affordance", async () => {
    render(
      <GitHubView
        workspace={{ ...workspace, role: "Viewer" }}
        project={project}
        tab="pull-requests"
        canWrite={false}
        canAdmin={false}
      />
    )
    await screen.findByRole("table", { name: "Pull requests" })
    expect(screen.queryByRole("button", { name: "New issue" })).toBeNull()
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument()
  })

  test("the GitHub Issues tab is a labelled placeholder", async () => {
    renderView("issues")
    expect(
      screen.getByText(/GitHub Issues arrive with the Issues slice/)
    ).toBeInTheDocument()
    expect(listPullRequests).not.toHaveBeenCalled()
    expect(screen.getByRole("tab", { name: "GitHub Issues" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})
