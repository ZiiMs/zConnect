import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Workspace } from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** Create a workspace; the creator becomes its Owner. */
export function CreateWorkspaceForm({
  onCreated,
}: {
  onCreated: (workspace: Workspace) => void
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onCreated(await api.createWorkspace(name.trim()))
      setName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <input
        className={inputClass}
        aria-label="Workspace name"
        placeholder="New workspace name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Button type="submit" disabled={sending}>
        {sending ? "Creating…" : "Create"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
