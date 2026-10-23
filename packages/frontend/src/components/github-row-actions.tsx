import { MoreHorizontal } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * Trailing row menu shared by Pull Request and GitHub Issue rows (#52/#53).
 * Rendered only for project writers; Viewers never see the trigger, so no
 * write affordance reaches a read-only surface.
 */
export function GitHubRowActions({
  url,
  onLink,
  onCreate,
}: {
  url: string
  onLink: () => void
  onCreate: () => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-label="GitHub item actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <MoreHorizontal aria-hidden="true" size={16} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="GitHub item actions"
          className="absolute top-full right-0 z-20 mt-1 min-w-44 rounded-md border bg-popover p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              onLink()
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            Link to Issue
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              onCreate()
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            Create Issue
          </button>
          <a
            role="menuitem"
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
            }}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            Open on GitHub
          </a>
        </div>
      )}
    </div>
  )
}
