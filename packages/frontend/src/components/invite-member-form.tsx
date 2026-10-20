import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type WorkspaceRole } from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

function canCopyToClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  )
}

/** Invite a Member to a workspace by email with an Owner/Admin/Member role. */
export function InviteMemberForm({
  workspaceId,
  onInvited,
}: {
  workspaceId: string
  onInvited?: () => void
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<WorkspaceRole>("Member")
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; email: string; mailSent: boolean; acceptUrl?: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" })
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setStatus({ kind: "idle" })
    setCopied(false)
    try {
      const invitation = await api.inviteMember(workspaceId, {
        email,
        role,
      })
      setStatus({
        kind: "ok",
        email: invitation.email,
        mailSent: invitation.mailSent === true,
        acceptUrl: invitation.acceptUrl,
      })
      setEmail("")
      onInvited?.()
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Invite failed",
      })
    } finally {
      setSending(false)
    }
  }

  async function handleCopy(acceptUrl: string) {
    if (!canCopyToClipboard()) return
    try {
      await navigator.clipboard.writeText(acceptUrl)
      setCopied(true)
    } catch {
      // Copy is progressive enhancement; the read-only input still works.
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <label className="font-medium text-sm" htmlFor="invite-email">
        Email
      </label>
      <input
        id="invite-email"
        className={inputClass}
        type="email"
        placeholder="member@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <label className="font-medium text-sm" htmlFor="invite-role">
        Role
      </label>
      <select
        id="invite-role"
        className={inputClass}
        value={role}
        onChange={(e) => setRole(e.target.value as typeof role)}
      >
        <option value="Owner">Owner</option>
        <option value="Admin">Admin</option>
        <option value="Member">Member</option>
      </select>
      <Button type="submit" disabled={sending}>
        {sending ? "Inviting…" : "Invite member"}
      </Button>
      {status.kind === "ok" &&
        (status.mailSent ? (
          <p className="text-green-600 text-sm">
            Invited {status.email}. Email sent.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm">Mail is not configured. Share this link:</p>
            <div className="flex items-center gap-2">
              <input
                aria-label="Invitation link"
                className={inputClass}
                readOnly
                value={status.acceptUrl ?? ""}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopy(status.acceptUrl ?? "")}
                disabled={!status.acceptUrl}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ))}
      {status.kind === "error" && (
        <p className="text-destructive text-sm">{status.message}</p>
      )}
    </form>
  )
}
