import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Project } from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** Create a project with a name and key prefix inside a workspace. */
export function CreateProjectForm({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId: string
  onCreated: (project: Project) => void
  /** Shown as a Cancel button when the parent toggles the form. */
  onCancel?: () => void
}) {
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onCreated(
        await api.createProject(workspaceId, {
          name: name.trim(),
          key: key.trim(),
        })
      )
      setName("")
      setKey("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          className={inputClass}
          aria-label="Project name"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className={inputClass}
          aria-label="Project key"
          placeholder="WEB"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
        />
        <Button type="submit" disabled={sending}>
          {sending ? "Creating…" : "Create project"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
