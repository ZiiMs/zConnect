import { useCallback, useEffect, useRef, useState } from "react"
import { CreateIssueForm } from "@/components/create-issue-form"
import {
  emptyIssueFilters,
  IssueFilterBar,
  type IssueFilterValue,
  loadIssueFilters,
  saveIssueFilters,
} from "@/components/issue-filter-bar"
import { IssueList } from "@/components/issue-list"
import { IssueTable } from "@/components/issue-table"
import { KanbanBoard } from "@/components/kanban-board"
import { useIssueSubscription } from "@/hooks/use-issue-subscription"
import {
  api,
  applyRemoteIssue,
  type Issue,
  type Member,
  matchesIssueFilters,
  type Project,
  type Status,
  type UpdateIssueInput,
} from "@/lib/api"

type IssueView = "list" | "table" | "kanban"

const VIEWS: { id: IssueView; label: string }[] = [
  { id: "list", label: "List" },
  { id: "table", label: "Table" },
  { id: "kanban", label: "Kanban" },
]

/**
 * List view container: the same filtered Issue query later views reuse,
 * with a shared filter bar persisted per user per project (localStorage;
 * see `issue-filter-bar`). Status changes and creation run through the
 * Issue API so the Todo-through-Done lifecycle completes from the List.
 *
 * T4 renders that same query as a Table (inline status/priority/assignee
 * edits) and a Kanban board (drag cards between Status columns with an
 * optimistic update). A per-project realtime subscription merges remote
 * inserts/updates last-write-wins; a move the server resolves elsewhere (or
 * a stale remote write) surfaces a conflict toast instead of silently
 * forking the view. No presence or locking: concurrent writers simply see
 * the latest write win.
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
  const [view, setView] = useState<IssueView>("list")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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

  const issuesRef = useRef(issues)
  issuesRef.current = issues

  useIssueSubscription(project.id, (event) => {
    if (event.type === "INSERT" && !matchesIssueFilters(event.issue, filters)) {
      return
    }
    const { issues: next, applied } = applyRemoteIssue(
      issuesRef.current,
      event.issue
    )
    if (!applied) {
      setToast("Conflict resolved: kept the latest change.")
      return
    }
    setIssues(next)
  })

  function handleFilters(next: IssueFilterValue) {
    setFilters(next)
    saveIssueFilters(userId, project.id, next)
  }

  async function handleUpdate(issue: Issue, input: UpdateIssueInput) {
    setActionError(null)
    try {
      const updated = await api.updateIssue(issue.identifier, input)
      setIssues((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed")
    }
  }

  async function handleStatusChange(issue: Issue, statusId: string) {
    await handleUpdate(issue, { statusId })
  }

  async function handleMove(issue: Issue, statusId: string) {
    setActionError(null)
    setToast(null)
    const previous = issuesRef.current
    setIssues((current) =>
      current.map((item) =>
        item.id === issue.id ? { ...item, statusId } : item
      )
    )
    try {
      const updated = await api.updateIssue(issue.identifier, { statusId })
      setIssues((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
      if (updated.statusId !== statusId) {
        setToast("Conflict resolved: kept the latest change.")
      }
    } catch (err) {
      setIssues(previous)
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
      <div role="tablist" aria-label="Issue views" className="flex gap-2">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={view === option.id}
            onClick={() => setView(option.id)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            {option.label}
          </button>
        ))}
      </div>
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
      {toast && (
        <p role="status" className="text-sm">
          {toast}
        </p>
      )}
      {!loading && !error && view === "list" && (
        <IssueList
          issues={issues}
          statuses={statuses}
          canEdit={canWrite}
          onStatusChange={(issue, statusId) =>
            void handleStatusChange(issue, statusId)
          }
        />
      )}
      {!loading && !error && view === "table" && (
        <IssueTable
          issues={issues}
          statuses={statuses}
          members={members}
          canEdit={canWrite}
          onUpdate={(issue, input) => void handleUpdate(issue, input)}
        />
      )}
      {!loading && !error && view === "kanban" && (
        <KanbanBoard
          issues={issues}
          statuses={statuses}
          canEdit={canWrite}
          onMove={(issue, statusId) => void handleMove(issue, statusId)}
        />
      )}
    </div>
  )
}
