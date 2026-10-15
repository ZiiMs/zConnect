import { useCallback, useEffect, useState } from "react"
import { CreateIssueForm } from "@/components/create-issue-form"
import {
  emptyIssueFilters,
  IssueFilterBar,
  type IssueFilterValue,
  loadIssueFilters,
  saveIssueFilters,
} from "@/components/issue-filter-bar"
import { IssueList } from "@/components/issue-list"
import {
  api,
  type Issue,
  type Member,
  type Project,
  type Status,
} from "@/lib/api"

/**
 * List view container: the same filtered Issue query later views reuse,
 * with a shared filter bar persisted per user per project (localStorage;
 * see `issue-filter-bar`). Status changes and creation run through the
 * Issue API so the Todo-through-Done lifecycle completes from the List.
 */
export function ProjectIssues({
  project,
  userId,
  canWrite,
}: {
  project: Project
  userId: string
  canWrite: boolean
}) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [filters, setFilters] = useState<IssueFilterValue>(
    () => loadIssueFilters(userId, project.id) ?? emptyIssueFilters()
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [loadedStatuses, loadedIssues, loadedMembers] = await Promise.all([
        api.listStatuses(project.id),
        api.listIssues(project.id, {
          statusIds: filters.statusIds,
          priorities: filters.priorities,
          assigneeId: filters.assigneeId,
          text: filters.text,
        }),
        api.listMembers(project.workspaceId).catch(() => [] as Member[]),
      ])
      setStatuses([...loadedStatuses].sort((a, b) => a.position - b.position))
      setIssues(loadedIssues)
      setMembers(loadedMembers)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [project.id, project.workspaceId, filters])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function handleFilters(next: IssueFilterValue) {
    setFilters(next)
    saveIssueFilters(userId, project.id, next)
  }

  async function handleStatusChange(issue: Issue, statusId: string) {
    setActionError(null)
    try {
      const updated = await api.updateIssue(issue.identifier, { statusId })
      setIssues((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Issues</h3>
      <IssueFilterBar
        statuses={statuses}
        members={members}
        value={filters}
        onChange={handleFilters}
      />
      {canWrite && statuses.length > 0 && (
        <CreateIssueForm
          projectId={project.id}
          statuses={statuses}
          members={members}
          onCreated={(created) =>
            setIssues((current) =>
              [...current, created].sort((a, b) => a.number - b.number)
            )
          }
        />
      )}
      {loading && (
        <p className="text-muted-foreground text-sm">Loading issues…</p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {actionError && <p className="text-destructive text-sm">{actionError}</p>}
      {!loading && !error && (
        <IssueList
          issues={issues}
          statuses={statuses}
          canEdit={canWrite}
          onStatusChange={(issue, statusId) =>
            void handleStatusChange(issue, statusId)
          }
        />
      )}
    </div>
  )
}
