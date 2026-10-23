import { useCallback, useEffect, useRef, useState } from "react"
import {
  LiveNotificationsBridge,
  LiveUnreadCountBridge,
} from "@/components/realtime/live-notifications"
import { Button } from "@/components/ui/button"
import { formatUnreadCount } from "@/hooks/use-unread-count"
import { api, type InvitationInbox, type Notification } from "@/lib/api"
import { realtimeEnabled } from "@/lib/realtime"
import { formatRelativeTime } from "@/lib/relative-time"
import type { InboxFilter } from "@/lib/routes"

type NotificationFilter = InboxFilter

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
]

/** Human phrase for each notification type; unknown types show their string. */
const ACTION_TEXT: Record<string, string> = {
  "issue.assigned": "assigned you",
  "issue.unassigned": "unassigned you",
  "comment.mention": "mentioned you",
  "comment.created": "commented",
  "issue.status_changed": "changed status",
}

/** Anything the shell needs to open the issue a notification points at. */
export interface NotificationIssueTarget {
  workspaceId: string
  identifier: string
  title: string
}

function stringPayload(notification: Notification, key: string): string | null {
  const value = notification.payload[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

/** Newest first, with the id tiebreaker the API uses. */
function compareNotifications(a: Notification, b: Notification): number {
  const byTime = b.createdAt.localeCompare(a.createdAt)
  return byTime !== 0 ? byTime : b.id.localeCompare(a.id)
}

/** Resolve the row's actor, preferring the API-enriched display name. */
function actorName(notification: Notification): string {
  return (
    stringPayload(notification, "actorName") ??
    notification.actorId ??
    "Someone"
  )
}

function notificationTarget(
  notification: Notification
): NotificationIssueTarget | null {
  const workspaceId = stringPayload(notification, "workspaceId")
  const identifier = stringPayload(notification, "issueIdentifier")
  if (!workspaceId || !identifier) return null
  return {
    workspaceId,
    identifier,
    title: stringPayload(notification, "issueTitle") ?? identifier,
  }
}

/**
 * Inbox: the signed-in user's notifications, newest first, with All/Unread
 * filters and cursor pagination, plus their pending workspace invitations.
 * Invitations are account-level (not project-level): an invitee who never
 * opened the invite link still finds it here and can accept it. Rows mark
 * themselves read before handing the issue target to the shell, which
 * selects the workspace and opens the issue.
 */
export function Inbox({
  onOpenIssue,
  onUnreadCountChange,
  onInvitationAccepted,
  activeFilter,
  onFilterChange,
}: {
  onOpenIssue: (target: NotificationIssueTarget) => void
  /** Keeps the rail badge in step with the list's server `unreadCount`. */
  onUnreadCountChange?: (count: number) => void
  /** Refresh the workspace list after the user joins a workspace. */
  onInvitationAccepted?: () => void
  /** URL-controlled filter; when omitted the component owns its filter. */
  activeFilter?: NotificationFilter
  onFilterChange?: (filter: NotificationFilter) => void
}) {
  const [internalFilter, setInternalFilter] =
    useState<NotificationFilter>("all")
  const filter = activeFilter ?? internalFilter
  function changeFilter(next: NotificationFilter) {
    if (activeFilter !== undefined) onFilterChange?.(next)
    else setInternalFilter(next)
  }
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<InvitationInbox[] | null>(null)
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  // Held in a ref so an inline parent callback cannot re-trigger the fetch
  // effect (and loop through the parent's badge state).
  const notifyUnread = useRef(onUnreadCountChange)
  notifyUnread.current = onUnreadCountChange

  const load = useCallback(async (activeFilter: NotificationFilter) => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.listNotifications({ filter: activeFilter })
      setNotifications(page.notifications)
      setNextCursor(page.nextCursor)
      setUnreadCount(page.unreadCount)
      notifyUnread.current?.(page.unreadCount)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications"
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setNotifications([])
    setNextCursor(null)
    void load(filter)
  }, [filter, load])

  useEffect(() => {
    let cancelled = false
    setInvitesError(null)
    api
      .listMyInvitations()
      .then((loaded) => {
        if (!cancelled) setInvitations(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setInvitations([])
          setInvitesError(
            err instanceof Error ? err.message : "Failed to load invitations"
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A notification created or marked read by another tab updates this list
  // immediately; the rail badge has its own live count and 30-second poll as a
  // fallback.
  const applyLiveNotifications = useCallback(
    (rows: readonly Notification[]) => {
      setNotifications((current) => {
        const byId = new Map(current.map((item) => [item.id, item]))
        for (const row of rows) byId.set(row.id, row)
        const next = [...byId.values()].sort(compareNotifications)
        return filter === "unread"
          ? next.filter((item) => item.readAt === null)
          : next
      })
    },
    [filter]
  )

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await api.listNotifications({
        filter,
        before: nextCursor,
      })
      setNotifications((current) => {
        const seen = new Set(current.map((item) => item.id))
        return [
          ...current,
          ...page.notifications.filter((item) => !seen.has(item.id)),
        ]
      })
      setNextCursor(page.nextCursor)
      setUnreadCount(page.unreadCount)
      notifyUnread.current?.(page.unreadCount)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notifications"
      )
    } finally {
      setLoadingMore(false)
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || markingAll) return
    setMarkingAll(true)
    setError(null)
    try {
      await api.markAllNotificationsRead()
      setUnreadCount(0)
      notifyUnread.current?.(0)
      await load(filter)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark all read")
    } finally {
      setMarkingAll(false)
    }
  }

  function openNotification(notification: Notification) {
    const target = notificationTarget(notification)
    if (!notification.readAt) {
      const readAt = new Date().toISOString()
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt } : item
        )
      )
      setUnreadCount((current) => {
        const next = Math.max(0, current - 1)
        notifyUnread.current?.(next)
        return next
      })
    }
    // Idempotent: safe even when the row was already read.
    void api.markNotificationRead(notification.id).catch(() => {
      // Navigation still proceeds; the next poll reconciles the badge.
    })
    if (target) onOpenIssue(target)
  }

  async function acceptInvite(invitation: InvitationInbox) {
    if (actingId) return
    setActingId(invitation.id)
    setInvitesError(null)
    try {
      await api.acceptInvitation(invitation.id)
      setInvitations((current) =>
        current ? current.filter((item) => item.id !== invitation.id) : current
      )
      onInvitationAccepted?.()
    } catch (err) {
      setInvitesError(
        err instanceof Error ? err.message : "Couldn't accept the invitation."
      )
    } finally {
      setActingId(null)
    }
  }

  async function declineInvite(invitation: InvitationInbox) {
    if (actingId) return
    setActingId(invitation.id)
    setInvitesError(null)
    try {
      await api.deleteInvitation(invitation.id)
      setInvitations((current) =>
        current ? current.filter((item) => item.id !== invitation.id) : current
      )
    } catch (err) {
      setInvitesError(
        err instanceof Error ? err.message : "Couldn't decline the invitation."
      )
    } finally {
      setActingId(null)
    }
  }

  const emptyMessage =
    filter === "unread" ? "No unread notifications." : "No notifications yet."

  return (
    <section aria-label="Inbox" className="flex max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Inbox</h2>
          <p className="text-muted-foreground text-sm">
            Updates from issues you watch or were mentioned in.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unreadCount === 0 || markingAll}
          onClick={() => void markAllRead()}
        >
          Mark all read
        </Button>
      </header>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">Workspace invitations</h3>
        {invitesError && (
          <p className="text-destructive text-sm">{invitesError}</p>
        )}
        {invitations === null ? (
          <p className="text-muted-foreground text-sm">Loading invitations…</p>
        ) : invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invitations.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {invitation.workspace.name}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    {invitation.inviter.name ??
                      invitation.inviter.email ??
                      "A workspace admin"}{" "}
                    invited you as {invitation.role}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={actingId === invitation.id}
                  onClick={() => void acceptInvite(invitation)}
                >
                  {actingId === invitation.id ? "Joining…" : "Accept"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={actingId === invitation.id}
                  onClick={() => void declineInvite(invitation)}
                >
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Notification filter"
        className="flex gap-1"
      >
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            onClick={() => changeFilter(option.id)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm ${
              filter === option.id ? "bg-accent font-medium" : ""
            }`}
          >
            {option.label}
            {option.id === "unread" && unreadCount > 0 && (
              <span
                data-testid="unread-tab-count"
                className="rounded-full bg-primary px-1.5 font-medium text-[10px] text-primary-foreground"
              >
                {formatUnreadCount(unreadCount)}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading notifications…</p>
      ) : notifications.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {notifications.map((notification) => {
            const identifier =
              stringPayload(notification, "issueIdentifier") ?? "Issue"
            const title =
              stringPayload(notification, "issueTitle") ?? notification.issueId
            const unread = notification.readAt === null
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent ${
                    unread ? "bg-accent/40" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    data-read={unread ? "false" : "true"}
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      unread ? "bg-primary" : "bg-transparent"
                    }`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {actorName(notification)}
                      </span>{" "}
                      <span>
                        {ACTION_TEXT[notification.type] ?? notification.type}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-mono text-muted-foreground text-xs">
                        {identifier}
                      </span>
                      <span className="truncate">{title}</span>
                    </span>
                  </span>
                  <time
                    dateTime={notification.createdAt}
                    className="shrink-0 text-muted-foreground text-xs"
                  >
                    {formatRelativeTime(notification.createdAt)}
                  </time>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {nextCursor && !loading && (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            Load more
          </Button>
        </div>
      )}

      {realtimeEnabled && (
        <>
          <LiveNotificationsBridge onRows={applyLiveNotifications} />
          <LiveUnreadCountBridge
            onCount={(count) => {
              setUnreadCount(count)
              notifyUnread.current?.(count)
            }}
          />
        </>
      )}
    </section>
  )
}
