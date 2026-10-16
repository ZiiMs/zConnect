import { Plus, RefreshCw } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type Project } from "@/lib/api"
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  PROJECT_COLOR_SWATCHES,
  PROJECT_ICONS,
  ProjectIcon,
  type ProjectIconName,
} from "@/lib/project-icons"
import { slugifyProjectKey } from "@/lib/project-key"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

const sectionLabelClass = "mb-1.5 text-muted-foreground text-xs"

/** Create a project with a name, key prefix, icon mark, and icon color. */
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
  /** True once the key is hand-edited; auto-generation stops then. */
  const [keyDirty, setKeyDirty] = useState(false)
  const [icon, setIcon] = useState<ProjectIconName>(DEFAULT_PROJECT_ICON)
  const [color, setColor] = useState(DEFAULT_PROJECT_COLOR)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    if (!keyDirty) setKey(slugifyProjectKey(value))
  }

  const customColor = !PROJECT_COLOR_SWATCHES.some(
    (swatch) => swatch.value.toLowerCase() === color.toLowerCase()
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      onCreated(
        await api.createProject(workspaceId, {
          name: name.trim(),
          key: key.trim(),
          icon,
          color,
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
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          className={inputClass}
          aria-label="Project name"
          placeholder="Project name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
        />
        <div className="flex h-9 max-w-36 items-center rounded-md border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
          <input
            aria-label="Project key"
            placeholder="Auto"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setKeyDirty(true)
            }}
            required
            style={{ width: `${Math.max(key.length, 4)}ch` }}
            className="min-w-0 bg-transparent font-mono uppercase outline-none placeholder:text-muted-foreground placeholder:normal-case"
          />
          {key.trim() !== "" && (
            <span
              aria-hidden="true"
              data-testid="key-suffix"
              className="shrink-0 font-mono text-muted-foreground"
            >
              -123
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Regenerate key from name"
          title="Regenerate key from name"
          onClick={() => {
            setKey(slugifyProjectKey(name))
            setKeyDirty(false)
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <RefreshCw aria-hidden="true" size={14} />
        </button>
        <Button type="submit" disabled={sending}>
          {sending ? "Creating…" : "Create project"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <fieldset>
        <legend className={sectionLabelClass}>Color</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {PROJECT_COLOR_SWATCHES.map((swatch) => {
            const selected =
              !customColor && swatch.value.toLowerCase() === color.toLowerCase()
            return (
              <label
                key={swatch.value}
                title={swatch.name}
                className="cursor-pointer"
              >
                <input
                  type="radio"
                  name="project-color"
                  value={swatch.value}
                  checked={selected}
                  onChange={() => setColor(swatch.value)}
                  aria-label={`Project color ${swatch.name}`}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`block size-6 rounded-full ${
                    selected
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "hover:ring-2 hover:ring-ring hover:ring-offset-2 hover:ring-offset-background"
                  }`}
                  style={{ backgroundColor: swatch.value }}
                />
              </label>
            )
          })}
          <label title="Custom color" className="cursor-pointer">
            <input
              type="color"
              aria-label="Custom project color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`grid size-6 place-items-center rounded-full border border-muted-foreground border-dashed text-muted-foreground ${
                customColor
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : ""
              }`}
              style={customColor ? { backgroundColor: color } : undefined}
            >
              {!customColor && <Plus size={12} />}
            </span>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className={sectionLabelClass}>Icon</legend>
        <div className="flex flex-wrap gap-1">
          {PROJECT_ICONS.map((option) => (
            <label
              key={option}
              title={option}
              className={`grid size-8 cursor-pointer place-items-center rounded-md border ${
                icon === option
                  ? "border-ring bg-accent"
                  : "border-transparent hover:bg-accent"
              }`}
            >
              <input
                type="radio"
                name="project-icon"
                value={option}
                checked={icon === option}
                onChange={() => setIcon(option)}
                aria-label={`Project icon ${option}`}
                className="sr-only"
              />
              <ProjectIcon icon={option} color={color} size={16} />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
