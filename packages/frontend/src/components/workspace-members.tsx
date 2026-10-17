import { useEffect, useState } from "react"
import { UserAvatar } from "@/components/user-avatar"
import { api, type Member, memberName } from "@/lib/api"

/** Members of the selected workspace with their roles. */
export function WorkspaceMembers({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setMembers(null)
    setError(null)
    api
      .listMembers(workspaceId)
      .then((loaded) => {
        if (!cancelled) setMembers(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load")
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!members)
    return <p className="text-muted-foreground text-sm">Loading members…</p>

  return (
    <ul className="flex flex-col gap-1">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center gap-2 text-sm">
          <UserAvatar
            name={memberName(member, member.userId)}
            image={member.image}
            size={24}
          />
          <span className="truncate">{memberName(member, member.userId)}</span>
          <span className="ml-auto text-muted-foreground">{member.role}</span>
        </li>
      ))}
    </ul>
  )
}
