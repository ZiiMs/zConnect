import type {
  ActivityEvent,
  Comment,
  Issue,
  TimelineItem,
  UpdateIssueInput,
} from "./store.js"

/**
 * Shared collaboration-core helpers used by both the memory and Drizzle
 * stores. Keeping the issue diff, cursor codec, and timeline merge here is
 * what stops the two stores from drifting: only row shape/IO differs.
 */

/** One Activity Event about to be persisted (id/issueId/timestamp added by the store). */
export interface ActivityDraft {
  type: string
  summary: string
  payload: Record<string, unknown>
}

/** Extra identifiers needed for payloads that speak in human identifiers. */
export interface IssueDiffRefs {
  fromParentIdentifier?: string | null
  toParentIdentifier?: string | null
}

/** A window inside which repeat description autosaves collapse to one event. */
export const DESCRIPTION_COALESCE_MS = 15 * 60 * 1000

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Translate one PATCH into Activity Event drafts. Only real field changes
 * emit: a PATCH that matches the stored row produces an empty array. Labels
 * compare as sets, description payloads never carry the body.
 */
export function diffIssueUpdate(
  before: Issue,
  after: Issue,
  input: UpdateIssueInput,
  refs: IssueDiffRefs = {}
): ActivityDraft[] {
  const drafts: ActivityDraft[] = []

  if (after.statusId !== before.statusId) {
    drafts.push({
      type: "issue.status_changed",
      summary: "changed status",
      payload: { fromStatusId: before.statusId, toStatusId: after.statusId },
    })
  }
  if (after.assigneeId !== before.assigneeId) {
    drafts.push({
      type: "issue.assignee_changed",
      summary: "changed assignee",
      payload: {
        fromAssigneeId: before.assigneeId,
        toAssigneeId: after.assigneeId,
      },
    })
  }
  if (after.priority !== before.priority) {
    drafts.push({
      type: "issue.priority_changed",
      summary: "changed priority",
      payload: { from: before.priority, to: after.priority },
    })
  }
  if (after.dueDate !== before.dueDate) {
    drafts.push({
      type: "issue.due_date_changed",
      summary: "changed due date",
      payload: { from: before.dueDate, to: after.dueDate },
    })
  }
  if (after.title !== before.title) {
    drafts.push({
      type: "issue.title_changed",
      summary: "changed title",
      payload: { from: before.title, to: after.title },
    })
  }
  if (after.description !== before.description) {
    drafts.push({
      type: "issue.description_changed",
      summary: "changed description",
      // Never the body: the UI only needs to know it changed.
      payload: { changed: true },
    })
  }
  if (!sameList(before.labels, after.labels)) {
    const beforeSet = new Set(before.labels)
    const afterSet = new Set(after.labels)
    const added = after.labels.filter((label) => !beforeSet.has(label))
    const removed = before.labels.filter((label) => !afterSet.has(label))
    // A pure reorder is not a label-set change.
    if (added.length > 0 || removed.length > 0) {
      drafts.push({
        type: "issue.labels_changed",
        summary: "changed labels",
        payload: { added, removed },
      })
    }
  }
  if (after.parentId !== before.parentId) {
    drafts.push({
      type: "issue.parent_changed",
      summary: "changed parent",
      payload: {
        from:
          refs.fromParentIdentifier !== undefined
            ? refs.fromParentIdentifier
            : before.parentId,
        to:
          refs.toParentIdentifier !== undefined
            ? refs.toParentIdentifier
            : after.parentId,
      },
    })
  }
  if (after.projectId !== before.projectId) {
    drafts.push({
      type: "issue.moved",
      summary: "moved the issue",
      payload: {
        fromProjectId: before.projectId,
        toProjectId: after.projectId,
      },
    })
  }
  if (after.archived !== before.archived) {
    drafts.push({
      type: after.archived ? "issue.archived" : "issue.unarchived",
      summary: after.archived ? "archived the issue" : "unarchived the issue",
      payload: { archived: after.archived },
    })
  }

  // `input` is accepted for parity with the store call sites and future
  // fields; every emitted draft above is driven by the actual before/after
  // rows, which is also what makes no-ops emit nothing.
  void input
  return drafts
}

/**
 * Description coalescing: true when the newest matching
 * `issue.description_changed` event falls inside the 15-minute window, so
 * the caller should skip appending a new one (the issue still updates).
 */
export function isDescriptionCoalesced(
  newestCreatedAt: string | null | undefined,
  now: Date
): boolean {
  if (!newestCreatedAt) return false
  const time = new Date(newestCreatedAt).getTime()
  if (Number.isNaN(time)) return false
  return now.getTime() - time < DESCRIPTION_COALESCE_MS
}

/** GitHub link events are namespaced by their old timeline `kind`. */
export function githubActivityType(kind: string): string {
  return `github.${kind}`
}

/** Build the migrated/live GitHub Activity Event draft. */
export function githubActivityDraft(kind: string, body: string): ActivityDraft {
  return {
    type: githubActivityType(kind),
    summary: body,
    payload: { kind },
  }
}

/**
 * Opaque timeline cursor: base64url of `${createdAt}|${id}`, meaning
 * "strictly older than this item". Returning null for malformed input keeps
 * a stale client cursor from 500-ing a list route.
 */
export function encodeCursor(item: { createdAt: string; id: string }): string {
  return Buffer.from(`${item.createdAt}|${item.id}`, "utf8").toString(
    "base64url"
  )
}

export function decodeCursor(
  cursor: string | null | undefined
): { createdAt: string; id: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8")
    const separator = raw.indexOf("|")
    if (separator <= 0) return null
    const createdAt = raw.slice(0, separator)
    const id = raw.slice(separator + 1)
    if (!createdAt || !id) return null
    if (Number.isNaN(new Date(createdAt).getTime())) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

/** Strictly-older comparison in the documented (createdAt, id) order. */
export function isOlderThanCursor(
  item: { createdAt: string; id: string },
  cursor: { createdAt: string; id: string }
): boolean {
  if (item.createdAt !== cursor.createdAt) {
    return item.createdAt < cursor.createdAt
  }
  return item.id < cursor.id
}

/** Newest first: createdAt descending, then id descending (string compare). */
export function compareTimelineDesc(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string }
): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1
  }
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/**
 * Merge Comments and Activity Events into one newest-first page. Callers
 * fetch `limit + 1` rows per side after applying the cursor filter, so the
 * merged length is enough to know whether another page exists.
 */
export function mergeTimeline(
  comments: Comment[],
  events: ActivityEvent[],
  limit: number
): { items: TimelineItem[]; nextCursor: string | null } {
  const merged: TimelineItem[] = [
    ...comments.map((comment) => ({ kind: "comment" as const, ...comment })),
    ...events.map((event) => ({ kind: "activity" as const, ...event })),
  ].sort(compareTimelineDesc)
  const items = merged.slice(0, limit)
  const last = items[items.length - 1]
  const nextCursor = merged.length > limit && last ? encodeCursor(last) : null
  return { items, nextCursor }
}
