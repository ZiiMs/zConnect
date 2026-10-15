import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api } from "@/lib/api"
import { InviteMemberForm } from "./invite-member-form.js"

vi.mock("@/lib/api", () => ({
  api: {
    inviteMember: vi.fn(),
  },
}))

const inviteMember = vi.mocked(api.inviteMember)

describe("invite member form", () => {
  test("invites by email with the chosen role", async () => {
    const user = userEvent.setup()
    inviteMember.mockResolvedValue({
      id: "inv-1",
      workspaceId: "ws-1",
      email: "member@example.com",
      role: "Member",
    })
    render(<InviteMemberForm workspaceId="ws-1" />)

    await user.type(screen.getByLabelText(/email/i), "member@example.com")
    await user.selectOptions(screen.getByLabelText(/role/i), "Admin")
    await user.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith("ws-1", {
        email: "member@example.com",
        role: "Admin",
      })
    )
    expect(await screen.findByText(/invited/i)).toBeInTheDocument()
  })

  test("shows an error when the invite is rejected", async () => {
    const user = userEvent.setup()
    inviteMember.mockRejectedValue(new Error("Forbidden"))
    render(<InviteMemberForm workspaceId="ws-1" />)

    await user.type(screen.getByLabelText(/email/i), "x@y.z")
    await user.click(screen.getByRole("button", { name: /invite/i }))

    expect(await screen.findByText(/forbidden/i)).toBeInTheDocument()
  })
})
