import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Invitation } from "@/lib/api"

function formatExpiry(value: string | undefined): string {
  if (!value) return "No expiry"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Pending workspace invitations for the members tab: email, role, expiry,
 * and a cancel action. The parent remounts this (via `key`) after an invite
 * is created so the list refreshes.
 */
export function PendingInvites({ workspaceId }: { workspaceId: string }) {
  const [invites, setInvites] = useState<Invitation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const loaded = await api.listWorkspaceInvites(workspaceId)
      setInvites(loaded)
    } catch (err) {
      setInvites(null)
      setError(err instanceof Error ? err.message : "Failed to load invites")
    }
  }, [workspaceId])

  useEffect(() => {
    setInvites(null)
    void load()
  }, [load])

  async function handleCancel(invitation: Invitation) {
    if (cancellingId) return
    setCancellingId(invitation.id)
    setError(null)
    try {
      await api.deleteInvitation(invitation.id)
      setInvites((current) =>
        current ? current.filter((item) => item.id !== invitation.id) : current
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed")
    } finally {
      setCancellingId(null)
    }
  }

  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!invites) {
    return <p className="text-muted-foreground text-sm">Loading invites…</p>
  }
  if (invites.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending invites.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">{invite.email}</span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {invite.role} · expires {formatExpiry(invite.expiresAt)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cancellingId === invite.id}
            onClick={() => void handleCancel(invite)}
          >
            {cancellingId === invite.id ? "Cancelling…" : "Cancel"}
          </Button>
        </li>
      ))}
    </ul>
  )
}
