import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  api,
  STATUS_CATEGORIES,
  type Status,
  type StatusCategory,
} from "@/lib/api"
import { defaultColorForStatusName } from "@/lib/status-colors"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

const categories: StatusCategory[] = [...STATUS_CATEGORIES]

/** Define an ordered status with its Status Category for a project. */
export function CreateStatusForm({
  projectId,
  onCreated,
}: {
  projectId: string
  onCreated: (status: Status) => void
}) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<StatusCategory>("Backlog")
  const [color, setColor] = useState("#94a3b8")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    const trimmed = value.trim()
    if (trimmed) {
      const known = defaultColorForStatusName(trimmed)
      if (known !== "#94a3b8") setColor(known)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onCreated(
        await api.createStatus(projectId, {
          name: name.trim(),
          category,
          color,
        })
      )
      setName("")
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
          aria-label="Status name"
          placeholder="New status name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
        />
        <select
          className={inputClass}
          aria-label="Status category"
          value={category}
          onChange={(e) => setCategory(e.target.value as StatusCategory)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background px-1"
          aria-label="Status color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <Button type="submit" disabled={sending}>
          {sending ? "Adding…" : "Add status"}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
