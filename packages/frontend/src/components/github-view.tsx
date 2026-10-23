import { useCallback, useEffect, useRef, useState } from "react"
import { GitHubCreateDialog } from "@/components/github-create-dialog"
import { GitHubIssueTable } from "@/components/github-issue-rows"
import { GitHubLinkDialog } from "@/components/github-link-dialog"
import { ProjectNavTabs } from "@/components/project-nav-tabs"
import { PullRequestTable } from "@/components/pull-request-rows"
import { Button } from "@/components/ui/button"
import { useGitHubList } from "@/hooks/use-github-list"
import { navigate } from "@/hooks/use-pathname"
import {
  ApiError,
  api,
  type GitHubIssueRow,
  type GitHubItemKind,
  type Issue,
  type LinkedIssueRef,
  type Project,
  type PullRequestRow,
  type Workspace,
} from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import {
  buildGitHubSearch,
  type GitHubViewFilters,
  parseGitHubFilters,
} from "@/lib/github-view"
import { formatRelativeTime } from "@/lib/relative-time"
import {
  buildGitHubPath,
  buildIssuePath,
  buildSettingsPath,
} from "@/lib/routes"

const STALE_AFTER_MS = 5 * 60 * 1000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load"
}

/** The GitHub Item the link dialog is acting on, for either tab. */
interface GitHubLinkTarget {
  kind: GitHubItemKind
  rowId: string
  repositoryId: string
  number: number
}

/** The GitHub Item the create dialog is prefilled from, for either tab. */
interface GitHubCreateTarget {
  kind: GitHubItemKind
  repositoryId: string
  number: number
  title: string
  url: string
  bodyExcerpt: string | null
  /** Repository full name (`owner/name`). */
  repository: string
}

/**
 * GitHub View (#49/#50): the project's read-only Pull Requests and GitHub
 * Issues tabs. Filters live in the query string; a manual refresh asks the
 * backend to sync every linked repository. Repositories with GitHub Issues
 * disabled explain the empty Issues tab instead of erroring.
 */
export function GitHubView({
  workspace,
  project,
  tab,
  canWrite,
  canAdmin,
}: {
  workspace: Workspace
  project: Project
  tab: "pull-requests" | "issues"
  canWrite: boolean
  canAdmin: boolean
}) {
  const [filters, setFilters] = useState<GitHubViewFilters>(() =>
    parseGitHubFilters(window.location.search)
  )
  // The text draft keeps every keystroke while the filtered query reloads.
  const [queryDraft, setQueryDraft] = useState(filters.q)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // The Issues endpoint accepts open/closed/all; a Pull Request state that
  // leaked into the URL (e.g. merged) falls back to the default.
  const issueState =
    filters.state === "closed" || filters.state === "all"
      ? filters.state
      : "open"
  const [linkTarget, setLinkTarget] = useState<GitHubLinkTarget | null>(null)
  const autoRefreshed = useRef(false)
  const [createTarget, setCreateTarget] = useState<GitHubCreateTarget | null>(
    null
  )

  // One pipeline per tab; the inactive one neither loads nor pages.
  const pullRequests = useGitHubList<PullRequestRow>({
    active: tab === "pull-requests",
    projectId: project.id,
    filters: {
      state: filters.state,
      author: filters.author,
      label: filters.label,
      q: filters.q,
    },
    reloadKey,
    fetchPage: api.listPullRequests,
  })
  const issues = useGitHubList<GitHubIssueRow>({
    active: tab === "issues",
    projectId: project.id,
    filters: {
      state: issueState,
      author: filters.author,
      label: filters.label,
      q: filters.q,
    },
    reloadKey,
    fetchPage: api.listGitHubIssues,
  })
  const activeList = tab === "issues" ? issues : pullRequests
  const activeData = activeList.data
  const loading = activeList.loading
  const error = activeList.error

  // Freshness (#51): when ANY linked repository is older than five minutes
  // (or has never synced), ask the backend once per mount. Comparing only the
  // newest timestamp would let one fresh repository hide an older sibling.
  // The cached rows stay visible; a throttled or failed request must not
  // disturb them.
  useEffect(() => {
    if (autoRefreshed.current) return
    if (!activeData?.connection || activeData.repositories.length === 0) return
    // A paused Connection cannot sync; the banner explains why.
    if (activeData.connection.status === "reconnect_required") return
    const stale = activeData.repositories.some((repository) => {
      if (repository.lastSyncedAt === null) return true
      return (
        Date.now() - new Date(repository.lastSyncedAt).getTime() >
        STALE_AFTER_MS
      )
    })
    if (!stale) return
    autoRefreshed.current = true
    // Opening the view is a separate enqueue path from the manual button: it
    // carries the automatic flag so it never consumes the manual throttle.
    void api.refreshGitHub(project.id, { automatic: true }).catch(() => {
      // Throttled or offline: keep serving the snapshot and its stale mark.
    })
  }, [activeData, project.id])

  const updateFilters = useCallback(
    (patch: Partial<GitHubViewFilters>) => {
      setFilters((current) => {
        const next = { ...current, ...patch }
        window.history.replaceState(
          null,
          "",
          `${buildGitHubPath(
            workspace.name,
            project.key,
            tab === "issues" ? "issues" : undefined
          )}${buildGitHubSearch(next)}`
        )
        return next
      })
    },
    [workspace.name, project.key, tab]
  )

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError(null)
    setNotice(null)
    try {
      const response = await api.refreshGitHub(project.id)
      setNotice(
        response.enqueued === 0
          ? "No repositories to refresh."
          : `Refresh requested for ${response.enqueued} ${response.enqueued === 1 ? "repository" : "repositories"}.`
      )
      setReloadKey((key) => key + 1)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.retryAfter ?? 60
        setNotice(
          `Refresh is limited to once a minute. Try again in ${seconds} ${
            seconds === 1 ? "second" : "seconds"
          }.`
        )
      } else {
        setRefreshError(errorMessage(err))
      }
    } finally {
      setRefreshing(false)
    }
  }

  function reconnect() {
    // Same OAuth flow as Settings → Connections: the callback lands on the
    // settings tab, whose `?linked=1` handler finalizes the connection.
    const url = new URL(
      buildSettingsPath(workspace.name, "connections"),
      window.location.origin
    )
    url.searchParams.set("linked", "1")
    void authClient.linkSocial({
      provider: "github",
      scopes: ["repo"],
      callbackURL: url.toString(),
    })
  }

  const activeItems = activeList.items
  const activeCursor = activeList.cursor
  const lastSyncedAt = activeData?.lastSyncedAt ?? null

  function handleLinked(linkedIssues: LinkedIssueRef[]) {
    const target = linkTarget
    if (!target) return
    if (target.kind === "issue") {
      issues.setItems((current) =>
        current.map((row) =>
          row.id === target.rowId ? { ...row, linkedIssues } : row
        )
      )
      return
    }
    pullRequests.setItems((current) =>
      current.map((row) =>
        row.id === target.rowId ? { ...row, linkedIssues } : row
      )
    )
  }

  function handleCreated(created: Issue) {
    setCreateTarget(null)
    // Refetch so the source row shows the new External Link chip, then land
    // on the Issue that now carries it.
    setReloadKey((key) => key + 1)
    navigate(buildIssuePath(workspace.name, created.identifier, created.title))
  }

  const stale =
    lastSyncedAt !== null &&
    (activeData?.repositories ?? []).some(
      (repository) =>
        repository.lastSyncedAt === null ||
        Date.now() - new Date(repository.lastSyncedAt).getTime() >
          STALE_AFTER_MS
    )
  const unavailableRepositories = new Set(
    (activeData?.repositories ?? [])
      .filter((repository) => repository.unavailable)
      .map((repository) => repository.fullName)
  )
  const showRepository = (activeData?.repositories.length ?? 0) > 1
  const hasConnection = Boolean(activeData?.connection)
  const hasRepositories = (activeData?.repositories.length ?? 0) > 0
  const hasFilters =
    filters.author !== "" || filters.q !== "" || filters.label !== ""
  const disabledRepositories = (activeData?.repositories ?? []).filter(
    (repository) => !repository.issuesEnabled
  )
  const issuesDisabled =
    tab === "issues" &&
    hasRepositories &&
    disabledRepositories.length === (activeData?.repositories.length ?? 0)
  const issuesDisabledMessage =
    (activeData?.repositories.length ?? 0) > 1
      ? "GitHub Issues are disabled on these repositories."
      : "GitHub Issues are disabled on this repository."

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      data-can-write={canWrite ? "true" : "false"}
      data-testid="github-view"
    >
      <h2 className="sr-only">{project.name} GitHub View</h2>
      <div className="flex h-7 items-center gap-1.5">
        <ProjectNavTabs
          workspaceName={workspace.name}
          projectKey={project.key}
          current="github"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {lastSyncedAt
              ? `Updated ${formatRelativeTime(lastSyncedAt)}`
              : "Not synced yet"}
          </span>
          {stale && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400">
              Stale
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={refreshing || !hasConnection || !hasRepositories}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
      <div aria-hidden="true" className="-mx-4 border-border border-b" />

      <div className="flex items-center gap-1">
        <div
          role="tablist"
          aria-label="GitHub View tabs"
          className="flex gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pull-requests"}
            onClick={() =>
              navigate(buildGitHubPath(workspace.name, project.key))
            }
            className={`rounded-md px-3 py-1 text-sm ${
              tab === "pull-requests"
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
            }`}
          >
            Pull Requests
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "issues"}
            onClick={() =>
              navigate(buildGitHubPath(workspace.name, project.key, "issues"))
            }
            className={`rounded-md px-3 py-1 text-sm ${
              tab === "issues"
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
            }`}
          >
            GitHub Issues
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">
          {tab === "issues"
            ? "Loading GitHub issues…"
            : "Loading pull requests…"}
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!error && refreshError && (
        <p className="text-destructive text-sm">{refreshError}</p>
      )}
      {notice && (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      )}

      {!loading && !error && activeData && !hasConnection && (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p>GitHub is not connected for this workspace.</p>
          <p className="text-muted-foreground">
            A workspace Owner or Admin can connect it in Settings → Connections.
          </p>
          <button
            type="button"
            className="self-start text-sm underline"
            onClick={() =>
              navigate(buildSettingsPath(workspace.name, "connections"))
            }
          >
            Open GitHub Connection settings
          </button>
        </div>
      )}

      {!loading && !error && activeData && hasConnection && (
        <>
          {activeData.connection?.status === "reconnect_required" && (
            <p
              role="alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm"
            >
              GitHub needs to be reconnected.{" "}
              {canAdmin ? (
                <button type="button" className="underline" onClick={reconnect}>
                  Reconnect
                </button>
              ) : (
                "Ask a workspace admin to reconnect GitHub."
              )}
            </p>
          )}

          {!hasRepositories && (
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <p>No repositories are linked to this project.</p>
              <p className="text-muted-foreground">
                Link a repository in Settings → Repositories to show its pull
                requests and GitHub issues here.
              </p>
              <button
                type="button"
                className="self-start text-sm underline"
                onClick={() =>
                  navigate(buildSettingsPath(workspace.name, "repositories"))
                }
              >
                Open Repositories settings
              </button>
            </div>
          )}

          {hasRepositories && (
            <>
              {activeData.repositories.some(
                (repository) => repository.unavailable
              ) && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                  GitHub is unavailable for{" "}
                  {activeData.repositories
                    .filter((repository) => repository.unavailable)
                    .map((repository) => repository.fullName)
                    .join(", ")}
                  .{" "}
                  {tab === "issues"
                    ? "The last synced GitHub issues are shown."
                    : "The last synced pull requests are shown."}
                </p>
              )}

              {issuesDisabled ? (
                <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                  <p>{issuesDisabledMessage}</p>
                  <p className="text-muted-foreground">
                    A workspace Owner or Admin can enable Issues on the
                    repository in GitHub, then refresh this view.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tab === "issues" ? (
                      <>
                        <select
                          aria-label="GitHub issue state"
                          value={issueState}
                          onChange={(event) =>
                            updateFilters({ state: event.target.value })
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="open">Open</option>
                          <option value="closed">Closed</option>
                          <option value="all">All</option>
                        </select>
                        <select
                          aria-label="GitHub issue author"
                          value={filters.author}
                          onChange={(event) =>
                            updateFilters({ author: event.target.value })
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">All authors</option>
                          {activeData.filters.authors.map((author) => (
                            <option key={author} value={author}>
                              {author}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="GitHub issue label"
                          value={filters.label}
                          onChange={(event) =>
                            updateFilters({ label: event.target.value })
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">All labels</option>
                          {activeData.filters.labels.map((label) => (
                            <option key={label.name} value={label.name}>
                              {label.name}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Filter GitHub issues"
                          type="search"
                          placeholder="Filter by title…"
                          value={queryDraft}
                          onChange={(event) => {
                            setQueryDraft(event.target.value)
                            updateFilters({ q: event.target.value })
                          }}
                          className="w-56 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </>
                    ) : (
                      <>
                        <select
                          aria-label="Pull request state"
                          value={filters.state}
                          onChange={(event) =>
                            updateFilters({ state: event.target.value })
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="open">Open</option>
                          <option value="merged">Merged</option>
                          <option value="closed">Closed</option>
                          <option value="all">All</option>
                        </select>
                        <select
                          aria-label="Pull request author"
                          value={filters.author}
                          onChange={(event) =>
                            updateFilters({ author: event.target.value })
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">All authors</option>
                          {activeData.filters.authors.map((author) => (
                            <option key={author} value={author}>
                              {author}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Filter pull requests"
                          type="search"
                          placeholder="Filter by title…"
                          value={queryDraft}
                          onChange={(event) => {
                            setQueryDraft(event.target.value)
                            updateFilters({ q: event.target.value })
                          }}
                          className="w-56 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </>
                    )}
                  </div>

                  {activeItems.length === 0 ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-muted-foreground text-sm">
                        {tab === "issues"
                          ? filters.state === "open" && !hasFilters
                            ? "No open GitHub issues."
                            : "No GitHub issues match the current filters."
                          : filters.state === "open" && !hasFilters
                            ? "No open pull requests."
                            : "No pull requests match the current filters."}
                      </p>
                      {tab === "issues" && disabledRepositories.length > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {`GitHub Issues are disabled on ${disabledRepositories
                            .map((repository) => repository.fullName)
                            .join(", ")}.`}
                        </p>
                      )}
                    </div>
                  ) : tab === "issues" ? (
                    <GitHubIssueTable
                      rows={issues.items}
                      showRepository={showRepository}
                      unavailableRepositories={unavailableRepositories}
                      canWrite={canWrite}
                      onLink={(row) =>
                        setLinkTarget({
                          kind: "issue",
                          rowId: row.id,
                          repositoryId: row.repositoryId,
                          number: row.number,
                        })
                      }
                      onCreate={(row) =>
                        setCreateTarget({
                          kind: "issue",
                          repositoryId: row.repositoryId,
                          number: row.number,
                          title: row.title,
                          url: row.url,
                          bodyExcerpt: row.bodyExcerpt,
                          repository: row.repository,
                        })
                      }
                    />
                  ) : (
                    <PullRequestTable
                      rows={pullRequests.items}
                      showRepository={showRepository}
                      canWrite={canWrite}
                      onLink={(row) =>
                        setLinkTarget({
                          kind: "pr",
                          rowId: row.id,
                          repositoryId: row.repositoryId,
                          number: row.number,
                        })
                      }
                      unavailableRepositories={unavailableRepositories}
                      onCreate={(row) =>
                        setCreateTarget({
                          kind: "pr",
                          repositoryId: row.repositoryId,
                          number: row.number,
                          title: row.title,
                          url: row.url,
                          bodyExcerpt: row.bodyExcerpt,
                          repository: row.repository,
                        })
                      }
                    />
                  )}

                  {activeCursor && (
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void activeList.loadMore()}
                        disabled={activeList.loadingMore}
                      >
                        {activeList.loadingMore ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {linkTarget && (
        <GitHubLinkDialog
          open={true}
          onOpenChange={(next) => {
            if (!next) setLinkTarget(null)
          }}
          projectId={project.id}
          kind={linkTarget.kind}
          repositoryId={linkTarget.repositoryId}
          number={linkTarget.number}
          onLinked={handleLinked}
        />
      )}

      {createTarget && (
        <GitHubCreateDialog
          open={true}
          onOpenChange={(next) => {
            if (!next) setCreateTarget(null)
          }}
          projectId={project.id}
          kind={createTarget.kind}
          repositoryId={createTarget.repositoryId}
          number={createTarget.number}
          title={createTarget.title}
          url={createTarget.url}
          bodyExcerpt={createTarget.bodyExcerpt}
          repository={createTarget.repository}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
