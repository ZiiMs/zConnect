import { Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { ExternalLinkBadge } from "@/components/external-link-badge"
import { ExternalLinkForm } from "@/components/external-link-form"
import { type ExternalLink, externalLinksApi } from "@/lib/external-links"

/**
 * External Links section for an issue: linked PR badges with cached state
 * and the manual paste form. Link events now live in the merged Activity
 * timeline, so this section no longer fetches them. Merge is badge-only —
 * nothing here changes Issue Status.
 */
export function ExternalLinkSection({
  issueIdentifier,
  canWrite,
}: {
  issueIdentifier: string
  canWrite: boolean
}) {
  const [links, setLinks] = useState<ExternalLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const loadedLinks =
        await externalLinksApi.listExternalLinks(issueIdentifier)
      setLinks(loadedLinks)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }, [issueIdentifier])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Reset the add-row when navigating between issues (render-phase
  // adjustment: the canonical way to reset state on a prop change).
  const [addingIssue, setAddingIssue] = useState(issueIdentifier)
  if (addingIssue !== issueIdentifier) {
    setAddingIssue(issueIdentifier)
    setAdding(false)
  }

  async function handleAdd(url: string) {
    const created = await externalLinksApi.createExternalLink(
      issueIdentifier,
      url
    )
    setLinks((current) =>
      current.some((link) => link.id === created.id)
        ? current
        : [...current, created]
    )
    await refresh()
    return created
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h4 className="font-medium text-sm">External links</h4>
        {canWrite && (
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            aria-label="Add link"
            aria-expanded={adding}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Plus aria-hidden="true" size={14} />
          </button>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {links.length === 0 ? (
        <p className="text-muted-foreground text-sm">No linked PRs yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.id}>
              <ExternalLinkBadge link={link} />
            </li>
          ))}
        </ul>
      )}
      {canWrite && adding && (
        <ExternalLinkForm onAdd={handleAdd} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
