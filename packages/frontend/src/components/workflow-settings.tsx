import { GripVertical, Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { Project, Status, StatusCategory } from "@/lib/api"
import { api, STATUS_CATEGORIES } from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

function issueCountText(status: Status): string {
  const count = status.issueCount ?? 0
  return `${count} ${count === 1 ? "issue" : "issues"}`
}

/**
 * Project workflow editor (Linear-style): a single card of Status Category
 * sections in roster order. Each section opens with a muted pill header row
 * (category name plus the add button); statuses render beneath it as
 * icon-tile rows with the name, an inline "· Default" marker, and a
 * "{n} issues · description" meta line. Row actions reveal on hover so the
 * resting card reads like the reference: headers, tiles, and counts.
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
  const [moving, setMoving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    before: boolean
  } | null>(null)
  /** Drag source id, readable during dragover (dataTransfer isn't). */
  const dragIdRef = useRef<string | null>(null)

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

  /** Global position order, used for drag-and-drop index math. */
  const orderedStatuses = [...statuses].sort((a, b) => a.position - b.position)

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

  /**
   * Drag-and-drop reorder within a category section: the backend splices
   * the status into the project's global position order at the given
   * index. Display groups by category, so drops stay inside the dragged
   * row's section — the same order every layout (board, filters, detail)
   * renders.
   */
  async function moveStatusTo(statusId: string, at: number) {
    const ordered = [...statuses].sort((a, b) => a.position - b.position)
    const from = ordered.findIndex((s) => s.id === statusId)
    if (from === -1 || from === at || moving) return
    setMoving(true)
    setActionError(null)
    try {
      await api.updateStatus(project.id, statusId, { position: at })
      const loaded = await api.listStatuses(project.id)
      setStatuses([...loaded].sort((a, b) => a.position - b.position))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Move failed")
    } finally {
      setMoving(false)
    }
  }

  function clearDrag() {
    dragIdRef.current = null
    setDragId(null)
    setDropTarget(null)
  }

  function handleDragStart(event: React.DragEvent, status: { id: string }) {
    if (!canManage) {
      event.preventDefault()
      return
    }
    dragIdRef.current = status.id
    setDragId(status.id)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = "move"
    try {
      event.dataTransfer.setData("text/plain", status.id)
    } catch {
      // Some test environments lack setData; the ref carries the id.
    }
  }

  function handleDragOverRow(
    event: React.DragEvent,
    status: { id: string; category: StatusCategory }
  ) {
    const sourceId = dragIdRef.current
    if (!sourceId || sourceId === status.id) return
    const dragged = orderedStatuses.find((s) => s.id === sourceId)
    if (!dragged || dragged.category !== status.category) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    setDropTarget((prev) =>
      prev && prev.id === status.id && prev.before === before
        ? prev
        : { id: status.id, before }
    )
  }

  function handleDropRow(
    event: React.DragEvent,
    status: { id: string; category: StatusCategory }
  ) {
    event.preventDefault()
    let sourceId = dragIdRef.current
    if (!sourceId) {
      try {
        sourceId = event.dataTransfer.getData("text/plain") || null
      } catch {
        sourceId = null
      }
    }
    clearDrag()
    if (!sourceId || sourceId === status.id) return
    const dragged = orderedStatuses.find((s) => s.id === sourceId)
    if (!dragged || dragged.category !== status.category) return
    const ordered = orderedStatuses
    const from = ordered.findIndex((s) => s.id === sourceId)
    const atTarget = ordered.findIndex((s) => s.id === status.id)
    if (from === -1 || atTarget === -1) return
    // Read the half from the event itself: the dragover indicator state
    // hasn't re-rendered yet when drop fires in the same tick.
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    const at =
      before === true
        ? atTarget > from
          ? atTarget - 1
          : atTarget
        : atTarget > from
          ? atTarget
          : atTarget + 1
    void moveStatusTo(sourceId, Math.max(0, at))
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
      <div className="rounded-xl border bg-card p-2">
        {STATUS_CATEGORIES.map((category) => {
          const rows = statuses.filter((s) => s.category === category)
          return (
            <section key={category} aria-label={category} className="px-1 py-1">
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
                <h3 className="text-[13px] text-muted-foreground">
                  {category}
                </h3>
                {canManage && creatingCategory !== category && (
                  <button
                    type="button"
                    aria-label={`Add status to ${category}`}
                    onClick={() => openCreate(category)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <ul className="flex flex-col divide-y divide-border/50">
                {rows.map((status) => {
                  const isDragging = dragId === status.id
                  const isDropTarget = dropTarget?.id === status.id
                  return (
                    <li
                      key={status.id}
                      draggable={canManage}
                      onDragStart={(event) => handleDragStart(event, status)}
                      onDragOver={(event) => handleDragOverRow(event, status)}
                      onDragLeave={() =>
                        setDropTarget((prev) =>
                          prev?.id === status.id ? null : prev
                        )
                      }
                      onDrop={(event) => handleDropRow(event, status)}
                      onDragEnd={clearDrag}
                      className={`group flex items-center gap-2 rounded-md px-2 py-2.5 hover:bg-muted/40 ${
                        canManage ? "cursor-grab active:cursor-grabbing" : ""
                      } ${isDragging ? "opacity-50" : ""} ${
                        isDropTarget
                          ? dropTarget.before
                            ? "border-t-2 border-t-primary"
                            : "border-b-2 border-b-primary"
                          : ""
                      }`}
                    >
                      {canManage && (
                        <GripVertical
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${status.color}1a` }}
                      >
                        <StatusIcon status={status} size={16} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="truncate font-medium text-sm">
                          <span>{status.name}</span>
                          {status.isDefault && (
                            <>
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                ·{" "}
                              </span>
                              <span className="font-normal text-muted-foreground">
                                Default
                              </span>
                            </>
                          )}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          <span>{issueCountText(status)}</span>
                          {status.description && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{status.description}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`Delete ${status.name}`}
                          onClick={() => void handleDelete(status.id)}
                          className="rounded-md p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {canManage && creatingCategory === category && (
                <form
                  className="flex items-center gap-2 px-2 pt-1 pb-2"
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
