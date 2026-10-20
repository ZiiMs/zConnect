/**
 * Notification digest job (R2). Extracted from the BullMQ worker so the
 * batching rules — age window, per-user grouping, email dedupe — are testable
 * without Redis. The store owns which rows are eligible; this module owns the
 * message and the mark-emailed handoff.
 */
import type { Mailer } from "../lib/mailer.js"
import type { Notification, WorkspaceStore } from "../workspaces/store.js"

/** Only notifications older than this window are swept into a digest. */
const DIGEST_WINDOW_MS = 30 * 60 * 1000

/** Read rows older than this are purged on every run. */
const PURGE_AFTER_MS = 90 * 24 * 60 * 60 * 1000

const DEFAULT_FRONTEND_URL = "http://localhost:5173"

/** Strip a trailing slash so link paths never double up. */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "")
}

/**
 * The frontend's `slugifyWorkspace` rule, duplicated because backend mail
 * cannot import frontend code: lowercase, NFKD, strip accents, collapse
 * non-alphanumerics to `-`, trim, 60 chars, fallback `workspace`.
 */
export function slugifyWorkspace(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return slug || "workspace"
}

function payloadText(notification: Notification, key: string): string | null {
  const value = notification.payload[key]
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/** Actor display line: known display name first, then actor-kind fallbacks. */
function actorLabel(notification: Notification): string {
  const name = payloadText(notification, "actorName")
  if (name) return name
  if (notification.actorType === "github") return "GitHub"
  if (notification.actorType === "system") return "System"
  if (notification.actorType === "agent") return "Agent"
  return notification.actorId ?? "Someone"
}

/** Human phrase for one Notification type; unknown types stay readable. */
function actionLabel(notification: Notification): string {
  switch (notification.type) {
    case "issue.assigned":
      return "assigned you"
    case "issue.unassigned":
      return "unassigned you"
    case "issue.status_changed":
      return "changed the status"
    case "comment.mention":
      return "mentioned you"
    case "comment.created":
      return "commented"
    default:
      return notification.type
  }
}

interface IssueGroup {
  issueId: string
  identifier: string
  title: string
  workspaceId: string | null
  notifications: Notification[]
}

/** Group one user's rows by issue, keeping the store's oldest-first order. */
function groupByIssue(notifications: Notification[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>()
  for (const notification of notifications) {
    const existing = groups.get(notification.issueId)
    if (existing) {
      existing.notifications.push(notification)
      continue
    }
    groups.set(notification.issueId, {
      issueId: notification.issueId,
      identifier:
        payloadText(notification, "issueIdentifier") ?? notification.issueId,
      title: payloadText(notification, "issueTitle") ?? "",
      workspaceId: payloadText(notification, "workspaceId"),
      notifications: [notification],
    })
  }
  return [...groups.values()]
}

/**
 * Build the issue link from the workspace name's slug. Unknown or missing
 * workspace ids fall back to the frontend root, matching the frontend's
 * tolerated deep links.
 */
async function issueLink(
  store: WorkspaceStore,
  issue: IssueGroup,
  frontendUrl: string,
  slugs: Map<string, Promise<string | null>>
): Promise<string> {
  if (!issue.workspaceId) return frontendUrl
  let slug = slugs.get(issue.workspaceId)
  if (!slug) {
    slug = store
      .getWorkspace(issue.workspaceId)
      .then((workspace) =>
        workspace ? slugifyWorkspace(workspace.name) : null
      )
    slugs.set(issue.workspaceId, slug)
  }
  const resolved = await slug
  if (!resolved) return frontendUrl
  return `${frontendUrl}/${resolved}/issue/${issue.identifier}`
}

export interface DigestJobDeps {
  store: WorkspaceStore
  mailer: Mailer | null
  /** Clock override for tests; defaults to the real time. */
  now?: Date
  /** Frontend origin used for issue and settings links. */
  frontendUrl?: string
}

/**
 * One digest pass: purge stale read rows, mail every eligible user a single
 * plain-text summary group, and stamp only the rows that email covered. A
 * failed send for one user never aborts the others.
 */
export async function runDigestJob({
  store,
  mailer,
  now = new Date(),
  frontendUrl = DEFAULT_FRONTEND_URL,
}: DigestJobDeps): Promise<{ users: number; notifications: number }> {
  const origin = normalizeOrigin(
    frontendUrl.trim() !== "" ? frontendUrl.trim() : DEFAULT_FRONTEND_URL
  )

  // Retention runs even when mail is disabled: the inbox stays bounded.
  const purgeCutoff = new Date(now.getTime() - PURGE_AFTER_MS).toISOString()
  await store.purgeReadNotifications(purgeCutoff)

  if (!mailer) return { users: 0, notifications: 0 }

  const cutoff = new Date(now.getTime() - DIGEST_WINDOW_MS).toISOString()
  const groups = await store.listDigestGroups(cutoff)
  const slugs = new Map<string, Promise<string | null>>()
  let users = 0
  let notifications = 0

  for (const group of groups) {
    // Never send an empty digest, even if a store returns a blank group.
    if (group.notifications.length === 0) continue

    const issues = groupByIssue(group.notifications)
    const lines: string[] = []
    for (const issue of issues) {
      const link = await issueLink(store, issue, origin, slugs)
      lines.push(`${issue.identifier} ${issue.title}`.trim())
      for (const notification of issue.notifications) {
        lines.push(`- ${actorLabel(notification)} ${actionLabel(notification)}`)
      }
      lines.push(link)
      lines.push("")
    }
    lines.push(`Manage notification settings or unsubscribe: ${origin}`)

    const count = group.notifications.length
    const subject = `zConnect digest: ${count} ${
      count === 1 ? "update" : "updates"
    }`

    try {
      await mailer.send({ to: group.email, subject, text: lines.join("\n") })
    } catch (error) {
      // One bad mailbox must not starve everyone else's digest.
      console.error(`[digest] failed to send to ${group.email}:`, error)
      continue
    }

    const ids = group.notifications.map((notification) => notification.id)
    await store.markNotificationsEmailed(ids, now.toISOString())
    users += 1
    notifications += ids.length
  }

  return { users, notifications }
}
