import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api, type Issue, type Status } from "@/lib/api"
import { CreateIssueForm } from "./create-issue-form.js"

vi.mock("@/lib/api", () => ({
  api: { createIssue: vi.fn() },
}))

const createIssue = vi.mocked(api.createIssue)

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

const created: Issue = {
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

describe("create issue form", () => {
  test("preselects the given initial status", () => {
    render(
      <CreateIssueForm
        projectId="pr-1"
        statuses={statuses}
        members={[{ userId: "user-member" }]}
        initialStatusId="st-2"
        onCreated={() => {}}
      />
    )
    expect(screen.getByLabelText(/issue status/i)).toHaveValue("st-2")
  })

  test("renders title, status, priority and assignee controls", () => {
    render(
      <CreateIssueForm
        projectId="pr-1"
        statuses={statuses}
        members={[{ userId: "user-member" }]}
        onCreated={() => {}}
      />
    )
    expect(screen.getByLabelText(/issue title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/issue status/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument()
  })

  test("submitting creates the issue and notifies", async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    createIssue.mockResolvedValue(created)
    render(
      <CreateIssueForm
        projectId="pr-1"
        statuses={statuses}
        members={[{ userId: "user-member" }]}
        onCreated={onCreated}
      />
    )

    await user.type(screen.getByLabelText(/issue title/i), "Fix login")
    await user.selectOptions(screen.getByLabelText(/priority/i), "High")
    await user.click(screen.getByRole("button", { name: /create issue/i }))

    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith(
        "pr-1",
        expect.objectContaining({
          title: "Fix login",
          statusId: "st-1",
          priority: "High",
        })
      )
    )
    expect(onCreated).toHaveBeenCalledWith(created)
  })

  test("a failed create shows the error", async () => {
    const user = userEvent.setup()
    createIssue.mockRejectedValueOnce(new Error("Invalid issue"))
    render(
      <CreateIssueForm
        projectId="pr-1"
        statuses={statuses}
        members={[]}
        onCreated={() => {}}
      />
    )

    await user.type(screen.getByLabelText(/issue title/i), "Fix login")
    await user.click(screen.getByRole("button", { name: /create issue/i }))

    expect(await screen.findByText(/invalid issue/i)).toBeInTheDocument()
  })

  test("selecting registry labels sends them with the create", async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    createIssue.mockResolvedValue(created)
    render(
      <CreateIssueForm
        projectId="pr-1"
        statuses={statuses}
        members={[{ userId: "user-member" }]}
        labels={[
          { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
        ]}
        onCreated={onCreated}
      />
    )

    await user.type(screen.getByLabelText(/issue title/i), "Fix login")
    await user.click(screen.getByRole("checkbox", { name: "bug" }))
    await user.click(screen.getByRole("button", { name: /create issue/i }))

    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith(
        "pr-1",
        expect.objectContaining({ title: "Fix login", labels: ["bug"] })
      )
    )
  })
})
