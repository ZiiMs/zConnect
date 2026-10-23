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
  type GitHubIssueListResponse,
  type GitHubIssueRow,
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
      listGitHubIssues: vi.fn(),
      refreshGitHub: vi.fn(),
    },
  }
})

const listPullRequests = vi.mocked(api.listPullRequests)
const listGitHubIssues = vi.mocked(api.listGitHubIssues)
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

const openIssue: GitHubIssueRow = {
  id: "issue-row-5",
  repositoryId: "repo-1",
  number: 5,
  title: "Login redirect loops",
  state: "open",
  authorLogin: "hubot",
  authorAvatarUrl: null,
  url: "https://github.com/acme/web/issues/5",
  labels: [
    { name: "bug", color: "d73a4a" },
    { name: "enhancement", color: "a2eeef" },
  ],
  assignees: [{ login: "octocat", avatarUrl: null }],
  commentCount: 3,
  bodyExcerpt: null,
  githubCreatedAt: "2026-10-01T09:00:00.000Z",
  githubUpdatedAt: "2026-10-05T11:00:00.000Z",
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

const apiIssue: GitHubIssueRow = {
  ...openIssue,
  id: "issue-row-8",
  repositoryId: "repo-2",
  number: 8,
  title: "API 500 on refresh",
  authorLogin: "octocat",
  url: "https://github.com/acme/api/issues/8",
  labels: [{ name: "bug", color: "d73a4a" }],
  assignees: [],
  commentCount: 2,
  repository: "acme/api",
  linkedIssues: [],
}

function issueResponse(
  overrides: Partial<GitHubIssueListResponse> = {}
): GitHubIssueListResponse {
  return {
    items: [apiIssue, openIssue],
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
    filters: {
      authors: ["hubot", "octocat"],
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "enhancement", color: "a2eeef" },
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, "", "/acme/WEB/github")
  listPullRequests.mockResolvedValue(response())
  listGitHubIssues.mockResolvedValue(issueResponse())
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

  test("the GitHub Issues tab lists issues with labels, assignees, and chips", async () => {
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    renderView("issues")

    const table = await screen.findByRole("table", { name: "GitHub issues" })
    expect(screen.getByRole("tab", { name: "GitHub Issues" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(within(table).getByText("Login redirect loops")).toBeInTheDocument()
    expect(within(table).getByText("#5")).toBeInTheDocument()

    const row = screen.getByTestId("github-issue-row-5")
    expect(within(row).getByText("bug")).toBeInTheDocument()
    expect(within(row).getByText("enhancement")).toBeInTheDocument()
    expect(within(row).getByText("hubot")).toBeInTheDocument()
    expect(within(row).getByText("octocat")).toBeInTheDocument()
    expect(within(row).getByText("3")).toBeInTheDocument()
    expect(within(row).getByText("WEB-1")).toBeInTheDocument()
    // Two linked repositories: the repository column is shown.
    expect(within(table).getByText("acme/api")).toBeInTheDocument()

    expect(listGitHubIssues).toHaveBeenCalledWith("pr-1", {
      state: "open",
      author: "",
      label: "",
      q: "",
    })
    expect(listPullRequests).not.toHaveBeenCalled()
  })

  test("state, author, label, and text filters update the Issues query string", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    renderView("issues")
    await screen.findByRole("table", { name: "GitHub issues" })

    await user.selectOptions(
      screen.getByRole("combobox", { name: "GitHub issue state" }),
      "closed"
    )
    await waitFor(() =>
      expect(window.location.search).toContain("state=closed")
    )
    expect(window.location.pathname).toBe("/acme/WEB/github/issues")

    await user.selectOptions(
      screen.getByRole("combobox", { name: "GitHub issue author" }),
      "hubot"
    )
    await user.selectOptions(
      screen.getByRole("combobox", { name: "GitHub issue label" }),
      "bug"
    )
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter GitHub issues" }),
      { target: { value: "login" } }
    )
    await waitFor(() =>
      expect(listGitHubIssues).toHaveBeenLastCalledWith(
        "pr-1",
        expect.objectContaining({
          state: "closed",
          author: "hubot",
          label: "bug",
          q: "login",
        })
      )
    )
    expect(window.location.search).toContain("author=hubot")
    expect(window.location.search).toContain("label=bug")
    expect(window.location.search).toContain("q=login")
  })

  test("Load more appends the next GitHub Issue page", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    listGitHubIssues
      .mockResolvedValueOnce(issueResponse({ nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(
        issueResponse({
          items: [
            { ...openIssue, id: "issue-row-3", number: 3, title: "Older" },
          ],
          nextCursor: null,
        })
      )
    renderView("issues")

    await user.click(await screen.findByRole("button", { name: "Load more" }))
    expect(listGitHubIssues).toHaveBeenLastCalledWith("pr-1", {
      state: "open",
      author: "",
      label: "",
      q: "",
      cursor: "cursor-2",
    })
    expect(await screen.findByText("Older")).toBeInTheDocument()
  })

  test("clicking a GitHub Issue row opens the GitHub URL in a new tab", async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    renderView("issues")

    await user.click(await screen.findByTestId("github-issue-row-5"))
    expect(open).toHaveBeenCalledWith(
      "https://github.com/acme/web/issues/5",
      "_blank",
      "noopener,noreferrer"
    )
  })

  test("an Issues-disabled repository explains the empty tab", async () => {
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    listGitHubIssues.mockResolvedValueOnce(
      issueResponse({
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
    )
    renderView("issues")

    expect(
      await screen.findByText("GitHub Issues are disabled on this repository.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", { name: "GitHub issue state" })
    ).toBeNull()
  })

  test("Issues empty states: no connection, no repositories, no open issues", async () => {
    window.history.replaceState(null, "", "/acme/WEB/github/issues")
    listGitHubIssues.mockResolvedValueOnce(
      issueResponse({ items: [], connection: null, repositories: [] })
    )
    const first = renderView("issues")
    expect(
      await screen.findByText("GitHub is not connected for this workspace.")
    ).toBeInTheDocument()
    first.unmount()

    listGitHubIssues.mockResolvedValueOnce(
      issueResponse({ items: [], repositories: [] })
    )
    const second = renderView("issues")
    expect(
      await screen.findByText("No repositories are linked to this project.")
    ).toBeInTheDocument()
    second.unmount()

    listGitHubIssues.mockResolvedValueOnce(
      issueResponse({ items: [], filters: { authors: [], labels: [] } })
    )
    renderView("issues")
    expect(
      await screen.findByText("No open GitHub issues.")
    ).toBeInTheDocument()
  })
})
