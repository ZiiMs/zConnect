import { useEffect, useState } from "react"
import type {
  Project,
  ProjectRepositoriesResponse,
  ProjectRepositoryView,
} from "@/lib/api"
import { api } from "@/lib/api"
import { formatRelativeTime } from "@/lib/relative-time"

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** Sync state shared by the admin picker rows and the member read-only list. */
function syncLabel(repository: ProjectRepositoryView): string {
  if (repository.unavailable) return "Unavailable"
  if (repository.lastSyncedAt) {
    return `Last synced ${formatRelativeTime(repository.lastSyncedAt)}`
  }
  return "Not synced yet"
}

function RepositoryState({
  repository,
}: {
  repository: ProjectRepositoryView
}) {
  return (
    <span
      className={
        repository.unavailable
          ? "rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-400"
          : "text-muted-foreground text-xs"
      }
    >
      {syncLabel(repository)}
    </span>
  )
}

function Markers({ repository }: { repository: ProjectRepositoryView }) {
  return (
    <>
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
    </>
  )
}

/**
 * Settings → Repositories (#48): the project's linked repositories and their
 * sync state. Owners/Admins pick from the workspace allowlist and save the
 * set; Members and project Viewers read the same rows without controls.
 */
export function RepositoriesSettings({
  project,
  canManage,
}: {
  project: Project
  canManage: boolean
}) {
  const [state, setState] = useState<ProjectRepositoriesResponse | null>(null)
  const [allowlist, setAllowlist] = useState<ProjectRepositoryView[] | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [allowlistLoading, setAllowlistLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setActionError(null)
    setSavedMessage(null)
    setState(null)
    api
      .getProjectRepositories(project.id)
      .then((loaded) => {
        if (!cancelled) setState(loaded)
      })
      .catch((failure) => {
        if (!cancelled) {
          setError(errorMessage(failure, "Failed to load repositories"))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project.id])

  // Only a managing role needs the workspace allowlist; members and Viewers
  // read the project's links without the workspace Connection surface.
  useEffect(() => {
    if (!canManage) {
      setAllowlist(null)
      setAllowlistLoading(false)
      return
    }
    let cancelled = false
    setAllowlistLoading(true)
    api
      .getGitHubConnection(project.workspaceId)
      .then((result) => {
        if (!cancelled) setAllowlist(result.repositories)
      })
      .catch((failure) => {
        if (!cancelled) {
          setAllowlist([])
          setActionError(
            errorMessage(failure, "Failed to load workspace repositories")
          )
        }
      })
      .finally(() => {
        if (!cancelled) setAllowlistLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canManage, project.workspaceId])

  // The saved set is the selection baseline; reset only when a server
  // response changes, never while the user is toggling.
  useEffect(() => {
    if (!state) return
    setSelectedIds(new Set(state.items.map((repository) => repository.id)))
  }, [state])

  function toggleRepository(repositoryId: string) {
    setSavedMessage(null)
    setActionError(null)
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(repositoryId)) next.delete(repositoryId)
      else next.add(repositoryId)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setActionError(null)
    setSavedMessage(null)
    try {
      const result = await api.setProjectRepositories(project.id, [
        ...selectedIds,
      ])
      setState(result)
      setSavedMessage(
        result.items.length === 1
          ? "1 repository linked."
          : `${result.items.length} repositories linked.`
      )
    } catch (failure) {
      setActionError(errorMessage(failure, "Failed to save repositories"))
    } finally {
      setSaving(false)
    }
  }

  const connection = state?.connection ?? null
  const linked = new Map(
    (state?.items ?? []).map((repository) => [repository.id, repository])
  )
  const options = allowlist ?? []
  // A linked repository should stay visible even if the allowlist read
  // failed or is still loading.
  const rows = [...options]
  for (const repository of state?.items ?? []) {
    if (!rows.some((candidate) => candidate.id === repository.id)) {
      rows.push(repository)
    }
  }

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading repositories…</p>
    )
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>
  }

  return (
    <section aria-label="Project repositories" className="flex flex-col gap-3">
      {actionError && <p className="text-destructive text-sm">{actionError}</p>}
      {savedMessage && (
        <p className="text-muted-foreground text-sm">{savedMessage}</p>
      )}

      {!connection ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">
            GitHub is not connected for this workspace.
          </p>
          {canManage ? (
            <p className="text-muted-foreground text-xs">
              Connect it in Settings → Connections → GitHub, then add
              repositories to the workspace allowlist.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Only Owners and Admins can connect GitHub.
            </p>
          )}
        </div>
      ) : canManage ? (
        <>
          {allowlistLoading && (
            <p className="text-muted-foreground text-sm">
              Loading workspace repositories…
            </p>
          )}
          {!allowlistLoading && rows.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No repositories are in the workspace allowlist. Add them in
              Settings → Connections → GitHub.
            </p>
          )}
          {rows.length > 0 && (
            <ul className="flex flex-col divide-y divide-border/50 rounded-xl border bg-card p-1">
              {rows.map((repository) => {
                const link = linked.get(repository.id)
                return (
                  <li key={repository.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent">
                      <input
                        type="checkbox"
                        aria-label={repository.fullName}
                        checked={selectedIds.has(repository.id)}
                        onChange={() => toggleRepository(repository.id)}
                      />
                      <span className="truncate font-mono text-xs">
                        {repository.fullName}
                      </span>
                      <Markers repository={repository} />
                      <span className="ml-auto shrink-0">
                        {link ? (
                          <RepositoryState repository={link} />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Not linked
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-md border px-2.5 py-1.5 font-medium text-xs hover:bg-accent disabled:opacity-50"
              >
                Save
              </button>
              <span className="text-muted-foreground text-xs">
                {selectedIds.size} of {rows.length} linked
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          {state?.items.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No repositories are linked to this project yet.
            </p>
          )}
          {(state?.items.length ?? 0) > 0 && (
            <ul className="flex flex-col divide-y divide-border/50 rounded-xl border bg-card p-1">
              {state?.items.map((repository) => (
                <li
                  key={repository.id}
                  className="flex items-center gap-2 rounded-md px-2 py-2"
                >
                  <span className="truncate font-mono text-xs">
                    {repository.fullName}
                  </span>
                  <Markers repository={repository} />
                  <span className="ml-auto shrink-0">
                    <RepositoryState repository={repository} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {state?.items.length === 0 && (
            <p className="text-muted-foreground text-xs">
              An Owner or Admin can link repositories in Settings →
              Repositories.
            </p>
          )}
        </>
      )}
    </section>
  )
}
