import { useCallback, useEffect, useRef, useState } from "react"
import { Breadcrumb, type BreadcrumbItem } from "@/components/breadcrumb"
import { IssueCreateDetail, IssueDetail } from "@/components/issue-detail"
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
import {
  LiveIssueBridge,
  LiveIssuesBridge,
} from "@/components/realtime/live-issues"
import { Button } from "@/components/ui/button"
import { usePolling } from "@/hooks/use-polling"
import {
  api,
  applyRemoteIssue,
  type CreateIssueInput,
  type Issue,
  type Label,
  type Member,
  type Project,
  type Status,
  type UpdateIssueInput,
} from "@/lib/api"
import { activeStatusIds } from "@/lib/issue-filter-presets"
import { realtimeEnabled } from "@/lib/realtime"

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
 * optimistic update). Polling (every 30 s plus window focus) replaces the
 * old realtime subscription: each polled row merges last-write-wins through
 * `applyRemoteIssue`, and a move the server resolves elsewhere (or a stale
 * remote write) surfaces a conflict toast instead of silently forking the
 * view. No presence or locking: concurrent writers simply see the latest
 * write win.
 *
 * T6 adds the filter row above the view row — Active (the open categories,
 * the first visit's landing), Backlog, and All Issues — and the breadcrumb
 * `{Project} › Issues[ › View | › WEB-123]`. The presets are status-id sets
 * on the shared filter value, so they keep composing with the filter bar and
 * its localStorage persistence.
 */
const ISSUE_VIEWS: IssueView[] = ["list", "table", "kanban"]

/** Fields a polled row can move; identity and `warnings` never do. */
const POLLED_ISSUE_FIELDS = [
  "title",
  "description",
  "statusId",
  "priority",
  "assigneeId",
  "dueDate",
  "archived",
  "labels",
  "parentId",
] as const

/** True when a polled row carries a change the view has not seen yet. */
function issueChanged(current: Issue, incoming: Issue): boolean {
  return POLLED_ISSUE_FIELDS.some((field) => {
    const before = current[field]
    const after = incoming[field]
    if (Array.isArray(before) && Array.isArray(after)) {
      return before.join("\u0000") !== after.join("\u0000")
    }
    return before !== after
  })
}

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
  activeIssueIdentifier,
  deepIssue = null,
  onOpenIssue,
  onCloseIssue,
}: {
  project: Project
  userId: string
  canWrite: boolean
  /** Owner/Admin: enables permanent deletion in the row actions. */
  canAdmin?: boolean
  /**
   * URL-driven selection: the identifier from the path (`undefined` keeps the
   * legacy uncontrolled behavior for tests/embeds; `null` means the list
   * root, a string opens that detail). The title slug is never read.
   */
  activeIssueIdentifier?: string | null
  /** Deep-linked row fetched by the shell (cross-filter, pre-list). */
  deepIssue?: Issue | null
  /** Notify the shell so it can push the canonical issue URL. */
  onOpenIssue?: (issue: Issue, opts?: { replace?: boolean }) => void
  /** Notify the shell so it can push the workspace root URL. */
  onCloseIssue?: () => void
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
  /** The live subscription is authoritative; polling pauses while it is up. */
  const [issuesLive, setIssuesLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [subtasks, setSubtasks] = useState<Record<string, Issue[]>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [creating, setCreating] = useState<{
    statusId: string | null
    parentId?: string | null
  } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * Deep-linked row that the filtered list query may not contain (e.g. a
   * completed issue opened from a share link while landing on Active).
   * Shown as the detail without polluting the list rows.
   */
  const [extraIssue, setExtraIssue] = useState<Issue | null>(null)
  /** Remote rows held while the open issue has unsaved edits (§7). */
  const [pendingConflicts, setPendingConflicts] = useState<
    Record<string, Issue>
  >({})
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
  /** Which open issues currently hold unsaved edits (sender/conflict gate). */
  const editingRef = useRef<Record<string, boolean>>({})
  /** A poll is in flight; overlapping timer/focus events ride the same one. */
  const pollingRef = useRef(false)
  /** Extra (deep-linked) row outside the filtered list, for poll conflicts. */
  const extraIssueRef = useRef<Issue | null>(extraIssue)
  extraIssueRef.current = extraIssue
  /** Open subtask footers, so a polled edit can gate the row being edited. */
  const subtasksRef = useRef(subtasks)
  subtasksRef.current = subtasks
  /** Rows in the previous live snapshot, so deletions are detected without
   * dropping optimistic rows that the snapshot has not seen yet. */
  const liveIssueIdsRef = useRef<Set<string>>(new Set())

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

  /**
   * Merge one poll response into the view. Polling replaces the old realtime
   * stream (ADR-0002), so it has to behave like an UPDATE per row instead of
   * replacing the list:
   * - an open editor holds the remote row behind the conflict banner;
   * - otherwise `applyRemoteIssue` keeps last-write-wins and toasts a stale
   *   write instead of silently forking the row;
   * - open subtask footers take the same refreshed rows.
   * No `loading` here: the timer runs in the background and stale rows stay
   * mounted under the small `refreshing` indicator.
   */
  const applyPolledIssues = useCallback((polled: Issue[]) => {
    const current = issuesRef.current
    const localById = new Map(current.map((issue) => [issue.id, issue]))
    const extra = extraIssueRef.current
    if (extra) localById.set(extra.id, extra)
    // Subtask rows live outside `issues` once their modal opened; keep them
    // available so an edit in that modal holds its own conflict banner.
    for (const rows of Object.values(subtasksRef.current)) {
      for (const row of rows) {
        if (!localById.has(row.id)) localById.set(row.id, row)
      }
    }
    const remoteById = new Map(polled.map((issue) => [issue.id, issue]))

    const conflicts: Record<string, Issue> = {}
    let merged = current
    let stale = false
    for (const remote of polled) {
      const local = localById.get(remote.id)
      // No visible move: leave the row (and its reference) untouched.
      if (local && !issueChanged(local, remote)) continue
      // Conflict-while-editing (§7): pause autosave and hold the remote row
      // behind a Load-latest / Keep-editing banner instead of silently
      // overwriting the draft. Any open editor (detail or subtask modal)
      // gates its own id via editingRef.
      if (local && editingRef.current[remote.id]) {
        conflicts[remote.id] = remote
        continue
      }
      const result = applyRemoteIssue(merged, remote)
      merged = result.issues
      if (!result.applied) stale = true
    }

    if (Object.keys(conflicts).length > 0) {
      setPendingConflicts((pending) => ({ ...pending, ...conflicts }))
    }
    if (stale) setToast("Conflict resolved: kept the latest change.")
    if (merged !== current) setIssues(merged)

    // Keep an open subtask footer fresh when its rows move remotely.
    setSubtasks((currentSubtasks) => {
      let changed = false
      const nextMap: Record<string, Issue[]> = {}
      for (const [parentId, rows] of Object.entries(currentSubtasks)) {
        let rowsChanged = false
        const nextRows = rows.map((row) => {
          const remote = remoteById.get(row.id)
          if (!remote || conflicts[row.id] || editingRef.current[row.id]) {
            return row
          }
          if (!issueChanged(row, remote)) return row
          const result = applyRemoteIssue([row], remote)
          if (!result.applied) return row
          rowsChanged = true
          return remote
        })
        if (rowsChanged) changed = true
        nextMap[parentId] = rowsChanged ? nextRows : rows
      }
      return changed ? nextMap : currentSubtasks
    })
    // Refs and state setters only: the merge always sees the latest view.
  }, [])

  /** Background refresh: never clears the view and never shows the loader. */
  const pollIssues = useCallback(async () => {
    if (pollingRef.current) return
    pollingRef.current = true
    if (loadedOnceRef.current) setRefreshing(true)
    const requestId = requestRef.current
    try {
      const filtersNow = filtersRef.current
      const next = await api.listIssues(project.id, {
        statusIds: filtersNow.statusIds,
        priorities: filtersNow.priorities,
        assigneeId: filtersNow.assigneeId,
        labels: filtersNow.labels,
        text: filtersNow.text,
      })
      // A filter re-query or project switch superseded this snapshot: its
      // rows belong to the old query and must not leak into the new list.
      if (requestRef.current !== requestId) return
      applyPolledIssues(next)
    } catch {
      // A transient poll failure keeps the last good rows and their banner:
      // the next timer tick (or window focus) retries.
    } finally {
      pollingRef.current = false
      setRefreshing(false)
    }
  }, [project.id, applyPolledIssues])

  // Realtime is gone: one filtered refetch every 30 s and on window focus,
  // only after the first-visit preset has resolved. The Neon live subscription
  // pauses this timer while it is live.
  usePolling(pollIssues, { enabled: presetResolved && !issuesLive })

  // A new query starts from "connecting"; resume polling until it is live so a
  // failed sealed-query fetch can never leave the list frozen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the filter fields are the query scope.
  useEffect(() => {
    setIssuesLive(false)
  }, [
    project.id,
    filters.statusIds,
    filters.priorities,
    filters.assigneeId,
    filters.labels,
    filters.text,
  ])

  function handleFilters(next: IssueFilterValue) {
    userChangedFiltersRef.current = true
    setFilters(next)
    saveIssueFilters(userId, project.id, next)
  }

  function handleView(next: IssueView) {
    setView(next)
    saveIssueView(userId, project.id, next)
  }

  const applyUpdated = useCallback((updated: Issue) => {
    setIssues((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
    setExtraIssue((current) =>
      current && current.id === updated.id ? updated : current
    )
    setSubtasks((current) => {
      let changed = false
      const nextMap: Record<string, Issue[]> = {}
      for (const [parentId, rows] of Object.entries(current)) {
        if (!rows.some((r) => r.id === updated.id)) {
          nextMap[parentId] = rows
          continue
        }
        changed = true
        nextMap[parentId] = rows.map((r) => (r.id === updated.id ? updated : r))
      }
      return changed ? nextMap : current
    })
  }, [])

  /**
   * Deep-linked rows outside the filtered list are not refreshed by the list
   * poll. Poll the open out-of-list issue too so detail stays within the
   * 30-second freshness bar without replacing a dirty editor's draft.
   */
  const pollExtraIssue = useCallback(async () => {
    const extra = extraIssueRef.current
    if (!extra) return
    try {
      const fetched = await api.getIssue(extra.identifier)
      if (editingRef.current[fetched.id]) {
        setPendingConflicts((current) => ({
          ...current,
          [fetched.id]: fetched,
        }))
        return
      }
      applyUpdated(fetched)
    } catch {
      // Keep the last known row; the next poll retries.
    }
  }, [applyUpdated])

  usePolling(pollExtraIssue, { enabled: presetResolved })

  /** A deleted or moved-away issue disappears from this project's list. */
  const removeIssue = useCallback((issueId: string) => {
    setIssues((current) => current.filter((item) => item.id !== issueId))
    setExtraIssue((current) => (current?.id === issueId ? null : current))
    setSubtasks((current) => {
      const next: Record<string, Issue[]> = {}
      for (const [parentId, rows] of Object.entries(current)) {
        if (parentId === issueId) continue
        next[parentId] = rows.filter((row) => row.id !== issueId)
      }
      return next
    })
    setPendingConflicts((current) => {
      if (!(issueId in current)) return current
      const next = { ...current }
      delete next[issueId]
      return next
    })
    delete editingRef.current[issueId]
    setSelectedId((current) => (current === issueId ? null : current))
  }, [])

  /**
   * Apply a Neon Realtime snapshot. Updates use the same conflict rules as
   * polling; rows that were in the previous snapshot and are now gone were
   * deleted or moved out of the query, so they are removed. Rows the snapshot
   * has never seen (an optimistic create) stay until the next snapshot.
   */
  const applyLiveIssues = useCallback(
    (rows: readonly Issue[]) => {
      const previous = liveIssueIdsRef.current
      const next = new Set(rows.map((row) => row.id))
      liveIssueIdsRef.current = next
      applyPolledIssues([...rows])
      for (const issueId of previous) {
        if (!next.has(issueId) && !editingRef.current[issueId]) {
          removeIssue(issueId)
        }
      }
    },
    [applyPolledIssues, removeIssue]
  )

  async function handleUpdate(
    issue: Issue,
    input: UpdateIssueInput
  ): Promise<Issue> {
    setActionError(null)
    setNotice(null)
    try {
      const updated = await api.updateIssue(issue.identifier, input)
      applyUpdated(updated)
      // A held conflict for this row is resolved by our own save.
      setPendingConflicts((current) => {
        if (!(issue.id in current)) return current
        const next = { ...current }
        delete next[issue.id]
        return next
      })
      if (updated.warnings && updated.warnings.length > 0) {
        setNotice(updated.warnings.join(" "))
      }
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed"
      setActionError(message)
      throw err instanceof Error ? err : new Error(message)
    }
  }

  /**
   * Fire-and-forget update for prop callbacks. `handleUpdate` rethrows so
   * awaiters (autosave) can react, but nothing here awaits a rail edit: the
   * failure is already shown via `actionError`, so swallow the rejection
   * instead of leaving it unhandled.
   */
  function runUpdate(issue: Issue, input: UpdateIssueInput): void {
    void handleUpdate(issue, input).catch(() => {
      // actionError already carries the message.
    })
  }

  async function handleStatusChange(issue: Issue, statusId: string) {
    await handleUpdate(issue, { statusId }).catch(() => {
      // actionError already carries the message.
    })
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
      applyUpdated(updated)
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
    applyUpdated(updated)
  }

  function handleDeleted(deleted: Issue) {
    setIssues((current) => current.filter((item) => item.id !== deleted.id))
    setExtraIssue((current) =>
      current && current.id === deleted.id ? null : current
    )
    setSubtasks((current) => {
      const next: Record<string, Issue[]> = {}
      for (const [parentId, rows] of Object.entries(current)) {
        if (parentId === deleted.id) continue
        next[parentId] = rows.filter((r) => r.id !== deleted.id)
      }
      return next
    })
    setPendingConflicts((current) => {
      if (!(deleted.id in current)) return current
      const next = { ...current }
      delete next[deleted.id]
      return next
    })
    delete editingRef.current[deleted.id]
  }

  async function handleCreate(input: CreateIssueInput): Promise<Issue> {
    setActionError(null)
    const created = await api.createIssue(project.id, input)
    setIssues((current) =>
      [...current, created].sort((a, b) => a.number - b.number)
    )
    if (created.parentId) {
      setSubtasks((current) => ({
        ...current,
        [created.parentId as string]: [
          ...(current[created.parentId as string] ?? []),
          created,
        ].sort((a, b) => a.number - b.number),
      }))
    }
    return created
  }

  const selectedIssue =
    issues.find((item) => item.id === selectedId) ??
    (extraIssue && extraIssue.id === selectedId ? extraIssue : null) ??
    (deepIssue && deepIssue.id === selectedId ? deepIssue : null) ??
    null
  const inCreateMode = creating !== null
  const viewLabel =
    view === "list" ? "List" : view === "table" ? "Table" : "Kanban"

  /**
   * Both the project crumb and the Issues crumb land on the project's issues
   * screen — the shell hosts the project page and its issues screen at the
   * same level — so they share the destination: close whatever the user
   * drilled into and keep the chosen View.
   */
  function showIssuesRoot() {
    if (selectedId !== null) delete editingRef.current[selectedId]
    setSelectedId(null)
    setExtraIssue(null)
    setCreating(null)
    onCloseIssue?.()
  }

  /** User opened a row: select it and let the shell push the canonical URL. */
  function openIssue(issue: Issue, opts?: { replace?: boolean }) {
    setSelectedId(issue.id)
    setCreating(null)
    if (
      issue.projectId === project.id &&
      !issues.some((item) => item.id === issue.id) &&
      extraIssue?.id !== issue.id
    ) {
      setExtraIssue(issue)
    }
    onOpenIssue?.(issue, opts)
  }

  /**
   * URL -> state: back/forward, reload, or a pasted share link drives the
   * open detail. `undefined` means uncontrolled (legacy/tests): ignore.
   * List hits select directly; cross-filter deep links resolve via the
   * shell's `deepIssue` or a direct `getIssue` fetch scoped to this project.
   */
  const urlControlled = activeIssueIdentifier !== undefined
  useEffect(() => {
    if (!urlControlled) return
    const wanted =
      activeIssueIdentifier === null || activeIssueIdentifier === undefined
        ? null
        : activeIssueIdentifier.toUpperCase()
    if (wanted === null) {
      if (selectedId !== null) {
        if (selectedId) delete editingRef.current[selectedId]
        setSelectedId(null)
        setExtraIssue(null)
        setCreating(null)
      }
      return
    }
    if (
      selectedIssue &&
      selectedIssue.identifier.toUpperCase() === wanted &&
      selectedIssue.projectId === project.id
    ) {
      return
    }
    const inList =
      issues.find((item) => item.identifier.toUpperCase() === wanted) ?? null
    if (inList) {
      setExtraIssue(null)
      setCreating(null)
      setSelectedId(inList.id)
      return
    }
    if (
      deepIssue &&
      deepIssue.identifier.toUpperCase() === wanted &&
      deepIssue.projectId === project.id
    ) {
      setCreating(null)
      setExtraIssue(deepIssue)
      setSelectedId(deepIssue.id)
      return
    }
    if (extraIssue && extraIssue.identifier.toUpperCase() === wanted) {
      setCreating(null)
      setSelectedId(extraIssue.id)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        if (typeof api.getIssue !== "function") return
        const fetched = await api.getIssue(wanted)
        if (cancelled) return
        if (fetched.projectId !== project.id) return
        setCreating(null)
        setExtraIssue(fetched)
        setSelectedId(fetched.id)
      } catch {
        if (!cancelled) setActionError("Issue not found")
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIssueIdentifier, project.id, urlControlled])

  /** Keep the tab title in sync so shared links show `WEB-123: title`. */
  useEffect(() => {
    if (!urlControlled) return
    if (selectedIssue) {
      document.title = `${selectedIssue.identifier}: ${selectedIssue.title}`
    } else {
      document.title = `${project.name} Issues`
    }
  }, [selectedIssue, project.name, urlControlled])

  const breadcrumbItems: BreadcrumbItem[] =
    selectedIssue === null && !inCreateMode
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
      : selectedIssue !== null
        ? [
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
        : [
            {
              label: project.name,
              onClick: showIssuesRoot,
              icon: { name: project.icon, color: project.color },
            },
            { label: "Issues", onClick: showIssuesRoot },
            { label: "New issue", onClick: showIssuesRoot, current: true },
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
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      aria-busy={refreshing || undefined}
    >
      <div className="flex h-7 items-center gap-1.5">
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
                setSelectedId(null)
                setCreating({ statusId: null })
              }}
            >
              New issue
            </Button>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="-mx-4 border-border border-b" />
      {loading && (
        <p className="text-muted-foreground text-sm">Loading issues…</p>
      )}
      {refreshing && !loading && (
        <p
          role="status"
          aria-live="polite"
          data-testid="issues-updating"
          className="pointer-events-none fixed right-4 bottom-4 z-50 rounded-md border bg-background/95 px-2 py-1 text-muted-foreground text-xs shadow-sm"
        >
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
      {!loading && !error && inCreateMode && (
        <IssueCreateDetail
          projectId={project.id}
          statuses={statuses}
          members={members}
          labels={labels}
          initialStatusId={creating?.statusId ?? undefined}
          canEdit={canWrite}
          onBack={() => setCreating(null)}
          onCreated={async (input) => {
            const created = await handleCreate(input)
            setCreating(null)
            openIssue(created)
            return created
          }}
        />
      )}
      {!loading && !error && !inCreateMode && selectedIssue !== null && (
        <IssueDetail
          key={selectedIssue.id}
          issue={selectedIssue}
          statuses={statuses}
          members={members}
          labels={labels}
          subtasks={subtasks[selectedIssue.id] ?? []}
          canEdit={canWrite}
          canAdmin={canAdmin}
          currentUserId={userId}
          conflictRemote={pendingConflicts[selectedIssue.id] ?? null}
          onBack={() => {
            delete editingRef.current[selectedIssue.id]
            setSelectedId(null)
            setExtraIssue(null)
            onCloseIssue?.()
          }}
          onStatusChange={(issue, statusId) =>
            void handleStatusChange(issue, statusId)
          }
          onUpdate={(issue, input) => {
            runUpdate(issue, input)
          }}
          onArchivedChanged={handleArchivedChanged}
          onDeleted={(deleted) => {
            handleDeleted(deleted)
            delete editingRef.current[selectedIssue.id]
            setSelectedId(null)
            setExtraIssue(null)
            onCloseIssue?.()
          }}
          onEditingChange={(editing) => {
            if (editing) editingRef.current[selectedIssue.id] = true
            else delete editingRef.current[selectedIssue.id]
          }}
          onKeepEditing={() => {
            setPendingConflicts((current) => {
              const next = { ...current }
              delete next[selectedIssue.id]
              return next
            })
            setToast("Conflict resolved: kept the latest change.")
          }}
          onLoadLatest={() => {
            const remote = pendingConflicts[selectedIssue.id]
            if (remote) {
              applyUpdated(remote)
              setPendingConflicts((current) => {
                const next = { ...current }
                delete next[selectedIssue.id]
                return next
              })
            }
          }}
          onCreateSubtask={(_parent, input) => handleCreate(input)}
          onSubtaskEditingChange={(subtaskId, editing) => {
            if (editing) editingRef.current[subtaskId] = true
            else delete editingRef.current[subtaskId]
          }}
          subtaskConflicts={pendingConflicts}
          onSubtaskKeepEditing={(subtaskId) => {
            setPendingConflicts((current) => {
              const next = { ...current }
              delete next[subtaskId]
              return next
            })
            setToast("Conflict resolved: kept the latest change.")
          }}
          onSubtaskLoadLatest={(subtaskId) => {
            const remote = pendingConflicts[subtaskId]
            if (remote) {
              applyUpdated(remote)
              setPendingConflicts((current) => {
                const next = { ...current }
                delete next[subtaskId]
                return next
              })
            }
          }}
        />
      )}
      {!loading &&
        !error &&
        !inCreateMode &&
        selectedIssue === null &&
        view === "list" && (
          <IssueList
            issues={issues}
            statuses={statuses}
            members={members}
            labels={labels}
            canEdit={canWrite}
            onStatusChange={(issue, statusId) =>
              void handleStatusChange(issue, statusId)
            }
            onUpdate={runUpdate}
            onAddIssue={
              canWrite
                ? (statusId) => {
                    setSelectedId(null)
                    setCreating({ statusId })
                  }
                : undefined
            }
            onOpenDetail={(issue) => openIssue(issue)}
            groupBy={filters.groupBy}
            order={filters.order}
            showEmptyGroups={filters.showEmptyGroups}
            display={filters.display}
          />
        )}
      {!loading &&
        !error &&
        !inCreateMode &&
        selectedIssue === null &&
        view === "table" && (
          <IssueTable
            issues={issues}
            statuses={statuses}
            members={members}
            labels={labels}
            canEdit={canWrite}
            onUpdate={runUpdate}
            onOpenDetail={(issue) => openIssue(issue)}
          />
        )}
      {!loading &&
        !error &&
        !inCreateMode &&
        selectedIssue === null &&
        view === "kanban" && (
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
            onAssign={(issue, assigneeId) => runUpdate(issue, { assigneeId })}
            onOpenDetail={(issue) => openIssue(issue)}
          />
        )}
      {realtimeEnabled && (
        <>
          <LiveIssuesBridge
            projectId={project.id}
            filters={{
              statusIds: filters.statusIds,
              priorities: filters.priorities,
              assigneeId: filters.assigneeId,
              labels: filters.labels,
              text: filters.text,
            }}
            enabled={presetResolved}
            onRows={applyLiveIssues}
            onStatus={(status) => setIssuesLive(status === "live")}
          />
          {extraIssue !== null && (
            <LiveIssueBridge
              issueRef={extraIssue.identifier}
              onRows={(rows) => {
                const row = rows[0]
                if (row) applyUpdated(row)
                else setExtraIssue(null)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
