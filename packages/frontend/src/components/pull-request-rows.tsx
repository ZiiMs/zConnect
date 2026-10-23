import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  MessageSquare,
} from "lucide-react"
import { GitHubRowActions } from "@/components/github-row-actions"
import type { PullRequestRow } from "@/lib/api"
import { formatRelativeTime } from "@/lib/relative-time"

const cell = "px-2 py-2 align-middle"
const badge =
  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
const unavailableBadge =
  "inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400"

function StateIcon({ state }: { state: PullRequestRow["state"] }) {
  if (state === "merged") {
    return (
      <GitMerge
        aria-label="Merged"
        className="size-4 text-violet-500"
        aria-hidden={false}
      />
    )
  }
  if (state === "closed") {
    return (
      <GitPullRequestClosed
        aria-label="Closed"
        className="size-4 text-red-500"
        aria-hidden={false}
      />
    )
  }
  return (
    <GitPullRequest
      aria-label="Open"
      className="size-4 text-emerald-500"
      aria-hidden={false}
    />
  )
}

function ChecksBadge({ state }: { state: string | null }) {
  if (!state) return <span className="text-muted-foreground text-xs">—</span>
  const tone =
    state === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : state === "failure"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
        : state === "pending"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-border bg-muted text-muted-foreground"
  const label =
    state === "success"
      ? "Checks passed"
      : state === "failure"
        ? "Checks failed"
        : state === "pending"
          ? "Checks pending"
          : "Checks expected"
  return (
    <span className={`${badge} ${tone}`}>
      {state === "success" ? (
        <CircleCheck className="size-3" aria-hidden="true" />
      ) : state === "failure" ? (
        <CircleX className="size-3" aria-hidden="true" />
      ) : state === "pending" ? (
        <Clock className="size-3" aria-hidden="true" />
      ) : (
        <CircleDashed className="size-3" aria-hidden="true" />
      )}
      {label}
    </span>
  )
}

function ReviewBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-muted-foreground text-xs">—</span>
  const label =
    decision === "approved"
      ? "Approved"
      : decision === "changes_requested"
        ? "Changes requested"
        : decision === "review_required"
          ? "Review required"
          : decision
  const tone =
    decision === "approved"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : decision === "changes_requested"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
  return <span className={`${badge} ${tone}`}>{label}</span>
}

/**
 * Pull Request rows (#49). The whole row opens the GitHub URL in a new tab;
 * project writers also get the trailing actions menu (#52).
 */
export function PullRequestTable({
  rows,
  showRepository,
  canWrite = false,
  onLink,
  unavailableRepositories,
}: {
  rows: PullRequestRow[]
  showRepository: boolean
  /** Writers get the trailing actions menu; Viewers do not. */
  canWrite?: boolean
  onLink?: (row: PullRequestRow) => void
  /** Full names of repositories whose last sync failed; rows stay visible. */
  unavailableRepositories?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table aria-label="Pull requests" className="w-full text-sm">
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
            <th className="px-2 py-1 font-medium">Branches</th>
            <th className="px-2 py-1 font-medium">Checks</th>
            <th className="px-2 py-1 font-medium">Review</th>
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
              data-testid={`pull-request-row-${row.number}`}
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
                  {row.draft && (
                    <span className="rounded-full border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">
                      Draft
                    </span>
                  )}
                  {!showRepository &&
                    unavailableRepositories?.has(row.repository) && (
                      <span
                        className={unavailableBadge}
                        title="GitHub is unavailable for this repository; showing the cached snapshot."
                      >
                        Unavailable
                      </span>
                    )}
                </span>
              </td>
              {showRepository && (
                <td className={`${cell} text-muted-foreground text-xs`}>
                  <span className="flex items-center gap-1.5">
                    {row.repository}
                    {unavailableRepositories?.has(row.repository) && (
                      <span
                        className={unavailableBadge}
                        title="GitHub is unavailable for this repository; showing the cached snapshot."
                      >
                        Unavailable
                      </span>
                    )}
                  </span>
                </td>
              )}
              <td className={`${cell} whitespace-nowrap text-xs`}>
                {row.authorLogin}
              </td>
              <td
                className={`${cell} whitespace-nowrap font-mono text-muted-foreground text-xs`}
              >
                {row.sourceBranch} → {row.targetBranch}
              </td>
              <td className={cell}>
                <ChecksBadge state={row.checksState} />
              </td>
              <td className={cell}>
                <ReviewBadge decision={row.reviewDecision} />
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
                <td className={cell}>
                  <GitHubRowActions
                    url={row.url}
                    onLink={() => onLink?.(row)}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
