import { useState } from "react"
import type { ExternalLink } from "@/lib/external-links"

/** Ghost paste line for a PR, branch, or commit URL. Enter submits. */
export function ExternalLinkForm({
  onAdd,
  onClose,
}: {
  onAdd: (url: string) => Promise<ExternalLink>
  onClose: () => void
}) {
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      await onAdd(trimmed)
      setUrl("")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adding failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        className="w-full bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
        aria-label="Paste a PR, branch, or commit URL"
        placeholder="https://github.com/acme/web/pull/7"
        value={url}
        // biome-ignore lint/a11y/noAutofocus: field appears from the user's own "+" press
        autoFocus
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onClose()
          }
        }}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
