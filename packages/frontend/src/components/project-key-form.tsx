import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Project } from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Edit a Project Key. Allowed before the first Issue; the API rejects it
 * with a locked error afterwards, surfaced here.
 */
export function ProjectKeyForm({
  project,
  onUpdated,
}: {
  project: Project
  onUpdated: (project: Project) => void
}) {
  const [key, setKey] = useState(project.key)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onUpdated(await api.updateProject(project.id, { key: key.trim() }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <input
        className={inputClass}
        aria-label="Project key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        required
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save key"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
