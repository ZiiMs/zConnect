import { GitPullRequest } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CommentComposer } from "@/components/comment-composer"
import { CommentItem } from "@/components/comment-item"
import { LiveTimelineBridge } from "@/components/realtime/live-timeline"
import { usePolling } from "@/hooks/use-polling"
import {
  type ActivityEvent,
  api,
  type Comment,
  findMember,
  type Issue,
  type Member,
  type MemberRef,
  memberName,
  type Status,
  type TimelineItem,
} from "@/lib/api"
import { realtimeEnabled } from "@/lib/realtime"
import { formatRelativeTime } from "@/lib/relative-time"

type ProjectRef = { id: string; name: string }

/**
 * Issue Activity feed (§1–§3): comments and Activity Events merged by the
 * server, rendered oldest→newest with the composer at the bottom. The API
 * pages newest-first, so "Load earlier" walks `nextCursor` backwards and
 * merges without duplicate or skipped rows. Comments go through the
 * sanitized Markdown view; comment writes never appear as Activity.
 */
export function IssueActivity({
  issue,
  statuses,
  members,
  currentUserId = null,
  canWrite,
  canAdmin,
  projects = [],
}: {
  issue: Issue
  statuses: Status[]
  members: Member[]
  currentUserId?: string | null
  canWrite: boolean
  canAdmin: boolean
  projects?: ProjectRef[]
}) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [timelineLive, setTimelineLive] = useState(false)
  const loadedOnce = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const page = await api.listTimeline(issue.identifier)
      setItems((current) => mergeTimeline(current, page.items))
      if (!loadedOnce.current) {
        loadedOnce.current = true
        setCursor(page.nextCursor)
      }
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load the activity feed."
      )
    } finally {
      setLoading(false)
    }
  }, [issue.identifier])

  useEffect(() => {
    loadedOnce.current = false
    setItems([])
    setCursor(null)
    setReplyTo(null)
    setTimelineLive(false)
    setLoading(true)
    void refresh()
  }, [refresh])

  const poll = useCallback(() => refresh(), [refresh])
  usePolling(poll, { enabled: !timelineLive })

  /** Neon Realtime keeps the newest page current without a refetch. */
  const applyLiveTimeline = useCallback((rows: readonly TimelineItem[]) => {
    setItems((current) => mergeTimeline(current, [...rows]))
    setLoading(false)
    setError(null)
  }, [])

  async function loadEarlier() {
    if (cursor === null || loadingEarlier) return
    setLoadingEarlier(true)
    setError(null)
    try {
      const page = await api.listTimeline(issue.identifier, { before: cursor })
      setItems((current) => mergeTimeline(current, page.items))
      setCursor(page.nextCursor)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load earlier activity."
      )
    } finally {
      setLoadingEarlier(false)
    }
  }

  function replaceComment(comment: Comment) {
    setItems((current) =>
      current.map((item) =>
        item.kind === "comment" && item.id === comment.id
          ? { kind: "comment", ...comment }
          : item
      )
    )
  }

  const comments = new Map<string, Comment>()
  for (const item of items) {
    if (item.kind === "comment") comments.set(item.id, item)
  }

  function parentAuthorName(comment: Comment): string | null {
    if (comment.parentId === null) return null
    const parent = comments.get(comment.parentId)
    if (!parent) return null
    return memberName(findMember(members, parent.authorId), parent.authorId)
  }

  return (
    <section aria-label="Activity" className="mt-6">
      <h3 className="mb-2 font-medium text-sm">Activity</h3>
      {loading && items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Loading activity…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No activity yet.</p>
      ) : (
        <>
          {cursor !== null && (
            <button
              type="button"
              onClick={() => void loadEarlier()}
              disabled={loadingEarlier}
              className="mb-2 rounded-md border border-input px-2 py-1 text-xs disabled:opacity-50"
            >
              {loadingEarlier ? "Loading…" : "Load earlier"}
            </button>
          )}
          <ol aria-label="Activity feed" className="flex flex-col gap-3">
            {items.map((item) =>
              item.kind === "comment" ? (
                <li key={item.id}>
                  <CommentItem
                    comment={item}
                    parentAuthorName={parentAuthorName(item)}
                    members={members}
                    currentUserId={currentUserId}
                    canWrite={canWrite}
                    canAdmin={canAdmin}
                    onReply={setReplyTo}
                    onUpdated={replaceComment}
                    onDeleted={replaceComment}
                  />
                </li>
              ) : (
                <ActivityEventRow
                  key={item.id}
                  event={item}
                  statuses={statuses}
                  members={members}
                  issue={issue}
                  projects={projects}
                />
              )
            )}
          </ol>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-destructive text-xs">
          {error}
        </p>
      )}
      {canWrite && (
        <CommentComposer
          issueIdentifier={issue.identifier}
          parent={replyTo}
          members={members}
          onCreated={(comment) => {
            setItems((current) =>
              mergeTimeline(current, [{ kind: "comment", ...comment }])
            )
            setReplyTo(null)
          }}
          onCancelReply={() => setReplyTo(null)}
        />
      )}
      {realtimeEnabled && (
        <LiveTimelineBridge
          issueRef={issue.identifier}
          onRows={applyLiveTimeline}
          onStatus={(status) => setTimelineLive(status === "live")}
        />
      )}
    </section>
  )
}

function mergeTimeline(
  current: TimelineItem[],
  incoming: TimelineItem[]
): TimelineItem[] {
  const byId = new Map<string, TimelineItem>()
  for (const item of current) byId.set(item.id, item)
  // Server rows win over optimistic/local copies of the same id.
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt)
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
  })
}

function ActivityEventRow({
  event,
  statuses,
  members,
  issue,
  projects,
}: {
  event: ActivityEvent
  statuses: Status[]
  members: MemberRef[]
  issue: Issue
  projects: ProjectRef[]
}) {
  const actor = activityActor(event, members)

  if (event.actorType === "github" || event.type.startsWith("github.")) {
    return (
      <li
        data-testid={`activity-${event.id}`}
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
          <GitPullRequest aria-hidden="true" size={12} />
          GitHub
        </span>
        <span className="min-w-0 break-words text-muted-foreground">
          {event.summary}
        </span>
        <ActivityTime createdAt={event.createdAt} />
      </li>
    )
  }

  return (
    <li
      data-testid={`activity-${event.id}`}
      className="flex flex-wrap items-baseline gap-1 text-sm"
    >
      <span className="font-medium">{actor}</span>
      <span>{event.summary}</span>
      <ActivityDetail
        event={event}
        statuses={statuses}
        members={members}
        issue={issue}
        projects={projects}
      />
      <ActivityTime createdAt={event.createdAt} />
    </li>
  )
}

function ActivityDetail({
  event,
  statuses,
  members,
  issue,
  projects,
}: {
  event: ActivityEvent
  statuses: Status[]
  members: MemberRef[]
  issue: Issue
  projects: ProjectRef[]
}) {
  const payload = event.payload

  switch (event.type) {
    case "issue.status_changed":
      return (
        <Change
          from={statusLabel(statuses, stringValue(payload.fromStatusId))}
          to={statusLabel(statuses, stringValue(payload.toStatusId))}
        />
      )
    case "issue.assignee_changed":
      return (
        <Change
          from={assigneeLabel(members, stringValue(payload.fromAssigneeId))}
          to={assigneeLabel(members, stringValue(payload.toAssigneeId))}
        />
      )
    case "issue.priority_changed":
      return (
        <Change
          from={stringValue(payload.from) ?? "None"}
          to={stringValue(payload.to) ?? "None"}
        />
      )
    case "issue.due_date_changed":
      return (
        <Change
          from={dateLabel(stringValue(payload.from))}
          to={dateLabel(stringValue(payload.to))}
        />
      )
    case "issue.title_changed":
      return (
        <Change
          from={stringValue(payload.from) ?? ""}
          to={stringValue(payload.to) ?? ""}
        />
      )
    case "issue.parent_changed":
      return (
        <Change
          from={stringValue(payload.from) ?? "none"}
          to={stringValue(payload.to) ?? "none"}
        />
      )
    case "issue.moved":
      return (
        <Change
          from={projectLabel(
            projects,
            issue,
            stringValue(payload.fromProjectId)
          )}
          to={projectLabel(projects, issue, stringValue(payload.toProjectId))}
        />
      )
    case "issue.archived":
    case "issue.unarchived": {
      const archived =
        typeof payload.archived === "boolean"
          ? payload.archived
          : event.type === "issue.archived"
      return (
        <span className="rounded bg-muted px-1 text-xs">
          {archived ? "Archived" : "Unarchived"}
        </span>
      )
    }
    case "issue.labels_changed": {
      const added = stringArray(payload.added)
      const removed = stringArray(payload.removed)
      if (added.length === 0 && removed.length === 0) return null
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {added.map((label) => (
            <span
              key={`added-${label}`}
              className="rounded bg-muted px-1 text-xs"
            >
              +{label}
            </span>
          ))}
          {removed.map((label) => (
            <span
              key={`removed-${label}`}
              className="rounded bg-muted px-1 text-xs line-through"
            >
              -{label}
            </span>
          ))}
        </span>
      )
    }
    // Everything else (description/title payload bodies included) renders
    // through the summary only — no field diffs and no hidden body text.
    default:
      return null
  }
}

function Change({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="rounded bg-muted px-1">{from}</span>
      <span aria-hidden="true">→</span>
      <span className="rounded bg-muted px-1">{to}</span>
    </span>
  )
}

function ActivityTime({ createdAt }: { createdAt: string }) {
  return (
    <time
      dateTime={createdAt}
      title={new Date(createdAt).toLocaleString()}
      className="text-muted-foreground text-xs"
    >
      {formatRelativeTime(createdAt)}
    </time>
  )
}

function activityActor(event: ActivityEvent, members: MemberRef[]): string {
  if (event.actorType === "github") return "GitHub"
  if (event.actorType === "system") return "System"
  if (event.actorId === null) {
    return event.actorType === "agent" ? "Agent" : "Someone"
  }
  const member = findMember(members, event.actorId)
  if (member) return memberName(member, event.actorId)
  return event.actorType === "agent" ? "Agent" : event.actorId
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function statusLabel(statuses: Status[], statusId: string | null): string {
  if (statusId === null) return "No status"
  return statuses.find((status) => status.id === statusId)?.name ?? statusId
}

function assigneeLabel(members: MemberRef[], userId: string | null): string {
  if (userId === null) return "Unassigned"
  return memberName(findMember(members, userId), userId)
}

function dateLabel(value: string | null): string {
  if (value === null) return "none"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function projectLabel(
  projects: ProjectRef[],
  issue: Issue,
  projectId: string | null
): string {
  if (projectId === null) return "none"
  const project = projects.find((entry) => entry.id === projectId)
  if (project) return project.name
  return projectId === issue.projectId ? "this project" : projectId
}
