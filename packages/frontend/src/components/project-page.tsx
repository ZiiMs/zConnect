import { useCallback, useEffect, useState } from "react"
import { CreateStatusForm } from "@/components/create-status-form"
import { ProjectIssues } from "@/components/project-issues"
import { ProjectKeyForm } from "@/components/project-key-form"
import { Button } from "@/components/ui/button"
import { api, type Project, type Status } from "@/lib/api"

/**
 * Project page: renders the project's Statuses as ordered sections (the
 * empty workflow the Kanban view later builds on) plus the Issue List view.
 * Managers can edit the Project Key, define Statuses, and delete empty
 * Statuses. Anyone who can write Issues (every workspace role; Viewers are
 * read-only) gets the create form and List actions.
 */
export function ProjectPage({
  project,
  canManage,
  canWriteIssues,
  userId,
  onProjectUpdated,
}: {
  project: Project
  canManage: boolean
  canWriteIssues: boolean
  userId: string
  onProjectUpdated: (project: Project) => void
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
      <div>
        <h3 className="font-medium text-sm">
          {project.name}{" "}
          <span className="text-muted-foreground">({project.key})</span>
        </h3>
      </div>
      {canManage && (
        <div className="flex flex-col gap-2">
          <ProjectKeyForm project={project} onUpdated={onProjectUpdated} />
          <CreateStatusForm
            projectId={project.id}
            onCreated={(status) =>
              setStatuses((current) =>
                [...current, status].sort((a, b) => a.position - b.position)
              )
            }
          />
        </div>
      )}
      {loading && (
        <p className="text-muted-foreground text-sm">Loading statuses…</p>
      )}
      {loadError && <p className="text-destructive text-sm">{loadError}</p>}
      {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
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
            {canManage && (
              <div>
                <Button
                  variant="outline"
                  onClick={() => void handleDelete(status.id)}
                >
                  Delete {status.name}
                </Button>
              </div>
            )}
          </section>
        ))}
      <ProjectIssues
        project={project}
        userId={userId}
        canWrite={canWriteIssues}
        canAdmin={canManage}
      />
    </div>
  )
}
