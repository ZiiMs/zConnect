import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  api,
  type InvitationInbox,
  type Notification,
  type NotificationsPage,
} from "@/lib/api"
import { Inbox } from "./inbox.js"

vi.mock("@/lib/api", () => ({
  api: {
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    listMyInvitations: vi.fn(),
    acceptInvitation: vi.fn(),
    deleteInvitation: vi.fn(),
  },
}))

const listNotifications = vi.mocked(api.listNotifications)
const markNotificationRead = vi.mocked(api.markNotificationRead)
const markAllNotificationsRead = vi.mocked(api.markAllNotificationsRead)
const listMyInvitations = vi.mocked(api.listMyInvitations)
const acceptInvitation = vi.mocked(api.acceptInvitation)
const deleteInvitation = vi.mocked(api.deleteInvitation)

function invitation(overrides: Partial<InvitationInbox> = {}): InvitationInbox {
  return {
    id: "inv-1",
    workspaceId: "ws-1",
    email: "member@example.com",
    role: "Member",
    expiresAt: "2026-10-27T00:00:00.000Z",
    workspace: { id: "ws-1", name: "Acme" },
    inviter: { id: "user-2", name: "Ada Lovelace" },
    ...overrides,
  }
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-1",
    userId: "user-1",
    issueId: "is-1",
    type: "issue.assigned",
    actorType: "user",
    actorId: "user-2",
    payload: {
      issueIdentifier: "WEB-1",
      issueTitle: "Fix login",
      workspaceId: "ws-1",
      actorName: "Ada Lovelace",
    },
    readAt: null,
    emailedAt: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  }
}

function page(overrides: Partial<NotificationsPage> = {}): NotificationsPage {
  return { notifications: [], nextCursor: null, unreadCount: 0, ...overrides }
}

function setup() {
  const onOpenIssue = vi.fn()
  const onUnreadCountChange = vi.fn()
  render(
    <Inbox
      onOpenIssue={onOpenIssue}
      onUnreadCountChange={onUnreadCountChange}
    />
  )
  return { onOpenIssue, onUnreadCountChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  listNotifications.mockResolvedValue(page())
  markAllNotificationsRead.mockResolvedValue({ updated: 0 })
  listMyInvitations.mockResolvedValue([])
})

describe("inbox", () => {
  test("renders actor, action, issue, and relative time", async () => {
    listNotifications.mockResolvedValue(
      page({ notifications: [notification()], unreadCount: 1 })
    )
    setup()

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.getByText("assigned you")).toBeInTheDocument()
    expect(screen.getByText("WEB-1")).toBeInTheDocument()
    expect(screen.getByText("Fix login")).toBeInTheDocument()
    expect(screen.getByText("5m ago")).toBeInTheDocument()
  })

  test("All and Unread tabs fetch with their filter", async () => {
    const user = userEvent.setup()
    setup()

    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith({ filter: "all" })
    )

    await user.click(screen.getByRole("tab", { name: /unread/i }))

    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith({ filter: "unread" })
    )
  })

  test("clicking a row marks it read and opens the issue target", async () => {
    const user = userEvent.setup()
    const item = notification()
    listNotifications.mockResolvedValue(
      page({ notifications: [item], unreadCount: 1 })
    )
    markNotificationRead.mockResolvedValue({
      ...item,
      readAt: new Date().toISOString(),
    })
    const { onOpenIssue, onUnreadCountChange } = setup()

    await user.click(
      await screen.findByRole("button", { name: /ada lovelace/i })
    )

    expect(markNotificationRead).toHaveBeenCalledWith("n-1")
    expect(onOpenIssue).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      identifier: "WEB-1",
      title: "Fix login",
    })
    expect(onUnreadCountChange).toHaveBeenLastCalledWith(0)
  })

  test("mark all read posts, refreshes, and clears the unread count", async () => {
    const user = userEvent.setup()
    const first = notification({ id: "n-1" })
    const second = notification({
      id: "n-2",
      payload: {
        issueIdentifier: "WEB-2",
        issueTitle: "Ship it",
        workspaceId: "ws-1",
        actorName: "Grace Hopper",
      },
    })
    listNotifications
      .mockResolvedValueOnce(
        page({ notifications: [first, second], unreadCount: 2 })
      )
      .mockResolvedValueOnce(
        page({
          notifications: [
            { ...first, readAt: new Date().toISOString() },
            { ...second, readAt: new Date().toISOString() },
          ],
          unreadCount: 0,
        })
      )
    const { onUnreadCountChange } = setup()

    await screen.findByText("Ada Lovelace")
    await user.click(screen.getByRole("button", { name: /mark all read/i }))

    await waitFor(() =>
      expect(markAllNotificationsRead).toHaveBeenCalledTimes(1)
    )
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2))
    expect(listNotifications).toHaveBeenLastCalledWith({ filter: "all" })
    expect(onUnreadCountChange).toHaveBeenLastCalledWith(0)
  })

  test("shows the unread count on the Unread tab", async () => {
    listNotifications.mockResolvedValue(
      page({ notifications: [notification()], unreadCount: 3 })
    )
    setup()

    expect(await screen.findByTestId("unread-tab-count")).toHaveTextContent("3")
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeEnabled()
  })

  test("has per-filter empty states", async () => {
    const user = userEvent.setup()
    setup()

    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /unread/i }))

    expect(
      await screen.findByText("No unread notifications.")
    ).toBeInTheDocument()
  })

  test("load more appends older rows and dedupes by id", async () => {
    const user = userEvent.setup()
    const first = notification({ id: "n-1" })
    const second = notification({
      id: "n-2",
      payload: {
        issueIdentifier: "WEB-2",
        issueTitle: "Second issue",
        workspaceId: "ws-1",
        actorName: "Grace Hopper",
      },
    })
    const third = notification({
      id: "n-3",
      payload: {
        issueIdentifier: "WEB-3",
        issueTitle: "Third issue",
        workspaceId: "ws-1",
        actorName: "Alan Turing",
      },
    })
    listNotifications
      .mockResolvedValueOnce(
        page({
          notifications: [first, second],
          nextCursor: "cursor-1",
          unreadCount: 3,
        })
      )
      .mockResolvedValueOnce(
        page({
          notifications: [second, third],
          unreadCount: 3,
        })
      )
    setup()

    await screen.findByText("WEB-2")
    await user.click(screen.getByRole("button", { name: /load more/i }))

    expect(await screen.findByText("WEB-3")).toBeInTheDocument()
    expect(listNotifications).toHaveBeenLastCalledWith({
      filter: "all",
      before: "cursor-1",
    })
    expect(screen.getAllByText("WEB-2")).toHaveLength(1)
    expect(
      screen.queryByRole("button", { name: /load more/i })
    ).not.toBeInTheDocument()
  })

  test("shows pending workspace invitations above notifications", async () => {
    listMyInvitations.mockResolvedValue([invitation()])
    setup()

    expect(await screen.findByText("Acme")).toBeInTheDocument()
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^accept$/i })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument()
  })

  test("shows an empty invitations state when none are pending", async () => {
    listMyInvitations.mockResolvedValue([])
    setup()

    expect(
      await screen.findByText("No pending invitations.")
    ).toBeInTheDocument()
  })

  test("accepting an invitation removes it and refreshes workspaces", async () => {
    const user = userEvent.setup()
    listMyInvitations.mockResolvedValue([invitation()])
    acceptInvitation.mockResolvedValue({
      workspaceId: "ws-1",
      userId: "user-1",
      role: "Member",
    })
    const onInvitationAccepted = vi.fn()
    const onOpenIssue = vi.fn()
    render(
      <Inbox
        onOpenIssue={onOpenIssue}
        onUnreadCountChange={vi.fn()}
        onInvitationAccepted={onInvitationAccepted}
      />
    )

    await screen.findByText("Acme")
    await user.click(screen.getByRole("button", { name: /^accept$/i }))

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv-1"))
    expect(onInvitationAccepted).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByText("Acme")).not.toBeInTheDocument()
    )
  })

  test("declining an invitation removes it", async () => {
    const user = userEvent.setup()
    listMyInvitations.mockResolvedValue([invitation()])
    deleteInvitation.mockResolvedValue(undefined)
    setup()

    await screen.findByText("Acme")
    await user.click(screen.getByRole("button", { name: /decline/i }))

    await waitFor(() => expect(deleteInvitation).toHaveBeenCalledWith("inv-1"))
    await waitFor(() =>
      expect(screen.queryByText("Acme")).not.toBeInTheDocument()
    )
  })
})
