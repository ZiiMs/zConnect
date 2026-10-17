import { ChevronDown, ChevronUp, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { ExternalLinkSection } from "@/components/external-link-section"
import { IssueActions } from "@/components/issue-actions"
import { IssueBody } from "@/components/issue-body"
import { IssueMarkdown } from "@/components/issue-markdown"
import { IssueRail } from "@/components/issue-rail"
import { IssueTitleInput } from "@/components/issue-title-input"
import { SubtaskComposer } from "@/components/subtask-composer"
import { Modal } from "@/components/ui/dialog"
import { useAutosaveIssue } from "@/hooks/use-autosave-issue"
import type {
  CreateIssueInput,
  Issue,
  Label,
  Member,
  Priority,
  Status,
  UpdateIssueInput,
} from "@/lib/api"
import { isTerminalStatusCategory } from "@/lib/api"
import { StatusIcon } from "@/lib/status-icons"

/**
 * Issue detail (§3–§8): full detail view with inline title, TipTap Markdown
 * body with autosave, editable rail, conflict banner, subtask footer, and a
 * compact mode for the subtask modal. Create mode (`IssueCreateDetail`)
 * reuses the same rail/title/body surfaces as a blank draft with no DB row
 * until the title commits.
 */

export function IssueDetail({
  issue,
  statuses,
  members,
  labels = [],
  subtasks = [],
  canEdit,
  canAdmin,
  compact = false,
  conflictRemote = null,
  onBack,
  onStatusChange,
  onUpdate,
  onArchivedChanged,
  onDeleted,
  onEditingChange,
  onKeepEditing,
  onLoadLatest,
  onCreateSubtask,
  onSubtaskOpened,
  onSubtaskEditingChange,
  subtaskConflicts,
  onSubtaskKeepEditing,
  onSubtaskLoadLatest,
}: {
  issue: Issue
  statuses: Status[]
  members: Member[]
  labels?: Label[]
  subtasks?: Issue[]
  canEdit: boolean
  canAdmin: boolean
  compact?: boolean
  conflictRemote?: Issue | null
  onBack: () => void
  onStatusChange: (issue: Issue, statusId: string) => void
  onUpdate: (issue: Issue, input: UpdateIssueInput) => void
  onArchivedChanged: (updated: Issue) => void
  onDeleted: (deleted: Issue) => void
  onEditingChange?: (editing: boolean) => void
  onKeepEditing?: () => void
  onLoadLatest?: () => void
  onCreateSubtask?: (parent: Issue, input: CreateIssueInput) => Promise<Issue>
  onSubtaskOpened?: (subtask: Issue) => void
  onSubtaskEditingChange?: (subtaskId: string, editing: boolean) => void
  subtaskConflicts?: Record<string, Issue>
  onSubtaskKeepEditing?: (subtaskId: string) => void
  onSubtaskLoadLatest?: (subtaskId: string) => void
}) {
  const [modalSubtaskId, setModalSubtaskId] = useState<string | null>(null)
  const [creatingSubtask, setCreatingSubtask] = useState(false)

  const autosave = useAutosaveIssue({
    issue,
    onSave: async (current, input) => {
      // Bridge the callback-style container to the promise the hook needs.
      // The container applies the returned row; resolve with the optimistic
      // merge when it returns void (tests stub onUpdate without return).
      const maybe = onUpdate(current, input) as unknown
      if (
        maybe !== null &&
        typeof maybe === "object" &&
        "then" in (maybe as Record<string, unknown>)
      ) {
        return (await maybe) as Issue
      }
      return { ...current, ...input } as Issue
    },
    paused: conflictRemote !== null,
    onEditingChange,
    onSaved: (updated) => {
      // Keep the container row in sync for fields the hook saved (title/body).
      // Rail writes go through onUpdate directly, so this is a no-op there.
    },
  })

  // Clear the sender/conflict gate when this detail unmounts (Back, switch,
  // modal close): otherwise a stale `editing=true` bit would hold the next
  // remote UPDATE as a false conflict.
  useEffect(() => {
    return () => {
      onEditingChange?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLoadLatest() {
    // Discard the local draft first so the hook's never-clobber sync picks
    // up the remote row the container applies next.
    autosave.discardDraft()
    onLoadLatest?.()
  }

  const modalSubtask = subtasks.find((s) => s.id === modalSubtaskId) ?? null
  const isSubtask = issue.parentId !== null && issue.parentId !== undefined
  const showCreate = canEdit && !isSubtask && onCreateSubtask !== undefined
  const [subtasksOpen, setSubtasksOpen] = useState(true)
  const doneSubtasks = subtasks.filter((subtask) => {
    const status = statuses.find((s) => s.id === subtask.statusId)
    return status !== undefined && isTerminalStatusCategory(status.category)
  }).length

  return (
    <div
      data-testid={
        compact
          ? `issue-detail-compact-${issue.identifier}`
          : `issue-detail-${issue.identifier}`
      }
      className={compact ? "w-full" : "mx-auto w-full max-w-[77rem]"}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            void autosave.flush()
            onBack()
          }}
          aria-label="Back to issues"
          className="rounded-md border border-input px-2 py-1 text-xs"
        >
          ← Back
        </button>
        {canEdit && (
          <IssueActions
            issue={issue}
            canAdmin={canAdmin}
            onChanged={onArchivedChanged}
            onDeleted={onDeleted}
          />
        )}
      </div>
      {conflictRemote !== null && (
        <div
          role="alert"
          className="mt-2 rounded-md border p-2 text-sm"
          data-testid={`conflict-banner-${issue.identifier}`}
        >
          <p>This issue changed while you were editing.</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => handleLoadLatest()}
              className="rounded-md border border-input px-2 py-0.5 text-xs"
            >
              Load latest
            </button>
            <button
              type="button"
              onClick={() => onKeepEditing?.()}
              className="rounded-md border border-input px-2 py-0.5 text-xs"
            >
              Keep editing
            </button>
          </div>
        </div>
      )}
      <div
        className={
          compact
            ? "mt-4 flex flex-col gap-4"
            : "mt-4 grid gap-8 md:grid-cols-[2fr_1fr]"
        }
      >
        <div className="min-w-0">
          <p className="font-mono text-xs">{issue.identifier}</p>
          {canEdit ? (
            <IssueTitleInput
              identifier={issue.identifier}
              value={autosave.titleDraft}
              state={autosave.titleState}
              error={autosave.titleError}
              canEdit={canEdit}
              onChange={autosave.setTitleDraft}
              onCommit={() => void autosave.commitTitle()}
              onCancel={autosave.cancelTitle}
            />
          ) : (
            <h2 className="mt-1 font-semibold text-xl leading-snug">
              {issue.title}
            </h2>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {statuses.find((s) => s.id === issue.statusId)?.name ?? "Unknown"}
            </span>
            <span className="text-muted-foreground text-xs">
              {issue.priority}
            </span>
          </div>
          <div className="mt-3">
            {canEdit ? (
              <IssueBody
                identifier={issue.identifier}
                markdown={autosave.bodyDraft}
                saveState={autosave.bodyState}
                saveError={autosave.bodyError}
                canEdit={canEdit}
                onChange={autosave.setBodyDraft}
                onFlush={() => void autosave.flush()}
                onCancel={autosave.discardDraft}
                onRetry={autosave.retryBody}
              />
            ) : issue.description ? (
              <IssueMarkdown markdown={issue.description} />
            ) : (
              <p className="text-sm leading-relaxed">No description yet.</p>
            )}
          </div>
          {!isSubtask || subtasks.length > 0 || showCreate ? (
            <section className="mt-6">
              <div className="mb-1 flex items-center gap-1">
                <h3 className="font-medium text-sm">
                  Subtasks{" "}
                  <span className="text-muted-foreground">
                    {doneSubtasks}/{subtasks.length}
                  </span>
                </h3>
                <div className="ml-auto flex items-center">
                  <button
                    type="button"
                    onClick={() => setSubtasksOpen((open) => !open)}
                    aria-label={
                      subtasksOpen ? "Collapse subtasks" : "Expand subtasks"
                    }
                    aria-expanded={subtasksOpen}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {subtasksOpen ? (
                      <ChevronUp aria-hidden="true" size={14} />
                    ) : (
                      <ChevronDown aria-hidden="true" size={14} />
                    )}
                  </button>
                  {showCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubtasksOpen(true)
                        setCreatingSubtask(true)
                      }}
                      aria-label="Create sub-issue"
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus aria-hidden="true" size={14} />
                    </button>
                  )}
                </div>
              </div>
              {subtasksOpen &&
                (subtasks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No subtasks yet.
                  </p>
                ) : (
                  <ul className="flex flex-col" aria-label="Subtasks">
                    {subtasks.map((subtask) => {
                      const status = statuses.find(
                        (s) => s.id === subtask.statusId
                      )
                      return (
                        <li key={subtask.id}>
                          <button
                            type="button"
                            data-testid={`subtask-${subtask.identifier}`}
                            onClick={() => {
                              onSubtaskOpened?.(subtask)
                              setModalSubtaskId(subtask.id)
                            }}
                            className="flex w-full items-center gap-2 rounded py-1 text-left text-sm hover:bg-accent/50"
                          >
                            <span className="shrink-0 font-mono text-muted-foreground text-xs">
                              {subtask.identifier}
                            </span>
                            {status && <StatusIcon status={status} size={12} />}
                            <span className="min-w-0 flex-1 truncate">
                              {subtask.title}
                            </span>
                            <span className="shrink-0 text-muted-foreground text-xs">
                              {status?.name ?? "Unknown"}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ))}
              {showCreate && creatingSubtask && onCreateSubtask && (
                <div className="mt-2">
                  <SubtaskComposer
                    parent={issue}
                    statuses={statuses}
                    members={members}
                    labels={labels}
                    onCreated={async (input) => {
                      const created = await onCreateSubtask(issue, {
                        ...input,
                        parentId: issue.id,
                      })
                      setCreatingSubtask(false)
                      return created
                    }}
                    onCancel={() => setCreatingSubtask(false)}
                  />
                </div>
              )}
            </section>
          ) : null}
        </div>
        <aside
          aria-label="Properties"
          className="h-fit rounded-md border bg-card p-3"
        >
          <IssueRail
            issue={issue}
            statuses={statuses}
            members={members}
            labels={labels}
            canEdit={canEdit}
            onStatusChange={onStatusChange}
            onUpdate={onUpdate}
          />
          <div className="mt-3 border-t pt-3">
            <ExternalLinkSection
              issueIdentifier={issue.identifier}
              canWrite={canEdit}
            />
          </div>
        </aside>
      </div>
      <Modal
        open={modalSubtask !== null}
        onOpenChange={(open) => {
          if (!open) {
            setModalSubtaskId(null)
          }
        }}
        title={modalSubtask ? `Subtask ${modalSubtask.identifier}` : "Subtask"}
        className="max-w-2xl"
      >
        {modalSubtask && (
          <IssueDetail
            issue={modalSubtask}
            statuses={statuses}
            members={members}
            labels={labels}
            subtasks={[]}
            canEdit={canEdit}
            canAdmin={canAdmin}
            compact
            conflictRemote={subtaskConflicts?.[modalSubtask.id] ?? null}
            onBack={() => setModalSubtaskId(null)}
            onStatusChange={onStatusChange}
            onUpdate={onUpdate}
            onArchivedChanged={onArchivedChanged}
            onDeleted={(deleted) => {
              onDeleted(deleted)
              setModalSubtaskId(null)
            }}
            onEditingChange={
              onSubtaskEditingChange
                ? (editing) => onSubtaskEditingChange(modalSubtask.id, editing)
                : undefined
            }
            onKeepEditing={
              onSubtaskKeepEditing
                ? () => onSubtaskKeepEditing(modalSubtask.id)
                : undefined
            }
            onLoadLatest={
              onSubtaskLoadLatest
                ? () => onSubtaskLoadLatest(modalSubtask.id)
                : undefined
            }
          />
        )}
      </Modal>
    </div>
  )
}

/**
 * Create-mode detail (§6): blank draft on one screen, no DB row until the
 * title commits (Enter/blur). Rail + body stay local until then and go out
 * together in the first `createIssue` call. Whitespace-only title never
 * creates (inline hint, no toast). Leaving with empty title + empty body
 * discards silently; any body content or non-default rail picks confirm.
 */
export function IssueCreateDetail({
  projectId,
  statuses,
  members,
  labels = [],
  initialStatusId,
  parentId = null,
  canEdit = true,
  compact = false,
  onBack,
  onCreated,
}: {
  projectId: string
  statuses: Status[]
  members: Member[]
  labels?: Label[]
  initialStatusId?: string
  parentId?: string | null
  canEdit?: boolean
  compact?: boolean
  onBack: () => void
  onCreated: (input: CreateIssueInput) => Promise<Issue>
}) {
  const defaultStatusId = initialStatusId ?? statuses[0]?.id ?? ""
  const [title, setTitle] = useState("")
  const [committed, setCommitted] = useState(false)
  const [titleHint, setTitleHint] = useState(false)
  const [body, setBody] = useState("")
  const [statusId, setStatusId] = useState(defaultStatusId)
  const [priority, setPriority] = useState<Priority>("Medium")
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [labelNames, setLabelNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dueDay = dueDate?.slice(0, 10) ?? ""
  const draftIssue: Issue = {
    id: "new",
    projectId,
    number: 0,
    keyPrefix: "NEW",
    identifier: parentId ? "NEW (subtask)" : "NEW",
    title: title || "Untitled",
    description: body || null,
    statusId,
    priority,
    assigneeId,
    dueDate,
    archived: false,
    labels: labelNames,
    parentId,
  }

  const isPristine =
    title.trim() === "" &&
    body.trim() === "" &&
    statusId === defaultStatusId &&
    priority === "Medium" &&
    assigneeId === null &&
    dueDate === null &&
    labelNames.length === 0

  async function commit() {
    if (committed || saving) return
    if (title.trim() === "") {
      setTitleHint(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreated({
        title: title.trim(),
        description: body.trim() ? body : null,
        statusId,
        priority,
        assigneeId,
        dueDate,
        labels: labelNames,
        parentId,
      })
      setCommitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed")
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (isPristine) {
      onBack()
      return
    }
    if (window.confirm("Discard this issue?")) {
      onBack()
    }
  }

  return (
    <div
      data-testid="issue-create-detail"
      className={compact ? "w-full" : "mx-auto w-full max-w-[77rem]"}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back to issues"
          className="rounded-md border border-input px-2 py-1 text-xs"
        >
          ← Back
        </button>
        <span className="text-muted-foreground text-xs">
          {parentId ? "New sub-issue" : "New issue"}
        </span>
      </div>
      <div
        className={
          compact
            ? "mt-4 flex flex-col gap-4"
            : "mt-4 grid gap-8 md:grid-cols-[2fr_1fr]"
        }
      >
        <div className="min-w-0">
          <p className="font-mono text-xs">{parentId ? "NEW" : "NEW"}</p>
          <input
            aria-label="Issue title"
            placeholder="Issue title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (e.target.value.trim() !== "") setTitleHint(false)
            }}
            onBlur={() => {
              if (title.trim() !== "") void commit()
              else if (title !== "") setTitleHint(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void commit()
              } else if (e.key === "Escape") {
                handleBack()
              }
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 font-semibold text-xl leading-snug outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {titleHint && (
            <p className="mt-1 text-destructive text-xs">Title is required</p>
          )}
          {saving && <p className="text-muted-foreground text-xs">Creating…</p>}
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="mt-3">
            <IssueBody
              identifier="NEW"
              markdown={body}
              saveState={body.trim() === "" ? "saved" : "editing"}
              saveError={null}
              canEdit={canEdit}
              onChange={setBody}
              onFlush={() => {}}
              onCancel={() => setBody("")}
              onRetry={() => {}}
            />
          </div>
          <CreateSubtaskHint parentId={parentId} />
        </div>
        <aside
          aria-label="Properties"
          className="h-fit rounded-md border bg-card p-3"
        >
          <IssueRail
            issue={draftIssue}
            statuses={statuses}
            members={members}
            labels={labels}
            canEdit={canEdit}
            onStatusChange={(_issue, nextStatusId) => setStatusId(nextStatusId)}
            onUpdate={(_issue, input) => {
              if (input.priority !== undefined) setPriority(input.priority)
              if (input.assigneeId !== undefined)
                setAssigneeId(input.assigneeId)
              if (input.dueDate !== undefined) {
                const v = input.dueDate
                setDueDate(
                  v === null
                    ? null
                    : v.length === 10
                      ? new Date(v).toISOString()
                      : v
                )
              }
              if (input.labels !== undefined) setLabelNames(input.labels)
              if (input.statusId !== undefined) setStatusId(input.statusId)
            }}
          />
          {/* Keep due-date input in sync with local draft day. */}
          <input type="hidden" value={dueDay} readOnly aria-hidden="true" />
        </aside>
      </div>
    </div>
  )
}

function CreateSubtaskHint({ parentId }: { parentId: string | null }) {
  if (parentId) return null
  return <span className="hidden" aria-hidden="true" />
}
