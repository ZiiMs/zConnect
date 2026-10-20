import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ApiError, api, type InvitationDetails, type Member } from "@/lib/api"
import { InvitePage } from "./invite-page.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getInvitation: vi.fn(),
      acceptInvitation: vi.fn(),
    },
  }
})

const getInvitation = vi.mocked(api.getInvitation)
const acceptInvitation = vi.mocked(api.acceptInvitation)

const details: InvitationDetails = {
  id: "inv-1",
  email: "member@example.com",
  role: "Admin",
  expiresAt: "2030-01-15T12:00:00.000Z",
  workspace: { id: "ws-1", name: "Acme" },
  inviter: {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
  },
}

const membership: Member = {
  workspaceId: "ws-1",
  userId: "member-1",
  role: "Admin",
  name: "Member One",
}

beforeEach(() => {
  vi.clearAllMocks()
  getInvitation.mockResolvedValue(details)
  acceptInvitation.mockResolvedValue(membership)
})

describe("invite page", () => {
  test("shows loading, then workspace, inviter, role, and expiry", async () => {
    let resolve!: (value: InvitationDetails) => void
    getInvitation.mockReturnValue(
      new Promise<InvitationDetails>((done) => {
        resolve = done
      })
    )
    render(<InvitePage invitationId="inv-1" onAccepted={vi.fn()} />)

    expect(screen.getByText(/loading invitation/i)).toBeInTheDocument()

    resolve(details)

    expect(await screen.findByText("Acme")).toBeInTheDocument()
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.getByText("ada@example.com")).toBeInTheDocument()
    expect(screen.getByText("Admin")).toBeInTheDocument()
    const expiry = screen.getByText((_, element) => {
      return element?.tagName === "TIME"
    })
    expect(expiry).toHaveAttribute("dateTime", details.expiresAt)
    expect(
      screen.getByRole("button", { name: /join workspace/i })
    ).toBeEnabled()
  })

  test("Join accepts the invitation and hands the result to the app", async () => {
    const user = userEvent.setup()
    const onAccepted = vi.fn()
    render(<InvitePage invitationId="inv-1" onAccepted={onAccepted} />)
    await screen.findByText("Acme")

    await user.click(screen.getByRole("button", { name: /join workspace/i }))

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv-1"))
    expect(onAccepted).toHaveBeenCalledWith(details, membership)
  })

  test("403 explains the invitation belongs to another email", async () => {
    getInvitation.mockRejectedValue(new ApiError(403, "Wrong email"))
    render(<InvitePage invitationId="inv-1" onAccepted={vi.fn()} />)

    expect(
      await screen.findByText(
        "This invitation was sent to a different email address."
      )
    ).toBeInTheDocument()
  })

  test("410 explains the invitation has expired", async () => {
    getInvitation.mockRejectedValue(new ApiError(410, "Expired"))
    render(<InvitePage invitationId="inv-1" onAccepted={vi.fn()} />)

    expect(
      await screen.findByText("This invitation has expired.")
    ).toBeInTheDocument()
  })

  test("404 explains the invitation no longer exists", async () => {
    getInvitation.mockRejectedValue(new ApiError(404, "Missing"))
    render(<InvitePage invitationId="inv-1" onAccepted={vi.fn()} />)

    expect(
      await screen.findByText("This invitation no longer exists.")
    ).toBeInTheDocument()
  })

  test("an accept failure shows the API message inline", async () => {
    const user = userEvent.setup()
    const onAccepted = vi.fn()
    acceptInvitation.mockRejectedValue(new ApiError(409, "Already invited"))
    render(<InvitePage invitationId="inv-1" onAccepted={onAccepted} />)
    await screen.findByText("Acme")

    await user.click(screen.getByRole("button", { name: /join workspace/i }))

    expect(await screen.findByText("Already invited")).toBeInTheDocument()
    expect(onAccepted).not.toHaveBeenCalled()
  })
})
