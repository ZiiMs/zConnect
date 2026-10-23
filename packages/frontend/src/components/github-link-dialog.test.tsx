import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ApiError, api, type Issue, type LinkedIssueRef } from "@/lib/api"
import { GitHubLinkDialog } from "./github-link-dialog.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listIssues: vi.fn(),
      linkGitHubItem: vi.fn(),
    },
  }
})

const listIssues = vi.mocked(api.listIssues)
const linkGitHubItem = vi.mocked(api.linkGitHubItem)

const issues: Issue[] = [
  {
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
  },
  {
    id: "issue-5",
    projectId: "pr-1",
    number: 5,
    keyPrefix: "WEB",
    identifier: "WEB-5",
    title: "Link a pull request by its issue identifier",
    description: null,
    statusId: "status-1",
    priority: "None",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
  },
]

const chips: LinkedIssueRef[] = [
  {
    linkId: "link-1",
    issueId: "issue-2",
    identifier: "WEB-2",
    title: "Invite your teammates to this workspace",
  },
]

function Harness({ onLinked }: { onLinked: (refs: LinkedIssueRef[]) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <GitHubLinkDialog
      open={open}
      onOpenChange={setOpen}
      projectId="pr-1"
      kind="pr"
      repositoryId="repo-1"
      number={12}
      onLinked={onLinked}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listIssues.mockResolvedValue(issues)
  linkGitHubItem.mockResolvedValue({
    link: {
      id: "link-1",
      issueId: "issue-2",
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/12",
      title: "Add the GitHub View",
      state: "open",
    },
    issue: {
      id: "issue-2",
      identifier: "WEB-2",
      title: "Invite your teammates to this workspace",
    },
    linkedIssues: chips,
  })
})

describe("github link dialog", () => {
  test("searches the project's Issues and links the selected one", async () => {
    const user = userEvent.setup()
    const onLinked = vi.fn()
    render(<Harness onLinked={onLinked} />)

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    await screen.findByRole("button", { name: /WEB-2/ })

    await user.type(
      screen.getByRole("searchbox", { name: "Search issues" }),
      "WEB-2"
    )
    await waitFor(() =>
      expect(listIssues).toHaveBeenLastCalledWith("pr-1", { text: "WEB-2" })
    )

    await user.click(screen.getByRole("button", { name: /WEB-2/ }))
    await user.click(screen.getByRole("button", { name: "Link" }))

    await waitFor(() =>
      expect(linkGitHubItem).toHaveBeenCalledWith("pr-1", {
        kind: "pr",
        repositoryId: "repo-1",
        number: 12,
        issue: "WEB-2",
      })
    )
    expect(onLinked).toHaveBeenCalledWith(chips)
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })

  test("shows an empty result state", async () => {
    const user = userEvent.setup()
    listIssues.mockResolvedValue([])
    render(<Harness onLinked={vi.fn()} />)

    await screen.findByRole("dialog")
    await user.type(
      screen.getByRole("searchbox", { name: "Search issues" }),
      "zzz"
    )

    expect(await screen.findByText("No issues found.")).toBeInTheDocument()
  })

  test("surfaces a link failure and keeps the dialog open", async () => {
    const user = userEvent.setup()
    linkGitHubItem.mockRejectedValue(new ApiError(403, "Forbidden"))
    render(<Harness onLinked={vi.fn()} />)

    await screen.findByRole("button", { name: /WEB-2/ })
    await user.click(screen.getByRole("button", { name: /WEB-2/ }))
    await user.click(screen.getByRole("button", { name: "Link" }))

    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
