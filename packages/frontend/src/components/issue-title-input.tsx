import { useEffect, useRef, useState } from "react"
import type { TitleSaveState } from "@/hooks/use-autosave-issue"

/**
 * Inline title (§3 + §7): click-to-edit, Enter/blur commits, Esc cancels,
 * whitespace-only shows an inline hint. Read-only when `canEdit` is false.
 */
export function IssueTitleInput({
  identifier,
  value,
  state,
  error,
  canEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  identifier: string
  value: string
  state: TitleSaveState
  error: string | null
  canEdit: boolean
  onChange: (next: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // External save landing while editing: leave edit mode.
  useEffect(() => {
    if (state === "saved") setEditing(false)
  }, [state])

  if (!canEdit) {
    return <h2 className="mt-1 font-semibold text-xl leading-snug">{value}</h2>
  }

  if (!editing) {
    return (
      <div>
        <h2 className="mt-1 font-semibold text-xl leading-snug">
          <button
            type="button"
            aria-label={`Edit title for ${identifier}`}
            onClick={() => setEditing(true)}
            className="block w-full rounded text-left hover:bg-accent/50"
          >
            {value}
          </button>
        </h2>
        {state === "saving" && (
          <span className="text-muted-foreground text-xs">Saving…</span>
        )}
        {state === "error" && (
          <span className="text-destructive text-xs">
            Couldn&apos;t save —{" "}
            <button
              type="button"
              className="underline"
              onClick={() => onCommit()}
            >
              Retry
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      <input
        ref={inputRef}
        aria-label={`Title for ${identifier}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          void onCommit()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void onCommit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            onCancel()
            setEditing(false)
          }
        }}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 font-semibold text-xl leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {(error || value.trim() === "") && (
        <p className="mt-1 text-destructive text-xs">Title is required</p>
      )}
      {state === "saving" && (
        <span className="text-muted-foreground text-xs">Saving…</span>
      )}
    </div>
  )
}
