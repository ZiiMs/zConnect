import { useCallback, useEffect, useState } from "react"
import { Modal } from "@/components/ui/dialog"
import {
  ApiError,
  api,
  type GitHubConnection,
  type GitHubConnectionResponse,
  type RemoteRepositoryOption,
} from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { formatRelativeTime } from "@/lib/relative-time"

const MAX_REPOSITORIES = 50
const SEARCH_DEBOUNCE_MS = 200

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function statusLabel(connection: GitHubConnection): string {
  return connection.status === "active" ? "Active" : "Reconnect required"
}

/**
 * Settings → Connections → GitHub (ADR-0005). Owners/Admins connect through
 * Better Auth's GitHub social provider (`repo` scope), finalize the freshly
 * linked account on `?linked=1`, and choose the workspace repository
 * allowlist. Members read the same status without any controls.
 */
export function ConnectionsSettings({
  workspaceId,
  canManage,
}: {
  workspaceId: string
  canManage: boolean
}) {
  const [state, setState] = useState<GitHubConnectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<RemoteRepositoryOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  /** Full names of allowlisted repositories the pending save would drop. */
  const [removalConfirm, setRemovalConfirm] = useState<string[] | null>(null)

  const connection = state?.connection ?? null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const url = new URL(window.location.href)
      const linked = url.searchParams.get("linked") === "1"
      if (linked) {
        url.searchParams.delete("linked")
        window.history.replaceState(null, "", url.toString())
      }
      try {
        const data =
          linked && canManage
            ? await api.connectGitHubConnection(workspaceId)
            : await api.getGitHubConnection(workspaceId)
        if (!cancelled) setState(data)
      } catch (failure) {
        if (!cancelled) {
          setError(
            errorMessage(failure, "Failed to load the GitHub connection")
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canManage, workspaceId])

  // The saved allowlist is the selection baseline; reset only when the
  // server response changes (load, save), never while the user is toggling.
  useEffect(() => {
    if (!state) return
    setSelectedIds(
      new Set(state.repositories.map((repository) => repository.githubId))
    )
  }, [state])

  /**
   * A 409 from the connection API means GitHub rejected the stored token: the
   * Connection is `reconnect_required` server-side, so mirror that state here
   * and reuse the pane's Reconnect action.
   */
  const applyReconnectRequired = useCallback((failure: unknown): boolean => {
    if (!(failure instanceof ApiError) || failure.status !== 409) return false
    setState((previous) =>
      previous?.connection
        ? {
            ...previous,
            connection: {
              ...previous.connection,
              status: "reconnect_required",
            },
          }
        : previous
    )
    return true
  }, [])

  useEffect(() => {
    if (!connection || !canManage) {
      setOptions([])
      return
    }
    let cancelled = false
    setOptionsLoading(true)
    const handle = setTimeout(() => {
      void api
        .searchGitHubRepositories(workspaceId, query)
        .then((result) => {
          if (!cancelled) {
            setOptions(result.items)
            setOptionsLoading(false)
          }
        })
        .catch((failure) => {
          if (!cancelled) {
            setOptions([])
            setOptionsLoading(false)
            applyReconnectRequired(failure)
            setActionError(
              errorMessage(failure, "Failed to load GitHub repositories")
            )
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [canManage, connection, query, workspaceId, applyReconnectRequired])

  function connect() {
    const url = new URL(window.location.href)
    url.searchParams.set("linked", "1")
    void authClient.linkSocial({
      provider: "github",
      scopes: ["repo"],
      callbackURL: url.toString(),
    })
  }

  function toggleRepository(githubId: string) {
    setSavedMessage(null)
    if (!selectedIds.has(githubId) && selectedIds.size >= MAX_REPOSITORIES) {
      setActionError(`You can select at most ${MAX_REPOSITORIES} repositories`)
      return
    }
    setActionError(null)
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(githubId)) next.delete(githubId)
      else next.add(githubId)
      return next
    })
  }

  async function saveAllowlist() {
    setRemovalConfirm(null)
    setSaving(true)
    setActionError(null)
    setSavedMessage(null)
    try {
      const result = await api.setGitHubAllowlist(workspaceId, [...selectedIds])
      setState((previous) =>
        previous
          ? {
              connection: previous.connection
                ? {
                    ...previous.connection,
                    repositoryCount: result.repositories.length,
                  }
                : null,
              repositories: result.repositories,
            }
          : previous
      )
      setSavedMessage(
        result.removed > 0
          ? `Saved ${result.repositories.length} repositories; removed ${result.removed}.`
          : `Saved ${result.repositories.length} repositories.`
      )
    } catch (failure) {
      applyReconnectRequired(failure)
      setActionError(errorMessage(failure, "Failed to save repositories"))
    } finally {
      setSaving(false)
    }
  }

  /**
   * A save that drops allowlisted repositories needs an explicit confirmation
   * naming what is dropped; adding repositories stays a direct save.
   */
  function requestSave() {
    setActionError(null)
    setSavedMessage(null)
    const removed = (state?.repositories ?? [])
      .filter((repository) => !selectedIds.has(repository.githubId))
      .map((repository) => repository.fullName)
    if (removed.length > 0) {
      setRemovalConfirm(removed)
      return
    }
    void saveAllowlist()
  }

  async function disconnect() {
    setDisconnecting(true)
    setActionError(null)
    try {
      await api.disconnectGitHubConnection(workspaceId)
      setState({ connection: null, repositories: [] })
      setOptions([])
      setSelectedIds(new Set())
      setSavedMessage(null)
      setDisconnectOpen(false)
    } catch (failure) {
      setActionError(errorMessage(failure, "Failed to disconnect GitHub"))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <section aria-label="GitHub connection" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm">GitHub</h3>
        {!loading && !error && connection && canManage && (
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => connect()}
              className="rounded-md border px-2.5 py-1.5 font-medium text-xs hover:bg-accent"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={() => setDisconnectOpen(true)}
              className="rounded-md border px-2.5 py-1.5 font-medium text-destructive text-xs hover:bg-accent"
            >
              Disconnect GitHub
            </button>
          </span>
        )}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">
          Loading GitHub connection…
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {actionError && <p className="text-destructive text-sm">{actionError}</p>}
      {savedMessage && (
        <p className="text-muted-foreground text-sm">{savedMessage}</p>
      )}

      {!loading && !error && !connection && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground text-sm">
            GitHub is not connected.
          </p>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => connect()}
                className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90"
              >
                Connect GitHub
              </button>
              <p className="text-muted-foreground text-xs">
                You will authorize the GitHub account that powers this
                workspace&apos;s GitHub View. The request asks for the
                <code className="mx-1 rounded bg-muted px-1">repo</code>
                scope so private repositories can be read.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              Only Owners and Admins can connect GitHub.
            </p>
          )}
        </div>
      )}

      {!loading && !error && connection && (
        <>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Connector</dt>
              <dd className="flex items-center gap-2">
                <span className="font-medium">{connection.login}</span>
                <span className="text-muted-foreground">
                  {connection.connectorName ?? connection.connectorUserId}
                </span>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <span
                  data-status={connection.status}
                  className={
                    connection.status === "active"
                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 text-xs dark:text-emerald-400"
                      : "rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs dark:text-amber-400"
                  }
                >
                  {statusLabel(connection)}
                </span>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Last sync</dt>
              <dd>
                {connection.lastSyncedAt
                  ? `Last synced ${formatRelativeTime(connection.lastSyncedAt)}`
                  : "Never synced"}
              </dd>
            </div>
            {!canManage && (
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">Repositories</dt>
                <dd>
                  {connection.repositoryCount}{" "}
                  {connection.repositoryCount === 1
                    ? "repository"
                    : "repositories"}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium text-sm">Repositories</h4>
              {canManage && (
                <span className="text-muted-foreground text-xs">
                  {`${selectedIds.size} of ${MAX_REPOSITORIES} selected`}
                </span>
              )}
            </div>

            {canManage ? (
              <>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="sr-only">Search repositories</span>
                  <input
                    type="search"
                    aria-label="Search repositories"
                    placeholder="Search repositories…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </label>
                {optionsLoading && (
                  <p className="text-muted-foreground text-xs">
                    Searching repositories…
                  </p>
                )}
                {!optionsLoading && options.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    No repositories found.
                  </p>
                )}
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {options.map((option) => (
                    <li key={option.githubId}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                        <input
                          type="checkbox"
                          aria-label={option.fullName}
                          checked={selectedIds.has(option.githubId)}
                          onChange={() => toggleRepository(option.githubId)}
                        />
                        <span className="truncate font-mono text-xs">
                          {option.fullName}
                        </span>
                        {option.private && (
                          <span className="rounded-full border px-1.5 text-[10px] text-muted-foreground">
                            Private
                          </span>
                        )}
                        {option.archived && (
                          <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                            Archived
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={requestSave}
                    className="rounded-md border px-2.5 py-1.5 font-medium text-xs hover:bg-accent disabled:opacity-50"
                  >
                    Save allowlist
                  </button>
                </div>
              </>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {state?.repositories.length === 0 && (
                  <li className="text-muted-foreground text-xs">
                    No repositories selected.
                  </li>
                )}
                {state?.repositories.map((repository) => (
                  <li
                    key={repository.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1"
                  >
                    <span className="truncate font-mono text-xs">
                      {repository.fullName}
                    </span>
                    {repository.private && (
                      <span className="rounded-full border px-1.5 text-[10px] text-muted-foreground">
                        Private
                      </span>
                    )}
                    {repository.archived && (
                      <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Modal
        open={removalConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setRemovalConfirm(null)
        }}
        title="Remove repositories from the allowlist?"
        description="Saving this selection stops reading GitHub for the repositories below."
      >
        <div className="flex flex-col gap-3 text-sm">
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {removalConfirm?.map((fullName) => (
              <li key={fullName}>{fullName}</li>
            ))}
          </ul>
          <p>
            Dropped: cached GitHub Items and project repository links in every
            project.
          </p>
          <p>
            Survives: External Links on Issues, with their last known title and
            state.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setRemovalConfirm(null)}
              className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAllowlist()}
              className="rounded-md bg-destructive px-2.5 py-1.5 font-medium text-destructive-foreground text-xs hover:bg-destructive/90 disabled:opacity-50"
            >
              Save changes
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect GitHub?"
        description="This removes the stored credential and stops reading GitHub for this workspace."
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Disconnecting drops cached GitHub items and repository links from
            projects.
          </p>
          <p>
            External Links on Issues survive with their last known title and
            state.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={disconnecting}
              onClick={() => setDisconnectOpen(false)}
              className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={disconnecting}
              onClick={() => void disconnect()}
              className="rounded-md bg-destructive px-2.5 py-1.5 font-medium text-destructive-foreground text-xs hover:bg-destructive/90 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
