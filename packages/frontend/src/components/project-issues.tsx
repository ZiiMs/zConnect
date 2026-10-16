import { useCallback, useEffect, useRef, useState } from "react"
import { Breadcrumb, type BreadcrumbItem } from "@/components/breadcrumb"
import { CreateIssueForm } from "@/components/create-issue-form"
import { IssueDetail } from "@/components/issue-detail"
import {
  emptyIssueFilters,
  type IssueFilterValue,
  loadIssueFilters,
  saveIssueFilters,
} from "@/components/issue-filter-bar"
import {
  IssueFilterPopover,
  type IssueView,
} from "@/components/issue-filter-popover"
import { IssueFilterPresetTabs } from "@/components/issue-filter-preset-tabs"
import { IssueList } from "@/components/issue-list"
import { IssueTable } from "@/components/issue-table"
import { KanbanBoard } from "@/components/kanban-board"
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
import { activeStatusIds } from "@/lib/issue-filter-presets"

/**
 * List view container: the same filtered Issue query later views reuse,
 * with a shared filter bar persisted per user per project (localStorage;
 * see `issue-filter-bar`). Status changes and creation run through the
 * Issue API so status changes complete the lifecycle from the List.
 * T5 adds the workspace Label registry to the filter bar and creation
 * form, archive controls and expandable subtasks inside the Detail view,
 * and the gentle completion guardrail (warn-but-allow) as an alert banner.
 *
 * T4 renders that same query as a Table (inline status/priority/assignee
 * edits) and a Kanban board (drag cards between Status columns with an
 * optimistic update). A per-project realtime subscription merges remote
 * inserts/updates last-write-wins; a move the server resolves elsewhere (or
 * a stale remote write) surfaces a conflict toast instead of silently
 * forking the view. No presence or locking: concurrent writers simply see
 * the latest write win.
 *
 * T6 adds the filter row above the view row — Active (the open categories,
 * the first visit's landing), Backlog, and All Issues — and the breadcrumb
 * `{Project} › Issues[ › View | › WEB-123]`. The presets are status-id sets
 * on the shared filter value, so they keep composing with the filter bar and
 * its localStorage persistence.
 */
const ISSUE_VIEWS: IssueView[] = ["list", "table", "kanban"]

function viewStorageKey(userId: string, projectId: string): string {
  return `zconnect:issue-view:${userId}:${projectId}`
}

/** The persisted List/Table/Kanban choice; unknown values land on List. */
export function loadIssueView(userId: string, projectId: string): IssueView {
  try {
    const stored = localStorage.getItem(viewStorageKey(userId, projectId))
    return stored !== null && (ISSUE_VIEWS as string[]).includes(stored)
      ? (stored as IssueView)
      : "list"
  } catch {
    return "list"
  }
}

export function saveIssueView(
  userId: string,
  projectId: string,
  view: IssueView
): void {
  localStorage.setItem(viewStorageKey(userId, projectId), view)
}

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
  const [{ initialFilters, hasStoredFilters }] = useState(() => {
    const stored = loadIssueFilters(userId, project.id)
    return {
      initialFilters: stored ?? emptyIssueFilters(),
      hasStoredFilters: stored !== null,
    }
  })
  const [filters, setFilters] = useState<IssueFilterValue>(initialFilters)
  /**
   * False until the first visit's Active preset has been computed from the
   * project's statuses, so that landing query is the only one issued.
   */
  const [presetResolved, setPresetResolved] = useState(hasStoredFilters)
  const [view, setView] = useState<IssueView>(() =>
    loadIssueView(userId, project.id)
  )
  const [loading, setLoading] = useState(true)
  /** A filter re-query in flight; stale views stay mounted underneath. */
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [subtasks, setSubtasks] = useState<Record<string, Issue[]>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerStatusId, setComposerStatusId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [starred, setStarred] = useState(() => {
    try {
      return localStorage.getItem(`zconnect:starred:${project.id}`) === "1"
    } catch {
      return false
    }
  })

  function toggleStar() {
    setStarred((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`zconnect:starred:${project.id}`, next ? "1" : "0")
      } catch {
        // Storage is a nicety; the toggle still works for the session.
      }
      return next
    })
  }

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  /** A filter the user touched by hand outranks the first-visit preset. */
  const userChangedFiltersRef = useRef(false)
  /** Overlapping re-queries: only the latest response wins. */
  const requestRef = useRef(0)
  /** True after the first query lands; later ones never unmount the views. */
  const loadedOnceRef = useRef(false)

  /**
   * The project's workflow loads once per project: a filter change only
   * re-queries issues. On a first visit (nothing stored for this user and
   * project) this is also what lands the screen on Active — derived from the
   * statuses and deliberately not persisted, so a status added to the
   * project later still joins the preset.
   */
  const loadWorkflow = useCallback(async () => {
    setError(null)
    try {
      const [loadedStatuses, loadedMembers, loadedLabels] = await Promise.all([
        api.listStatuses(project.id),
        api.listMembers(project.workspaceId).catch(() => [] as Member[]),
        api.listLabels(project.workspaceId).catch(() => [] as Label[]),
      ])
      const sorted = [...loadedStatuses].sort((a, b) => a.position - b.position)
      setStatuses(sorted)
      setMembers(loadedMembers)
      setLabels(loadedLabels)
      if (!hasStoredFilters && !userChangedFiltersRef.current) {
        setFilters({
          ...filtersRef.current,
          statusIds: activeStatusIds(sorted),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setPresetResolved(true)
    }
  }, [project.id, project.workspaceId, hasStoredFilters])

  useEffect(() => {
    void loadWorkflow()
  }, [loadWorkflow])

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    // First query owns the full-page loader; later ones keep the stale
    // boards mounted so a status toggle never flashes them away.
    if (loadedOnceRef.current) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const next = await api.listIssues(project.id, {
        statusIds: filters.statusIds,
        priorities: filters.priorities,
        assigneeId: filters.assigneeId,
        labels: filters.labels,
        text: filters.text,
      })
      if (requestRef.current !== requestId) return
      setIssues(next)
    } catch (err) {
      if (requestRef.current !== requestId) return
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      if (requestRef.current === requestId) {
        loadedOnceRef.current = true
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [project.id, filters])

  useEffect(() => {
    if (!presetResolved) return
    void refresh()
  }, [presetResolved, refresh])

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
    userChangedFiltersRef.current = true
    setFilters(next)
    saveIssueFilters(userId, project.id, next)
  }

  function handleView(next: IssueView) {
    setView(next)
    saveIssueView(userId, project.id, next)
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

  const selectedIssue = issues.find((item) => item.id === selectedId) ?? null
  const viewLabel =
    view === "list" ? "List" : view === "table" ? "Table" : "Kanban"

  /**
   * Both the project crumb and the Issues crumb land on the project's issues
   * screen — the shell hosts the project page and its issues screen at the
   * same level — so they share the destination: close whatever the user
   * drilled into and keep the chosen View.
   */
  function showIssuesRoot() {
    setSelectedId(null)
  }

  const breadcrumbItems: BreadcrumbItem[] =
    selectedIssue === null
      ? [
          {
            label: project.name,
            onClick: showIssuesRoot,
            icon: { name: project.icon, color: project.color },
          },
          { label: "Issues", onClick: showIssuesRoot },
          {
            label: viewLabel,
            onClick: () => setView(view),
            current: true,
          },
        ]
      : [
          {
            label: project.name,
            onClick: showIssuesRoot,
            icon: { name: project.icon, color: project.color },
          },
          { label: "Issues", onClick: showIssuesRoot },
          {
            label: selectedIssue.identifier,
            onClick: () => setSelectedId(selectedIssue.id),
            mono: true,
            current: true,
          },
        ]

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
    <div className="flex flex-col gap-2" aria-busy={refreshing || undefined}>
      <div className="flex h-8 items-center gap-1.5">
        <Breadcrumb items={breadcrumbItems} />
        <button
          type="button"
          aria-label={starred ? "Unstar project" : "Star project"}
          aria-pressed={starred}
          onClick={toggleStar}
          className={`grid size-6 shrink-0 place-items-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground ${
            starred ? "text-amber-400" : "text-muted-foreground"
          }`}
        >
          <span aria-hidden="true">{starred ? "★" : "☆"}</span>
        </button>
        {/* Hidden until the first-visit preset is resolved: before the statuses
            arrive no preset describes the query, and "All Issues" would blink. */}
        {presetResolved && (
          <IssueFilterPresetTabs
            statuses={statuses}
            value={filters.statusIds}
            onChange={(statusIds) => handleFilters({ ...filters, statusIds })}
          />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <IssueFilterPopover
            statuses={statuses}
            members={members}
            labels={labels}
            value={filters}
            onChange={handleFilters}
            view={view}
            onViewChange={handleView}
          />
          {canWrite && statuses.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                setComposerStatusId(null)
                setComposerOpen(true)
              }}
            >
              New issue
            </Button>
          )}
        </div>
      </div>
      <Modal
        open={composerOpen}
        onOpenChange={setComposerOpen}
        title="New issue"
      >
        <CreateIssueForm
          key={composerStatusId ?? "default"}
          projectId={project.id}
          statuses={statuses}
          members={members}
          labels={labels}
          initialStatusId={composerStatusId ?? undefined}
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
      {refreshing && !loading && (
        <p role="status" className="text-muted-foreground text-xs">
          Updating…
        </p>
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
          members={members}
          labels={labels}
          canEdit={canWrite}
          onStatusChange={(issue, statusId) =>
            void handleStatusChange(issue, statusId)
          }
          onAddIssue={
            canWrite
              ? (statusId) => {
                  setComposerStatusId(statusId)
                  setComposerOpen(true)
                }
              : undefined
          }
          onOpenDetail={(issue) => setSelectedId(issue.id)}
          groupBy={filters.groupBy}
          order={filters.order}
          showEmptyGroups={filters.showEmptyGroups}
          display={filters.display}
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
          members={members}
          labels={labels}
          userId={userId}
          projectId={project.id}
          canEdit={canWrite}
          visibleStatusIds={filters.statusIds}
          onMove={(issue, statusId) => void handleMove(issue, statusId)}
          onAssign={(issue, assigneeId) =>
            void handleUpdate(issue, { assigneeId })
          }
          onOpenDetail={(issue) => setSelectedId(issue.id)}
        />
      )}
    </div>
  )
}
