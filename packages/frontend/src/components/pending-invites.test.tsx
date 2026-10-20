import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Invitation } from "@/lib/api"
import { PendingInvites } from "./pending-invites.js"

vi.mock("@/lib/api", () => ({
  api: {
    listWorkspaceInvites: vi.fn(),
    deleteInvitation: vi.fn(),
  },
}))

const listWorkspaceInvites = vi.mocked(api.listWorkspaceInvites)
const deleteInvitation = vi.mocked(api.deleteInvitation)

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    workspaceId: "ws-1",
    email: "member@example.com",
    role: "Member",
    expiresAt: "2026-10-27T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listWorkspaceInvites.mockResolvedValue([])
  deleteInvitation.mockResolvedValue(undefined)
})

describe("pending invites", () => {
  test("lists pending invites with a cancel action", async () => {
    listWorkspaceInvites.mockResolvedValue([
      invitation(),
      invitation({
        id: "inv-2",
        email: "admin@example.com",
        role: "Admin",
      }),
    ])
    render(<PendingInvites workspaceId="ws-1" />)

    expect(await screen.findByText("member@example.com")).toBeInTheDocument()
    expect(screen.getByText("admin@example.com")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /cancel/i })).toHaveLength(2)
  })

  test("shows an empty state when no invites are pending", async () => {
    render(<PendingInvites workspaceId="ws-1" />)

    expect(await screen.findByText("No pending invites.")).toBeInTheDocument()
  })

  test("cancelling removes the row", async () => {
    const user = userEvent.setup()
    listWorkspaceInvites.mockResolvedValue([invitation()])
    render(<PendingInvites workspaceId="ws-1" />)

    await screen.findByText("member@example.com")
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => expect(deleteInvitation).toHaveBeenCalledWith("inv-1"))
    await waitFor(() =>
      expect(screen.queryByText("member@example.com")).not.toBeInTheDocument()
    )
  })

  test("shows an error when loading fails", async () => {
    listWorkspaceInvites.mockRejectedValue(new Error("Forbidden"))
    render(<PendingInvites workspaceId="ws-1" />)

    expect(await screen.findByText(/forbidden/i)).toBeInTheDocument()
  })
})
