import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type WorkspaceRole } from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** Invite a Member to a workspace by email with an Owner/Admin/Member role. */
export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<WorkspaceRole>("Member")
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; email: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" })
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setStatus({ kind: "idle" })
    try {
      const invitation = await api.inviteMember(workspaceId, {
        email,
        role,
      })
      setStatus({ kind: "ok", email: invitation.email })
      setEmail("")
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Invite failed",
      })
    } finally {
      setSending(false)
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
      {status.kind === "ok" && (
        <p className="text-green-600 text-sm">Invited {status.email}.</p>
      )}
      {status.kind === "error" && (
        <p className="text-destructive text-sm">{status.message}</p>
      )}
    </form>
  )
}
