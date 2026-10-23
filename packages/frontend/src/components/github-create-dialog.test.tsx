import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ApiError, api, type Issue } from "@/lib/api"
import { GitHubCreateDialog } from "./github-create-dialog.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      createIssueFromGitHubItem: vi.fn(),
    },
  }
})

const createIssueFromGitHubItem = vi.mocked(api.createIssueFromGitHubItem)

const created: Issue = {
  id: "issue-7",
  projectId: "pr-1",
  number: 7,
  keyPrefix: "WEB",
  identifier: "WEB-7",
  title: "Login redirect loops",
  description: "https://github.com/acme/web/issues/5",
  statusId: "status-todo",
  priority: "Medium",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: [],
  createdBy: "user-1",
}

function Harness({
  onCreated,
  bodyExcerpt = "Steps to reproduce.",
}: {
  onCreated: (issue: Issue) => void
  bodyExcerpt?: string | null
}) {
  const [open, setOpen] = useState(true)
  return (
    <GitHubCreateDialog
      open={open}
      onOpenChange={setOpen}
      projectId="pr-1"
      kind="issue"
      repositoryId="repo-1"
      number={5}
      title="Login redirect loops"
      url="https://github.com/acme/web/issues/5"
      bodyExcerpt={bodyExcerpt}
      repository="acme/web"
      onCreated={onCreated}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  createIssueFromGitHubItem.mockResolvedValue(created)
})

describe("github create dialog", () => {
  test("prefills the title and the URL plus description excerpt", async () => {
    render(<Harness onCreated={vi.fn()} />)

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/acme\/web #5/)).toBeInTheDocument()
    expect(screen.getByText("Login redirect loops")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Issue title" })).toHaveValue(
      "Login redirect loops"
    )
    expect(
      screen.getByRole("textbox", { name: "Issue description" })
    ).toHaveValue("https://github.com/acme/web/issues/5\n\nSteps to reproduce.")
  })

  test("omits the blank paragraph when the item has no body", async () => {
    render(<Harness onCreated={vi.fn()} bodyExcerpt={null} />)

    await screen.findByRole("dialog")
    expect(
      screen.getByRole("textbox", { name: "Issue description" })
    ).toHaveValue("https://github.com/acme/web/issues/5")
  })

  test("submits the edited title and body and hands back the created Issue", async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<Harness onCreated={onCreated} />)

    const title = screen.getByRole("textbox", { name: "Issue title" })
    await user.clear(title)
    await user.type(title, "Fix the login redirect loop")
    const description = screen.getByRole("textbox", {
      name: "Issue description",
    })
    await user.clear(description)
    await user.type(
      description,
      "https://github.com/acme/web/issues/5\n\nRepro steps live in the issue."
    )
    await user.click(screen.getByRole("button", { name: "Create Issue" }))

    await waitFor(() =>
      expect(createIssueFromGitHubItem).toHaveBeenCalledWith("pr-1", {
        kind: "issue",
        repositoryId: "repo-1",
        number: 5,
      })
    )
    expect(onCreated).toHaveBeenCalledWith(created)
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })

  test("surfaces a creation failure and keeps the dialog open", async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    createIssueFromGitHubItem.mockRejectedValue(new ApiError(403, "Forbidden"))
    render(<Harness onCreated={onCreated} />)

    await screen.findByRole("dialog")
    await user.click(screen.getByRole("button", { name: "Create Issue" }))

    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
