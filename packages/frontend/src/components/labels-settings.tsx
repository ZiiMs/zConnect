import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import type { Label } from "@/lib/api"
import { api } from "@/lib/api"

/**
 * Short relative timestamp for the Labels registry: "2m ago", "3h ago",
 * "2d ago", "1w ago", then months and years. `now` defaults to Date.now, so
 * callers (and tests) can pass explicit dates without injecting anything.
 */
export function formatLastApplied(
  value: string | null | undefined,
  now: number = Date.now()
): string {
  if (!value) return "—"
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return "—"
  const diff = now - then
  if (diff < 60_000) return "just now"
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/** Created dates render like "Sep 19"; missing values render an em dash. */
export function formatLabelCreatedAt(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/**
 * Walk a label's ancestry to its top-level root. Returns null for top-level
 * labels (no parent, or a parent the list does not contain), so orphans
 * render as top-level rows instead of vanishing.
 */
function rootId(label: Label, byId: Map<string, Label>): string | null {
  let node = label
  const seen = new Set([node.id])
  while (node.parentId) {
    const parent = byId.get(node.parentId)
    if (!parent || seen.has(parent.id)) return null
    if (!parent.parentId || !byId.has(parent.parentId)) return parent.id
    seen.add(parent.id)
    node = parent
  }
  return null
}

/**
 * Workspace label registry (Linear-style settings table). Top-level labels
 * sort by name; parents with children collapse behind a disclosure button and
 * children indent one level beneath them. All label mutations go through the
 * workspace label API; deletes re-fetch so server-promoted children appear.
 */
export function LabelsSettings({
  workspaceId,
  canEdit,
}: {
  workspaceId: string
  canEdit: boolean
}) {
  const [labels, setLabels] = useState<Label[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [newMode, setNewMode] = useState<"label" | "group">("label")
  const [newName, setNewName] = useState("")
  const [savingNew, setSavingNew] = useState(false)
  /** Just-created top-level ids, most recent first: they stay above the sort. */
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  /** Inline click-to-rename: only one cell editor open at a time. */
  const [nameEditingId, setNameEditingId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [savingName, setSavingName] = useState(false)

  const [descEditingId, setDescEditingId] = useState<string | null>(null)
  const [descDraft, setDescDraft] = useState("")
  const [savingDesc, setSavingDesc] = useState(false)

  const [colorEditingId, setColorEditingId] = useState<string | null>(null)
  const [colorDraft, setColorDraft] = useState("#5e6ad2")
  const [savingColor, setSavingColor] = useState(false)

  const [childForId, setChildForId] = useState<string | null>(null)
  const [childName, setChildName] = useState("")
  const [savingChild, setSavingChild] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLabels(await api.listLabels(workspaceId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load labels")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    setLabels(null)
    setPinnedIds([])
    setShowNew(false)
    setNameEditingId(null)
    setDescEditingId(null)
    setColorEditingId(null)
    setChildForId(null)
    setMenuOpenId(null)
    void refresh()
  }, [refresh])

  const { topLevel, childrenByParent } = useMemo(() => {
    const current = labels ?? []
    const byId = new Map(current.map((label) => [label.id, label]))
    const roots = current.map((label) => ({ label, root: rootId(label, byId) }))
    const pinned = new Set(pinnedIds)
    const tops = roots
      .filter((entry) => entry.root === null)
      .map((entry) => entry.label)
      .sort((a, b) => {
        const aPinned = pinned.has(a.id) ? 0 : 1
        const bPinned = pinned.has(b.id) ? 0 : 1
        if (aPinned !== bPinned) return aPinned - bPinned
        if (aPinned === 0)
          return pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id)
        return a.name.localeCompare(b.name)
      })
    const children = new Map<string, Label[]>()
    for (const { label, root } of roots) {
      if (root === null) continue
      const list = children.get(root) ?? []
      list.push(label)
      children.set(root, list)
    }
    for (const list of children.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return { topLevel: tops, childrenByParent: children }
  }, [labels, pinnedIds])

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createTopLevel() {
    const name = newName.trim()
    if (!name || savingNew) return
    setSavingNew(true)
    setActionError(null)
    try {
      const created = await api.createLabel(workspaceId, { name })
      setLabels((prev) => (prev ? [created, ...prev] : [created]))
      setPinnedIds((prev) => [created.id, ...prev])
      setShowNew(false)
      setNewName("")
      // A group starts as a top-level label: open its child row so the
      // user can add labels into it right away.
      if (newMode === "group") {
        setChildForId(created.id)
        setChildName("")
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create label"
      )
    } finally {
      setSavingNew(false)
    }
  }

  async function createChild(parentId: string) {
    const name = childName.trim()
    if (!name || savingChild) return
    setSavingChild(true)
    setActionError(null)
    try {
      const created = await api.createLabel(workspaceId, { name, parentId })
      setLabels((prev) => (prev ? [...prev, created] : [created]))
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete(parentId)
        return next
      })
      setChildForId(null)
      setChildName("")
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create label"
      )
    } finally {
      setSavingChild(false)
    }
  }

  function startNameEdit(label: Label) {
    setNameEditingId(label.id)
    setNameDraft(label.name)
    setDescEditingId(null)
    setColorEditingId(null)
    setMenuOpenId(null)
  }

  function startDescEdit(label: Label) {
    setDescEditingId(label.id)
    setDescDraft(label.description ?? "")
    setNameEditingId(null)
    setColorEditingId(null)
  }

  function startColorEdit(label: Label) {
    setColorEditingId(label.id)
    setColorDraft(label.color)
    setNameEditingId(null)
    setDescEditingId(null)
  }

  async function saveName(id: string) {
    const name = nameDraft.trim()
    if (!name || savingName) return
    setSavingName(true)
    setActionError(null)
    try {
      const updated = await api.updateLabel(workspaceId, id, { name })
      setLabels((prev) =>
        prev ? prev.map((label) => (label.id === id ? updated : label)) : prev
      )
      setNameEditingId(null)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update label"
      )
    } finally {
      setSavingName(false)
    }
  }

  async function saveDescription(id: string) {
    if (savingDesc) return
    setSavingDesc(true)
    setActionError(null)
    try {
      const trimmed = descDraft.trim()
      const updated = await api.updateLabel(workspaceId, id, {
        description: trimmed === "" ? null : trimmed,
      })
      setLabels((prev) =>
        prev ? prev.map((label) => (label.id === id ? updated : label)) : prev
      )
      setDescEditingId(null)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update label"
      )
    } finally {
      setSavingDesc(false)
    }
  }

  async function saveColor(id: string, color: string) {
    if (savingColor) return
    setSavingColor(true)
    setActionError(null)
    try {
      const updated = await api.updateLabel(workspaceId, id, { color })
      setLabels((prev) =>
        prev ? prev.map((label) => (label.id === id ? updated : label)) : prev
      )
      setColorEditingId(null)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update label"
      )
    } finally {
      setSavingColor(false)
    }
  }

  async function handleDelete(id: string) {
    setMenuOpenId(null)
    setActionError(null)
    try {
      await api.deleteLabel(workspaceId, id)
      await refresh()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete label"
      )
    }
  }

  function renderMenu(label: Label) {
    return (
      <td className="relative px-2 py-1.5 text-right">
        <button
          type="button"
          aria-label={`Actions for ${label.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpenId === label.id}
          onClick={() =>
            setMenuOpenId((prev) => (prev === label.id ? null : label.id))
          }
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
        {menuOpenId === label.id && (
          <div
            role="menu"
            aria-label={`Actions for ${label.name}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuOpenId(null)
            }}
            className="absolute right-0 z-10 flex min-w-36 flex-col rounded-md border bg-popover p-1 shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => startNameEdit(label)}
              className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setChildForId(label.id)
                setChildName("")
                setMenuOpenId(null)
              }}
              className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
            >
              Add child label
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleDelete(label.id)}
              className="rounded px-2 py-1 text-left text-destructive text-xs hover:bg-accent"
            >
              Delete
            </button>
          </div>
        )}
      </td>
    )
  }

  function renderColorDot(label: Label) {
    if (colorEditingId === label.id) {
      return (
        <input
          type="color"
          aria-label={`Label color for ${label.name}`}
          value={colorDraft}
          // biome-ignore lint/a11y/noAutofocus: input appears from the user's own click-to-edit
          autoFocus
          onChange={(event) => setColorDraft(event.target.value)}
          onBlur={() => void saveColor(label.id, colorDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveColor(label.id, colorDraft)
            if (event.key === "Escape") setColorEditingId(null)
          }}
          className="h-6 w-8 shrink-0 cursor-pointer rounded border"
        />
      )
    }
    const dot = (
      <span
        aria-hidden="true"
        className="inline-block size-3 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
    )
    if (!canEdit) return dot
    return (
      <button
        type="button"
        aria-label={`Change color for ${label.name}`}
        title="Change color"
        onClick={() => startColorEdit(label)}
        className="rounded-full p-0.5 hover:bg-accent"
      >
        {dot}
      </button>
    )
  }

  function renderNameContent(label: Label, indented: boolean) {
    if (nameEditingId === label.id) {
      return (
        <input
          type="text"
          aria-label="Label name"
          value={nameDraft}
          // biome-ignore lint/a11y/noAutofocus: input appears from the user's own click-to-rename
          autoFocus
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => {
            if (nameDraft.trim() !== "") void saveName(label.id)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveName(label.id)
            if (event.key === "Escape") setNameEditingId(null)
          }}
          className="w-full rounded-md border px-2 py-1 text-sm"
        />
      )
    }
    if (!canEdit) {
      return (
        <span className={indented ? undefined : "font-medium"}>
          {label.name}
        </span>
      )
    }
    return (
      <button
        type="button"
        aria-label={`Rename ${label.name}`}
        title="Rename"
        onClick={() => startNameEdit(label)}
        className="rounded px-1 py-0.5 text-left hover:bg-accent hover:underline"
      >
        <span className={indented ? undefined : "font-medium"}>
          {label.name}
        </span>
      </button>
    )
  }

  function renderDescriptionContent(label: Label) {
    if (descEditingId === label.id) {
      return (
        <input
          type="text"
          aria-label="Label description"
          placeholder="Description"
          value={descDraft}
          // biome-ignore lint/a11y/noAutofocus: input appears from the user's own click-to-edit
          autoFocus
          onChange={(event) => setDescDraft(event.target.value)}
          onBlur={() => void saveDescription(label.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveDescription(label.id)
            if (event.key === "Escape") setDescEditingId(null)
          }}
          className="w-full rounded-md border px-2 py-1 text-sm"
        />
      )
    }
    if (!canEdit) {
      return (
        <span className="text-muted-foreground">
          {label.description || "—"}
        </span>
      )
    }
    return (
      <button
        type="button"
        aria-label={`Edit description for ${label.name}`}
        title="Edit description"
        onClick={() => startDescEdit(label)}
        className="rounded px-1 py-0.5 text-left text-muted-foreground hover:bg-accent hover:underline"
      >
        {label.description || "—"}
      </button>
    )
  }

  function renderRow(label: Label, indented: boolean) {
    return (
      <tr key={label.id} className="border-t">
        <td className={`px-2 py-1.5 ${indented ? "pl-8" : ""}`}>
          <span className="flex items-center gap-2">
            {renderColorDot(label)}
            {renderNameContent(label, indented)}
          </span>
        </td>
        <td className="px-2 py-1.5">{renderDescriptionContent(label)}</td>
        <td className="px-2 py-1.5 tabular-nums">{label.issueCount ?? 0}</td>
        <td className="px-2 py-1.5 text-muted-foreground">
          {formatLastApplied(label.lastAppliedAt)}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground">
          {formatLabelCreatedAt(label.createdAt)}
        </td>
        {canEdit && renderMenu(label)}
      </tr>
    )
  }

  return (
    <section aria-label="Labels" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm">Labels</h3>
        {canEdit && !showNew && (
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNewName("")
                setNewMode("group")
                setShowNew(true)
              }}
              className="rounded-md border px-2.5 py-1.5 font-medium text-xs hover:bg-accent"
            >
              New group
            </button>
            <button
              type="button"
              onClick={() => {
                setNewName("")
                setNewMode("label")
                setShowNew(true)
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 font-medium text-primary-foreground text-xs hover:bg-primary/90"
            >
              <Plus size={14} aria-hidden="true" />
              New label
            </button>
          </span>
        )}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">Loading labels…</p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {actionError && <p className="text-destructive text-sm">{actionError}</p>}

      {!loading && !error && labels && labels.length === 0 && !showNew && (
        <p className="text-muted-foreground text-sm">
          No labels in this workspace yet.
        </p>
      )}

      {!loading && !error && labels && (labels.length > 0 || showNew) && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              <th scope="col" className="px-2 py-1 font-medium">
                Name
              </th>
              <th scope="col" className="px-2 py-1 font-medium">
                Description
              </th>
              <th scope="col" className="px-2 py-1 font-medium">
                Issues
              </th>
              <th scope="col" className="px-2 py-1 font-medium">
                Last applied
              </th>
              <th scope="col" className="px-2 py-1 font-medium">
                Created
              </th>
              {canEdit && (
                <th scope="col" className="px-2 py-1">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {showNew && (
              <tr className="border-t">
                <td colSpan={canEdit ? 6 : 5} className="px-2 py-1.5">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void createTopLevel()
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      aria-label={
                        newMode === "group"
                          ? "New group name"
                          : "New label name"
                      }
                      placeholder={
                        newMode === "group" ? "Group name" : "Label name"
                      }
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void createTopLevel()
                        }
                        if (event.key === "Escape") {
                          setShowNew(false)
                          setNewName("")
                        }
                      }}
                      className="w-full max-w-xs rounded-md border px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={savingNew || newName.trim() === ""}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      {newMode === "group" ? "Add group" : "Add label"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNew(false)
                        setNewName("")
                      }}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Cancel
                    </button>
                  </form>
                </td>
              </tr>
            )}
            {topLevel.map((label) => {
              const children = childrenByParent.get(label.id) ?? []
              const expanded = !collapsed.has(label.id)
              return (
                <Fragment key={label.id}>
                  {children.length > 0 ? (
                    <tr className="border-t">
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`Toggle ${label.name}`}
                            onClick={() => toggleGroup(label.id)}
                            className="rounded p-0.5 hover:bg-accent"
                          >
                            {expanded ? (
                              <ChevronDown size={14} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={14} aria-hidden="true" />
                            )}
                          </button>
                          {renderColorDot(label)}
                          {renderNameContent(label, false)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        {renderDescriptionContent(label)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {label.issueCount ?? 0}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {formatLastApplied(label.lastAppliedAt)}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {formatLabelCreatedAt(label.createdAt)}
                      </td>
                      {canEdit && renderMenu(label)}
                    </tr>
                  ) : (
                    renderRow(label, false)
                  )}
                  {children.length > 0 &&
                    expanded &&
                    children.map((child) => renderRow(child, true))}
                  {childForId === label.id && (
                    <tr key={`${label.id}-new-child`} className="border-t">
                      <td
                        colSpan={canEdit ? 6 : 5}
                        className="py-1.5 pr-2 pl-8"
                      >
                        <form
                          onSubmit={(event) => {
                            event.preventDefault()
                            void createChild(label.id)
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="text"
                            aria-label="Child label name"
                            placeholder="Child label name"
                            value={childName}
                            onChange={(event) =>
                              setChildName(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                void createChild(label.id)
                              }
                              if (event.key === "Escape") {
                                setChildForId(null)
                                setChildName("")
                              }
                            }}
                            className="w-full max-w-xs rounded-md border px-2 py-1 text-sm"
                          />
                          <button
                            type="submit"
                            disabled={savingChild || childName.trim() === ""}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                          >
                            Add child
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setChildForId(null)
                              setChildName("")
                            }}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
