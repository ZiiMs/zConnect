/**
 * Bits shared by the Pull Request and GitHub Issue rows: the repository
 * freshness badge and the trailing actions cell. Row-specific signals stay in
 * their own table components.
 */
import { GitHubRowActions } from "@/components/github-row-actions"

export const rowCell = "px-2 py-2 align-middle"

/** Cached rows stay visible when their repository's last sync failed. */
export function UnavailableBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400"
      title="GitHub is unavailable for this repository; showing the cached snapshot."
    >
      Unavailable
    </span>
  )
}

/** Trailing table cell for project writers; Viewers never render it. */
export function RowActionsCell({
  url,
  onLink,
  onCreate,
}: {
  url: string
  onLink?: () => void
  onCreate?: () => void
}) {
  return (
    <td className={rowCell}>
      <GitHubRowActions url={url} onLink={onLink} onCreate={onCreate} />
    </td>
  )
}
