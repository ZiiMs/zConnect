import type { FormEvent } from "react"
import { useState } from "react"
import type { Label } from "@/lib/api"

/**
 * T5 workspace-shared Label selection: checkboxes over the registry rows
 * (name + color swatch), reporting back plain label names so issue
 * create/update payloads stay compatible with the T3 free-form shape.
 */
export function LabelPicker({
  labels,
  selected,
  onChange,
  onCreateLabel,
}: {
  labels: Label[]
  selected: string[]
  onChange: (names: string[]) => void
  onCreateLabel?: (name: string) => Promise<Label>
}) {
  const [draft, setDraft] = useState("")
  const [created, setCreated] = useState<Label[]>([])
  const [error, setError] = useState<string | null>(null)

  const createdIds = new Set(created.map((label) => label.id))
  const existing = labels.filter((label) => !createdIds.has(label.id))

  const topLevel = existing
    .filter((label) => !label.parentId)
    .sort((a, b) => a.name.localeCompare(b.name))

  const childrenByParent = new Map<string, Label[]>()
  for (const label of existing) {
    if (!label.parentId) continue
    const list = childrenByParent.get(label.parentId) ?? []
    list.push(label)
    childrenByParent.set(label.parentId, list)
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  const topIds = new Set(topLevel.map((label) => label.id))
  const orphans = existing
    .filter((label) => label.parentId && !topIds.has(label.parentId))
    .sort((a, b) => a.name.localeCompare(b.name))

  const isEmpty = existing.length === 0 && created.length === 0

  if (!onCreateLabel && isEmpty) {
    return (
      <p className="text-muted-foreground text-sm">
        No labels in this workspace yet.
      </p>
    )
  }

  function toggle(name: string) {
    onChange(
      selected.includes(name)
        ? selected.filter((item) => item !== name)
        : [...selected, name]
    )
  }

  function row(label: Label) {
    return (
      <label
        key={label.id}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-sm hover:bg-accent/50"
      >
        <input
          type="checkbox"
          checked={selected.includes(label.name)}
          onChange={() => toggle(label.name)}
        />
        <span
          data-testid={`label-dot-${label.name}`}
          aria-hidden="true"
          className="inline-block size-3 rounded-full"
          style={{ backgroundColor: label.color }}
        />
        {label.name}
      </label>
    )
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onCreateLabel) return
    const name = draft.trim()
    if (!name) return
    setError(null)
    try {
      const next = await onCreateLabel(name)
      setCreated((prev) => [...prev, next])
      setDraft("")
      onChange([...selected, next.name])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create label")
    }
  }

  return (
    <fieldset className="flex w-full flex-col items-start gap-1">
      <legend className="text-muted-foreground text-xs">Labels</legend>
      {onCreateLabel ? (
        <form onSubmit={handleCreate} className="w-full">
          <input
            type="text"
            aria-label="Create label"
            placeholder="Create label"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      {isEmpty ? (
        <p className="text-muted-foreground text-sm">
          No labels in this workspace yet.
        </p>
      ) : (
        <>
          {created.map((label) => row(label))}
          {topLevel.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? []
            if (children.length === 0) return row(parent)
            return (
              <fieldset
                key={parent.id}
                aria-label={parent.name}
                className="w-full"
              >
                {row(parent)}
                <div className="ml-4 flex flex-col gap-1">
                  {children.map((child) => row(child))}
                </div>
              </fieldset>
            )
          })}
          {orphans.map((label) => row(label))}
        </>
      )}
    </fieldset>
  )
}
