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
}: {
  labels: Label[]
  selected: string[]
  onChange: (names: string[]) => void
}) {
  if (labels.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No labels in this workspace yet.
      </p>
    )
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="text-muted-foreground text-xs">Labels</legend>
      {labels.map((label) => (
        <label key={label.id} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(label.name)}
            onChange={() =>
              onChange(
                selected.includes(label.name)
                  ? selected.filter((name) => name !== label.name)
                  : [...selected, label.name]
              )
            }
          />
          <span
            data-testid={`label-dot-${label.name}`}
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
        </label>
      ))}
    </fieldset>
  )
}
