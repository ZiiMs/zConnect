import { useCallback, useEffect, useState } from "react"
import { CreateStatusForm } from "@/components/create-status-form"
import { ProjectIssues } from "@/components/project-issues"
import { ProjectKeyForm } from "@/components/project-key-form"
import { Button } from "@/components/ui/button"
import { api, type Project, type Status } from "@/lib/api"

/**
 * Project page: a page title plus the Issue views. Workflow management (key,
 * statuses) lives in a labeled panel here and, fully, under Settings; anyone
 * who can write Issues (every workspace role; Viewers are read-only) gets
 * the create form and List actions.
 */
export function ProjectPage({
  project,
  canManage,
  canWriteIssues,
  userId,
  onProjectUpdated,
  onOpenSettings,
}: {
  project: Project
  canManage: boolean
  canWriteIssues: boolean
  userId: string
  onProjectUpdated: (project: Project) => void
  /** Opens the Settings view; empty states link there when available. */
  onOpenSettings?: () => void
}) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const loaded = await api.listStatuses(project.id)
      setStatuses([...loaded].sort((a, b) => a.position - b.position))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleDelete(statusId: string) {
    setDeleteError(null)
    try {
      await api.deleteStatus(project.id, statusId)
      setStatuses((current) => current.filter((s) => s.id !== statusId))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-lg">{project.name}</h2>
        <span className="rounded border px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
          {project.key}
        </span>
      </div>
      {canManage ? (
        <section
          aria-label="Workflow"
          className="flex flex-col gap-2 rounded-md border bg-card p-3"
        >
          <h3 className="font-medium text-sm">Workflow</h3>
          <ProjectKeyForm project={project} onUpdated={onProjectUpdated} />
          <CreateStatusForm
            projectId={project.id}
            onCreated={(status) =>
              setStatuses((current) =>
                [...current, status].sort((a, b) => a.position - b.position)
              )
            }
          />
          {loading && (
            <p className="text-muted-foreground text-sm">Loading statuses…</p>
          )}
          {loadError && <p className="text-destructive text-sm">{loadError}</p>}
          {deleteError && (
            <p className="text-destructive text-sm">{deleteError}</p>
          )}
          {!loading && !loadError && statuses.length === 0 && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-muted-foreground text-sm">
                No statuses yet. Define the workflow here or in Settings.
              </p>
              {onOpenSettings && (
                <Button variant="outline" onClick={onOpenSettings}>
                  Open workflow settings
                </Button>
              )}
            </div>
          )}
          {!loading &&
            !loadError &&
            statuses.map((status) => (
              <section
                key={status.id}
                aria-label={status.name}
                className="flex flex-col gap-1 rounded-md border p-3"
              >
                <div className="flex items-center justify-between">
                  <h4 data-testid="status-name" className="font-medium text-sm">
                    {status.name}
                  </h4>
                  <span
                    data-testid="status-category"
                    className="text-muted-foreground text-xs"
                  >
                    {status.category}
                  </span>
                </div>
                <div>
                  <Button
                    variant="outline"
                    onClick={() => void handleDelete(status.id)}
                  >
                    Delete {status.name}
                  </Button>
                </div>
              </section>
            ))}
        </section>
      ) : (
        <>
          {loading && (
            <p className="text-muted-foreground text-sm">Loading statuses…</p>
          )}
          {loadError && <p className="text-destructive text-sm">{loadError}</p>}
          {!loading && !loadError && statuses.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No statuses yet. Define the workflow above.
            </p>
          )}
          {!loading &&
            !loadError &&
            statuses.map((status) => (
              <section
                key={status.id}
                aria-label={status.name}
                className="flex flex-col gap-1 rounded-md border p-3"
              >
                <div className="flex items-center justify-between">
                  <h4 data-testid="status-name" className="font-medium text-sm">
                    {status.name}
                  </h4>
                  <span
                    data-testid="status-category"
                    className="text-muted-foreground text-xs"
                  >
                    {status.category}
                  </span>
                </div>
              </section>
            ))}
        </>
      )}
      <ProjectIssues
        project={project}
        userId={userId}
        canWrite={canWriteIssues}
        canAdmin={canManage}
      />
    </div>
  )
}
