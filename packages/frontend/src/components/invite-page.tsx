import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ApiError, api, type InvitationDetails, type Member } from "@/lib/api"

function errorStatus(err: unknown): number | null {
  if (err instanceof ApiError) return err.status
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status
  }
  return null
}

function loadMessage(err: unknown): string {
  switch (errorStatus(err)) {
    case 404:
      return "This invitation no longer exists."
    case 403:
      return "This invitation was sent to a different email address."
    case 410:
      return "This invitation has expired."
    default:
      return err instanceof Error
        ? err.message
        : "Couldn't load this invitation."
  }
}

function formatExpiry(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Invitation accept page (§3): a centered card outside the workspace shell.
 * The session email gate, expiry, and unknown-id cases are enforced by the
 * API; this view maps those statuses to the copy the invitee sees. Joining
 * hands the loaded invitation back to `App`, which refreshes the workspace
 * list and navigates to the joined workspace.
 */
export function InvitePage({
  invitationId,
  onAccepted,
}: {
  invitationId: string
  onAccepted: (invitation: InvitationDetails, member: Member) => void
}) {
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setInvitation(null)
    setLoadError(null)
    setAcceptError(null)
    void api
      .getInvitation(invitationId)
      .then((loaded) => {
        if (active) setInvitation(loaded)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(loadMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [invitationId])

  async function handleAccept() {
    if (!invitation || accepting) return
    setAccepting(true)
    setAcceptError(null)
    try {
      const member = await api.acceptInvitation(invitation.id)
      onAccepted(invitation, member)
    } catch (err) {
      setAcceptError(
        err instanceof Error ? err.message : "Couldn't join the workspace."
      )
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div
        data-testid="invite-page"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
      >
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading invitation…</p>
        ) : loadError ? (
          <p role="alert" className="text-destructive text-sm">
            {loadError}
          </p>
        ) : invitation ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                Workspace invitation
              </p>
              <h1 className="font-semibold text-lg">
                {invitation.workspace.name}
              </h1>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Invited by</dt>
                <dd className="flex min-w-0 flex-col items-end text-right">
                  <span className="truncate font-medium">
                    {invitation.inviter.name ??
                      invitation.inviter.email ??
                      "A workspace admin"}
                  </span>
                  {invitation.inviter.name && invitation.inviter.email && (
                    <span className="truncate text-muted-foreground text-xs">
                      {invitation.inviter.email}
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{invitation.role}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Expires</dt>
                <dd>
                  <time dateTime={invitation.expiresAt}>
                    {formatExpiry(invitation.expiresAt)}
                  </time>
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-sm">
              Join this workspace to see its projects and issues. This
              invitation is for {invitation.email}.
            </p>
            {acceptError && (
              <p role="alert" className="text-destructive text-sm">
                {acceptError}
              </p>
            )}
            <Button onClick={() => void handleAccept()} disabled={accepting}>
              {accepting ? "Joining…" : "Join workspace"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
