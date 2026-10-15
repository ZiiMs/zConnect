import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api, type Issue } from "@/lib/api"
import { IssueActions } from "./issue-actions.js"

vi.mock("@/lib/api", () => ({
  api: {
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
  },
}))

const updateIssue = vi.mocked(api.updateIssue)
const deleteIssue = vi.mocked(api.deleteIssue)

const issue: Issue = {
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

function setup(
  overrides: Partial<Issue> = {},
  props: { canAdmin?: boolean } = {}
) {
  const onChanged = vi.fn()
  const onDeleted = vi.fn()
  render(
    <IssueActions
      issue={{ ...issue, ...overrides }}
      canAdmin={props.canAdmin ?? true}
      onChanged={onChanged}
      onDeleted={onDeleted}
    />
  )
  return { onChanged, onDeleted }
}

describe("issue archive actions", () => {
  test("archiving calls through and notifies", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...issue, archived: true })
    const { onChanged } = setup()

    await user.click(screen.getByRole("button", { name: /archive/i }))

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { archived: true })
    )
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true })
    )
  })

  test("an archived issue offers restore instead", async () => {
    const user = userEvent.setup()
    updateIssue.mockResolvedValue({ ...issue, archived: false })
    const { onChanged } = setup({ archived: true })

    expect(
      screen.queryByRole("button", { name: /^archive$/i })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /restore/i }))

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith("WEB-1", { archived: false })
    )
    expect(onChanged).toHaveBeenCalled()
  })

  test("a failed archive shows the error", async () => {
    const user = userEvent.setup()
    updateIssue.mockRejectedValueOnce(new Error("Forbidden"))
    setup()

    await user.click(screen.getByRole("button", { name: /archive/i }))

    expect(await screen.findByText(/forbidden/i)).toBeInTheDocument()
  })

  test("admins see a permanent delete that notifies", async () => {
    const user = userEvent.setup()
    deleteIssue.mockResolvedValue(undefined)
    const { onDeleted } = setup()

    await user.click(
      screen.getByRole("button", { name: /delete permanently/i })
    )

    await waitFor(() => expect(deleteIssue).toHaveBeenCalledWith("WEB-1"))
    expect(onDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "WEB-1" })
    )
  })

  test("non-admins see no permanent delete", () => {
    setup({}, { canAdmin: false })

    expect(
      screen.queryByRole("button", { name: /delete permanently/i })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /archive/i })).toBeInTheDocument()
  })
})
