import { useCallback, useEffect, useState } from "react"
import { ExternalLinkBadge } from "@/components/external-link-badge"
import { ExternalLinkForm } from "@/components/external-link-form"
import {
  type ExternalLink,
  externalLinksApi,
  type TimelineEvent,
} from "@/lib/external-links"

/**
 * External Links section for an issue: linked PR badges with cached state,
 * the timeline of link events, and the manual paste form. Merge is
 * badge-only — nothing here changes Issue Status.
 */
export function ExternalLinkSection({
  issueIdentifier,
  canWrite,
}: {
  issueIdentifier: string
  canWrite: boolean
}) {
  const [links, setLinks] = useState<ExternalLink[]>([])
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [loadedLinks, loadedEvents] = await Promise.all([
        externalLinksApi.listExternalLinks(issueIdentifier),
        externalLinksApi.listTimelineEvents(issueIdentifier),
      ])
      setLinks(loadedLinks)
      setEvents(loadedEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }, [issueIdentifier])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
      <h4 className="font-medium text-sm">External links</h4>
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
      {events.length > 0 && (
        <ul className="flex flex-col gap-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="text-muted-foreground text-xs"
              data-testid={`timeline-${event.kind}`}
            >
              {event.body}
            </li>
          ))}
        </ul>
      )}
      {canWrite && <ExternalLinkForm onAdd={handleAdd} />}
    </div>
  )
}
