import { useCallback, useEffect, useRef, useState } from "react"
import { CreateIssueForm } from "@/components/create-issue-form"
import { IssueActions } from "@/components/issue-actions"
import { IssueDetail } from "@/components/issue-detail"
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
import { SubtaskList } from "@/components/subtask-list"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"
import { useIssueSubscription } from "@/hooks/use-issue-subscription"
import {
  api,
  applyRemoteIssue,
  type Issue,
  type Label,
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
 * Issue API so status changes complete the lifecycle from the List.
 * T5 adds the workspace Label registry to the filter bar and creation
 * form, per-row archive controls, expandable subtasks, and the gentle
 * completion guardrail (warn-but-allow) as an alert banner.
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
  const [view, setView] = useState<IssueView>("list")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [subtasks, setSubtasks] = useState<Record<string, Issue[]>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    setNotice(null)
    try {
      const updated = await api.updateIssue(issue.identifier, input)
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
      if (updated.warnings && updated.warnings.length > 0) {
        setNotice(updated.warnings.join(" "))
      }
      if (updated.statusId !== statusId) {
        setToast("Conflict resolved: kept the latest change.")
      }
    } catch (err) {
      setIssues(previous)
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

  const selectedIssue = issues.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedIssue || subtasks[selectedIssue.id] !== undefined) return
    let cancelled = false
    void (async () => {
      try {
        const children = await api.listSubtasks(selectedIssue.identifier)
        if (!cancelled) {
          setSubtasks((current) => ({
            ...current,
            [selectedIssue.id]: children,
          }))
        }
      } catch (err) {
        if (!cancelled) {
          setActionError(err instanceof Error ? err.message : "Update failed")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedIssue, subtasks])

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
      <div className="flex items-center gap-2">
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
          <Button className="ml-auto" onClick={() => setComposerOpen(true)}>
            New issue
          </Button>
        )}
      </div>
      <Modal
        open={composerOpen}
        onOpenChange={setComposerOpen}
        title="New issue"
      >
        <CreateIssueForm
          projectId={project.id}
          statuses={statuses}
          members={members}
          labels={labels}
          onCreated={(created) => {
            setIssues((current) =>
              [...current, created].sort((a, b) => a.number - b.number)
            )
            setComposerOpen(false)
          }}
        />
      </Modal>
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
      {toast && (
        <p role="status" className="text-sm">
          {toast}
        </p>
      )}
      {!loading && !error && selectedIssue !== null && (
        <IssueDetail
          issue={selectedIssue}
          statuses={statuses}
          members={members}
          labels={labels}
          subtasks={subtasks[selectedIssue.id] ?? []}
          canEdit={canWrite}
          canAdmin={canAdmin}
          onBack={() => setSelectedId(null)}
          onStatusChange={(issue, statusId) =>
            void handleStatusChange(issue, statusId)
          }
          onUpdate={(issue, input) => void handleUpdate(issue, input)}
          onArchivedChanged={handleArchivedChanged}
          onDeleted={(deleted) => {
            handleDeleted(deleted)
            setSelectedId(null)
          }}
        />
      )}
      {!loading && !error && selectedIssue === null && view === "list" && (
        <IssueList
          issues={issues}
          statuses={statuses}
          labels={labels}
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
                  aria-label={`Open detail for ${issue.identifier}`}
                  onClick={() => setSelectedId(issue.id)}
                >
                  Detail
                </button>
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
      {!loading && !error && selectedIssue === null && view === "table" && (
        <IssueTable
          issues={issues}
          statuses={statuses}
          members={members}
          labels={labels}
          canEdit={canWrite}
          onUpdate={(issue, input) => void handleUpdate(issue, input)}
        />
      )}
      {!loading && !error && selectedIssue === null && view === "kanban" && (
        <KanbanBoard
          issues={issues}
          statuses={statuses}
          labels={labels}
          canEdit={canWrite}
          onMove={(issue, statusId) => void handleMove(issue, statusId)}
        />
      )}
    </div>
  )
}
