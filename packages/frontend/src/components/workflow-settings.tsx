import { Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import type { Project, Status, StatusCategory } from "@/lib/api"
import { api, STATUS_CATEGORIES } from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

function issueCountText(status: Status): string {
  const count = status.issueCount ?? 0
  return `${count} ${count === 1 ? "issue" : "issues"}`
}

/**
 * Standalone project workflow editor (Linear-style): one card divided into
 * the six Status Category sections in roster order. The coordinator wires it
 * into settings later; it fetches and mutates statuses on its own.
 */
export function WorkflowSettings({
  project,
  canManage,
}: {
  project: Project
  canManage: boolean
}) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creatingCategory, setCreatingCategory] =
    useState<StatusCategory | null>(null)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#94a3b8")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    api
      .listStatuses(project.id)
      .then((loaded) => {
        if (!cancelled) {
          setStatuses([...loaded].sort((a, b) => a.position - b.position))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project.id])

  function openCreate(category: StatusCategory) {
    setCreatingCategory(category)
    setNewName("")
    setNewColor("#94a3b8")
    setActionError(null)
  }

  async function handleCreate(
    event: React.FormEvent,
    category: StatusCategory
  ) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setActionError(null)
    try {
      const created = await api.createStatus(project.id, {
        name,
        category,
        color: newColor,
      })
      setStatuses((current) =>
        [...current, created].sort((a, b) => a.position - b.position)
      )
      setCreatingCategory(null)
      setNewName("")
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(statusId: string) {
    setActionError(null)
    try {
      await api.deleteStatus(project.id, statusId)
      // Re-read so a promoted Default status and issue counts stay accurate.
      const loaded = await api.listStatuses(project.id)
      setStatuses([...loaded].sort((a, b) => a.position - b.position))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed")
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading statuses…</p>
  }

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {actionError && <p className="text-destructive text-sm">{actionError}</p>}
      {statuses.length === 0 && (
        <p className="text-muted-foreground text-sm">No statuses yet.</p>
      )}
      <div className="rounded-md border bg-card">
        {STATUS_CATEGORIES.map((category) => {
          const rows = statuses.filter((s) => s.category === category)
          return (
            <section
              key={category}
              aria-label={category}
              className="border-b p-3 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-muted-foreground text-sm">{category}</h3>
                {canManage && creatingCategory !== category && (
                  <button
                    type="button"
                    aria-label={`Add status to ${category}`}
                    onClick={() => openCreate(category)}
                    className="rounded-md p-1 text-muted-foreground hover:opacity-80"
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {rows.map((status) => (
                  <li key={status.id} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${status.color}1a` }}
                    >
                      <StatusIcon status={status} size={16} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="flex items-center gap-2 font-medium text-sm">
                        {status.name}
                        {status.isDefault && (
                          <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground text-xs">
                            Default
                          </span>
                        )}
                      </p>
                      {status.description && (
                        <p className="text-muted-foreground text-sm">
                          {status.description}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {issueCountText(status)}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        aria-label={`Delete ${status.name}`}
                        onClick={() => void handleDelete(status.id)}
                        className="rounded-md p-1 text-muted-foreground hover:opacity-80"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canManage && creatingCategory === category && (
                <form
                  className="mt-2 flex items-center gap-2"
                  onSubmit={(e) => void handleCreate(e, category)}
                >
                  <input
                    className="w-full rounded-md border bg-background px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
                    aria-label={`New ${category} status`}
                    placeholder={`New ${category} status`}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                  <input
                    className="h-8 w-10 shrink-0 cursor-pointer rounded-md border bg-background px-1"
                    aria-label="Status color"
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="shrink-0 rounded-md border px-2 py-1 text-sm"
                  >
                    {saving ? "Adding…" : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingCategory(null)}
                    className="shrink-0 rounded-md border px-2 py-1 text-sm"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
