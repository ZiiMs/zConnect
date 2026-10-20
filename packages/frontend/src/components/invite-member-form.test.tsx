import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"
import { api, type Invitation } from "@/lib/api"
import { InviteMemberForm } from "./invite-member-form.js"

vi.mock("@/lib/api", () => ({
  api: {
    inviteMember: vi.fn(),
  },
}))

const inviteMember = vi.mocked(api.inviteMember)

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

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("invite member form", () => {
  test("invites by email with the chosen role and reports sent mail", async () => {
    const user = userEvent.setup()
    inviteMember.mockResolvedValue(invitation({ mailSent: true }))
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
    expect(
      await screen.findByText("Invited member@example.com. Email sent.")
    ).toBeInTheDocument()
  })

  test("falls back to a copy link when mail is not configured", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    inviteMember.mockResolvedValue(
      invitation({
        mailSent: false,
        acceptUrl: "https://zconnect.test/invite/inv-1",
      })
    )
    render(<InviteMemberForm workspaceId="ws-1" />)

    await user.type(screen.getByLabelText(/email/i), "member@example.com")
    await user.click(screen.getByRole("button", { name: /invite/i }))

    expect(
      await screen.findByText(/mail is not configured/i)
    ).toBeInTheDocument()
    const link = screen.getByLabelText(/invitation link/i)
    expect(link).toHaveValue("https://zconnect.test/invite/inv-1")
    expect(link).toHaveAttribute("readonly")

    await user.click(screen.getByRole("button", { name: /^copy$/i }))
    expect(writeText).toHaveBeenCalledWith("https://zconnect.test/invite/inv-1")
    expect(
      await screen.findByRole("button", { name: /^copied$/i })
    ).toBeInTheDocument()
  })

  test("keeps the fallback usable when the clipboard is unavailable", async () => {
    const user = userEvent.setup()
    Reflect.deleteProperty(navigator, "clipboard")
    inviteMember.mockResolvedValue(
      invitation({ mailSent: false, acceptUrl: "/invite/inv-1" })
    )
    render(<InviteMemberForm workspaceId="ws-1" />)

    await user.type(screen.getByLabelText(/email/i), "member@example.com")
    await user.click(screen.getByRole("button", { name: /invite/i }))

    expect(await screen.findByLabelText(/invitation link/i)).toHaveValue(
      "/invite/inv-1"
    )
    const copy = screen.getByRole("button", { name: /^copy$/i })
    await user.click(copy)
    expect(copy).toHaveTextContent("Copy")
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
