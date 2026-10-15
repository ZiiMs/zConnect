import { useCallback, useEffect, useState } from "react"
import { CreateIssueForm } from "@/components/create-issue-form"
import { IssueActions } from "@/components/issue-actions"
import {
  emptyIssueFilters,
  IssueFilterBar,
  type IssueFilterValue,
  loadIssueFilters,
  saveIssueFilters,
} from "@/components/issue-filter-bar"
import { IssueList } from "@/components/issue-list"
import { SubtaskList } from "@/components/subtask-list"
import {
  api,
  type Issue,
  type Label,
  type Member,
  type Project,
  type Status,
} from "@/lib/api"

/**
 * List view container: the same filtered Issue query later views reuse,
 * with a shared filter bar persisted per user per project (localStorage;
 * see `issue-filter-bar`). Status changes and creation run through the
 * Issue API so the Todo-through-Done lifecycle completes from the List.
 * T5 adds the workspace Label registry to the filter bar and creation
 * form, per-row archive controls, expandable subtasks, and the gentle
 * completion guardrail (warn-but-allow) as an alert banner.
 */
export function ProjectIssues({
  project,
  userId,
  canWrite,
  canAdmin = false,
}: {
  project: Project
  userId: string
  canWrite: boolean
  /** Owner/Admin: enables permanent deletion in the row actions. */
  canAdmin?: boolean
}) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [filters, setFilters] = useState<IssueFilterValue>(
    () => loadIssueFilters(userId, project.id) ?? emptyIssueFilters()
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [subtasks, setSubtasks] = useState<Record<string, Issue[]>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [loadedStatuses, loadedIssues, loadedMembers, loadedLabels] =
        await Promise.all([
          api.listStatuses(project.id),
          api.listIssues(project.id, {
            statusIds: filters.statusIds,
            priorities: filters.priorities,
            assigneeId: filters.assigneeId,
            labels: filters.labels,
            text: filters.text,
          }),
          api.listMembers(project.workspaceId).catch(() => [] as Member[]),
          api.listLabels(project.workspaceId).catch(() => [] as Label[]),
        ])
      setStatuses([...loadedStatuses].sort((a, b) => a.position - b.position))
      setIssues(loadedIssues)
      setMembers(loadedMembers)
      setLabels(loadedLabels)
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
    setNotice(null)
    try {
      const updated = await api.updateIssue(issue.identifier, { statusId })
      setIssues((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
      if (updated.warnings && updated.warnings.length > 0) {
        setNotice(updated.warnings.join(" "))
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed")
    }
  }

  function handleArchivedChanged(updated: Issue) {
    setIssues((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
  }

  function handleDeleted(deleted: Issue) {
    setIssues((current) => current.filter((item) => item.id !== deleted.id))
  }

  async function toggleSubtasks(issue: Issue) {
    const open = !expanded[issue.id]
    setExpanded((current) => ({ ...current, [issue.id]: open }))
    if (open && subtasks[issue.id] === undefined) {
      try {
        const children = await api.listSubtasks(issue.identifier)
        setSubtasks((current) => ({ ...current, [issue.id]: children }))
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Update failed")
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Issues</h3>
      <IssueFilterBar
        statuses={statuses}
        members={members}
        labels={labels}
        value={filters}
        onChange={handleFilters}
      />
      {canWrite && statuses.length > 0 && (
        <CreateIssueForm
          projectId={project.id}
          statuses={statuses}
          members={members}
          labels={labels}
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
      {notice && (
        <p role="alert" className="rounded-md border p-2 text-sm">
          {notice}
        </p>
      )}
      {actionError && <p className="text-destructive text-sm">{actionError}</p>}
      {!loading && !error && (
        <IssueList
          issues={issues}
          statuses={statuses}
          canEdit={canWrite}
          onStatusChange={(issue, statusId) =>
            void handleStatusChange(issue, statusId)
          }
          actions={(issue) => (
            <div className="flex w-full flex-col gap-1">
              <div className="flex items-center gap-2">
                {canWrite && (
                  <IssueActions
                    issue={issue}
                    canAdmin={canAdmin}
                    onChanged={handleArchivedChanged}
                    onDeleted={handleDeleted}
                  />
                )}
                <button
                  type="button"
                  className="rounded-md border border-input px-2 py-1 text-xs"
                  aria-expanded={expanded[issue.id] ?? false}
                  onClick={() => void toggleSubtasks(issue)}
                >
                  Subtasks
                </button>
              </div>
              {expanded[issue.id] && (
                <SubtaskList
                  subtasks={subtasks[issue.id] ?? []}
                  statuses={statuses}
                />
              )}
            </div>
          )}
        />
      )}
    </div>
  )
}
