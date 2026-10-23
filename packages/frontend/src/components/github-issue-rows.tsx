import { CircleCheck, CircleDot, MessageSquare } from "lucide-react"
import { RowActionsCell, UnavailableBadge } from "@/components/github-row-bits"
import type { GitHubIssueRow } from "@/lib/api"
import { formatRelativeTime } from "@/lib/relative-time"

const cell = "px-2 py-2 align-middle"
const badge =
  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
const labelBadge =
  "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"

function StateIcon({ state }: { state: GitHubIssueRow["state"] }) {
  if (state === "closed") {
    return (
      <CircleCheck
        aria-label="Closed"
        className="size-4 text-violet-500"
        aria-hidden={false}
      />
    )
  }
  return (
    <CircleDot
      aria-label="Open"
      className="size-4 text-emerald-500"
      aria-hidden={false}
    />
  )
}

/**
 * GitHub Issue rows (#50): state, number, title, author, labels, assignees,
 * comments, linked Issue chips, and the last update. The whole row opens the
 * GitHub URL in a new tab; project writers also get the trailing actions
 * menu (#52).
 */
export function GitHubIssueTable({
  rows,
  showRepository,
  unavailableRepositories,
  canWrite = false,
  onLink,
  onCreate,
}: {
  rows: GitHubIssueRow[]
  showRepository: boolean
  /** Full names of repositories whose last sync failed; rows stay visible. */
  unavailableRepositories?: ReadonlySet<string>
  /** Writers get the trailing actions menu; Viewers do not. */
  canWrite?: boolean
  onLink?: (row: GitHubIssueRow) => void
  onCreate?: (row: GitHubIssueRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table aria-label="GitHub issues" className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground text-xs">
            <th className="px-2 py-1 font-medium">
              <span className="sr-only">State</span>
            </th>
            <th className="px-2 py-1 font-medium">#</th>
            <th className="px-2 py-1 font-medium">Title</th>
            {showRepository && (
              <th className="px-2 py-1 font-medium">Repository</th>
            )}
            <th className="px-2 py-1 font-medium">Author</th>
            <th className="px-2 py-1 font-medium">Labels</th>
            <th className="px-2 py-1 font-medium">Assignees</th>
            <th className="px-2 py-1 font-medium">
              <MessageSquare
                className="size-3"
                aria-label="Comments"
                aria-hidden={false}
              />
            </th>
            <th className="px-2 py-1 font-medium">Linked</th>
            <th className="px-2 py-1 font-medium">Updated</th>
            {canWrite && (
              <th className="px-2 py-1 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid={`github-issue-row-${row.number}`}
              onClick={() =>
                window.open(row.url, "_blank", "noopener,noreferrer")
              }
              className="cursor-pointer border-b last:border-b-0 hover:bg-accent/60"
            >
              <td className={cell}>
                <StateIcon state={row.state} />
              </td>
              <td className={`${cell} text-muted-foreground tabular-nums`}>
                #{row.number}
              </td>
              <td className={`${cell} max-w-80`}>
                <span className="flex items-center gap-1.5">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="truncate font-medium hover:underline"
                  >
                    {row.title}
                  </a>
                  {!showRepository && (
                    <UnavailableBadge
                      show={
                        unavailableRepositories?.has(row.repository) ?? false
                      }
                    />
                  )}
                </span>
              </td>
              {showRepository && (
                <td className={`${cell} text-muted-foreground text-xs`}>
                  <span className="flex items-center gap-1.5">
                    {row.repository}
                    <UnavailableBadge
                      show={
                        unavailableRepositories?.has(row.repository) ?? false
                      }
                    />
                  </span>
                </td>
              )}
              <td className={`${cell} whitespace-nowrap text-xs`}>
                {row.authorLogin}
              </td>
              <td className={cell}>
                {row.labels.length === 0 ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {row.labels.map((label) => (
                      <span key={label.name} className={labelBadge}>
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: `#${label.color}` }}
                        />
                        {label.name}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td className={cell}>
                {row.assignees.length === 0 ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {row.assignees.map((assignee) => (
                      <span key={assignee.login} className={badge}>
                        {assignee.login}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td
                className={`${cell} text-muted-foreground text-xs tabular-nums`}
              >
                {row.commentCount}
              </td>
              <td className={cell}>
                {row.linkedIssues.length === 0 ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {row.linkedIssues.map((link) => (
                      <span
                        key={link.linkId}
                        title={link.title}
                        className="rounded-full border border-border bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground"
                      >
                        {link.identifier}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td
                className={`${cell} whitespace-nowrap text-muted-foreground text-xs`}
              >
                {formatRelativeTime(row.githubUpdatedAt)}
              </td>
              {canWrite && (
                <RowActionsCell
                  url={row.url}
                  onLink={() => onLink?.(row)}
                  onCreate={() => onCreate?.(row)}
                />
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
