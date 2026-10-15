import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { ExternalLink } from "@/lib/external-links"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** Pastes a PR, branch, or commit URL as an External Link on the issue. */
export function ExternalLinkForm({
  onAdd,
}: {
  onAdd: (url: string) => Promise<ExternalLink>
}) {
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setSending(true)
    setError(null)
    try {
      await onAdd(trimmed)
      setUrl("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adding failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          className={inputClass}
          aria-label="Paste a PR, branch, or commit URL"
          placeholder="https://github.com/acme/web/pull/7"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit" disabled={sending || !url.trim()}>
          {sending ? "Adding…" : "Add link"}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
