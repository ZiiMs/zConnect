import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/dialog"
import {
  api,
  type GitHubItemKind,
  type Issue,
  type LinkedIssueRef,
} from "@/lib/api"

/**
 * Link dialog (#52): search the project's Issues by identifier or title,
 * then link the GitHub Item behind the row to the chosen Issue. Search goes
 * through the existing issue list query, whose text filter matches both.
 */
export function GitHubLinkDialog({
  open,
  onOpenChange,
  projectId,
  kind,
  repositoryId,
  number,
  onLinked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  kind: GitHubItemKind
  repositoryId: string
  number: number
  onLinked: (linkedIssues: LinkedIssueRef[]) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Issue[]>([])
  const [selected, setSelected] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // Reopening starts from a clean search, selection, and error.
      setQuery("")
      setResults([])
      setSelected(null)
      setError(null)
      return
    }
    let cancelled = false
    const text = query.trim()
    setLoading(true)
    setError(null)
    void api
      .listIssues(projectId, text === "" ? undefined : { text })
      .then((issues) => {
        if (!cancelled) setResults(issues)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to search")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, query])

  function changeQuery(value: string) {
    setQuery(value)
    setSelected(null)
  }

  async function handleLink() {
    if (!selected || sending) return
    setSending(true)
    setError(null)
    try {
      const response = await api.linkGitHubItem(projectId, {
        kind,
        repositoryId,
        number,
        issue: selected.identifier,
      })
      onLinked(response.linkedIssues)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Linking failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Link to Issue"
      description={`Choose a project Issue for #${number}.`}
    >
      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label="Search issues"
          placeholder="Search by identifier or title…"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />

        {error && <p className="text-destructive text-sm">{error}</p>}
        {loading && <p className="text-muted-foreground text-sm">Searching…</p>}
        {!loading && results.length === 0 && (
          <p className="text-muted-foreground text-sm">No issues found.</p>
        )}
        {!loading && results.length > 0 && (
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
            {results.map((issue) => {
              const active = selected?.id === issue.id
              return (
                <li key={issue.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(issue)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <span className="font-mono text-muted-foreground text-xs">
                      {issue.identifier}
                    </span>
                    <span className="truncate">{issue.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={!selected || sending}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm disabled:opacity-50"
          >
            {sending ? "Linking…" : "Link"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
