/**
 * Notification fan-out (R2): turns a comment or issue mutation into in-app
 * Notification rows and, per the recipient's email mode, immediate mail.
 *
 * This module is the only place the precedence rules live: mention > reply >
 * watcher for comments, and assignee/status rules for issue updates. It never
 * writes Activity Events (the store owns that) and never duplicates a user for
 * one event.
 */
import type { Mailer } from "../lib/mailer.js"
import type {
  Actor,
  Comment,
  EmailMode,
  Issue,
  Membership,
  Notification,
  UpdateIssueInput,
  Workspace,
  WorkspaceStore,
} from "./store.js"

export interface NotifyDeps {
  store: WorkspaceStore
  mailer?: Mailer | null
  frontendUrl?: string
}

const DEFAULT_FRONTEND_URL = "http://localhost:5173"

/** Notification types that digest mode still mails immediately. */
const DIGEST_IMMEDIATE_TYPES = new Set(["comment.mention", "issue.assigned"])

/** Excerpt is display-only; the comment body is never copied into a payload. */
const EXCERPT_MAX = 140

/** Markdown mention links: `[@Display Name](mention:<userId>)`, `@` optional. */
const MENTION_PATTERN = /@?\[([^\]]+)\]\(mention:([^)\s]+)\)/g

interface FanOutContext {
  workspace: Workspace
  members: Membership[]
  actorName: string
  /** Fields every notification payload carries. */
  payload: Record<string, unknown>
}

interface Delivery {
  userId: string
  type: string
  payload: Record<string, unknown>
}

/** Mention targets in body order, deduped by user id. */
export function parseMentions(body: string): string[] {
  const ids = new Set<string>()
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const id = match[2]?.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

/** Strip a trailing slash so link paths never double up. */
function normalizeOrigin(origin: string | undefined): string {
  const trimmed = origin?.trim()
  if (!trimmed) return DEFAULT_FRONTEND_URL
  return trimmed.replace(/\/+$/, "")
}

/**
 * The frontend's `slugifyWorkspace` rule, duplicated because backend mail
 * cannot import frontend code: lowercase, NFKD, strip accents, collapse
 * non-alphanumerics to `-`, trim, 60 chars, fallback `workspace`.
 */
function slugifyWorkspace(name: string): string {
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

function actorNameFor(actor: Actor, members: Membership[]): string {
  const memberName = members
    .find((member) => member.userId === actor.id)
    ?.name?.trim()
  if (memberName) return memberName
  const explicitName = actor.name?.trim()
  if (explicitName) return explicitName
  return actor.id ?? "System"
}

/** Whitespace-collapsed body preview, capped at the contract's 140 chars. */
function excerptOf(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, EXCERPT_MAX)
}

/** Resolve the project workspace and the identity data fan-out needs. */
async function fanOutContext(
  store: WorkspaceStore,
  issue: Issue,
  actor: Actor
): Promise<FanOutContext | null> {
  const project = await store.getProject(issue.projectId)
  if (!project) return null
  const workspace = await store.getWorkspace(project.workspaceId)
  if (!workspace) return null
  const members = await store.listMembers(workspace.id)
  const actorName = actorNameFor(actor, members)
  return {
    workspace,
    members,
    actorName,
    payload: {
      issueIdentifier: issue.identifier,
      issueTitle: issue.title,
      workspaceId: workspace.id,
      actorName,
    },
  }
}

function actionLabel(type: string): string {
  switch (type) {
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
      return type
  }
}

function mailMessage(
  notification: Notification,
  issue: Issue,
  context: FanOutContext,
  origin: string
): { subject: string; text: string } {
  const identifier =
    typeof notification.payload.issueIdentifier === "string"
      ? notification.payload.issueIdentifier
      : issue.identifier
  const title =
    typeof notification.payload.issueTitle === "string"
      ? notification.payload.issueTitle
      : issue.title
  const link = `${origin}/${slugifyWorkspace(context.workspace.name)}/issue/${identifier}`
  const lines = [
    `${context.actorName} ${actionLabel(notification.type)} on ${identifier} ${title}.`,
    "",
    `Issue: ${identifier} ${title}`,
  ]
  const excerpt = notification.payload.excerpt
  if (typeof excerpt === "string" && excerpt !== "") {
    lines.push(`"${excerpt}"`)
  }
  lines.push("", link, "", `Manage notification settings: ${origin}`)
  return { subject: `[${identifier}] ${title}`, text: lines.join("\n") }
}

/**
 * Create the in-app rows first — they are the source of truth and are never
 * suppressed by an email mode — then deliver whichever rows this mode sends
 * now. A failed send is logged and leaves `emailedAt` null so the digest job
 * can retry the row.
 */
async function deliver(
  deps: NotifyDeps,
  issue: Issue,
  actor: Actor,
  context: FanOutContext,
  deliveries: Delivery[]
): Promise<Notification[]> {
  const created: Notification[] = []
  for (const delivery of deliveries) {
    const notification = await deps.store.createNotification({
      userId: delivery.userId,
      issueId: issue.id,
      type: delivery.type,
      actorType: actor.type,
      actorId: actor.id,
      payload: delivery.payload,
    })
    created.push(notification)
  }

  const mailer = deps.mailer
  if (!mailer || created.length === 0) return created

  const origin = normalizeOrigin(deps.frontendUrl)
  const modes = new Map<string, EmailMode>()
  for (const notification of created) {
    let mode = modes.get(notification.userId)
    if (!mode) {
      mode = (await deps.store.getNotificationSettings(notification.userId))
        .emailMode
      modes.set(notification.userId, mode)
    }
    if (mode === "off") continue
    if (mode === "digest" && !DIGEST_IMMEDIATE_TYPES.has(notification.type)) {
      continue
    }
    const recipient = context.members
      .find((member) => member.userId === notification.userId)
      ?.email?.trim()
    if (!recipient) continue
    try {
      await mailer.send({
        to: recipient,
        ...mailMessage(notification, issue, context, origin),
      })
      await deps.store.markNotificationsEmailed(
        [notification.id],
        new Date().toISOString()
      )
    } catch (error) {
      // Delivery is best-effort: the in-app row already exists and the HTTP
      // mutation that caused it must still succeed.
      console.error(
        `[notify] failed to send ${notification.type} notification ${notification.id}:`,
        error instanceof Error ? error.message : error
      )
    }
  }
  return created
}

/**
 * Comment fan-out: eligible mentions, then the reply parent author, then the
 * issue watchers. Each user appears at most once, at the highest precedence.
 * The author is never notified of their own comment.
 */
export async function notifyCommentCreated(
  deps: NotifyDeps,
  input: {
    actor: Actor
    issue: Issue
    comment: Comment
    parent: Comment | null
  }
): Promise<Notification[]> {
  const { store } = deps
  const context = await fanOutContext(store, input.issue, input.actor)
  if (!context) return []

  const actorId = input.actor.id
  const commentPayload: Record<string, unknown> = {
    ...context.payload,
    commentId: input.comment.id,
    parentId: input.comment.parentId,
    excerpt: excerptOf(input.comment.body),
  }
  if (input.comment.parentId !== null) {
    commentPayload.replyToCommentId = input.comment.parentId
  }

  const recipients = new Set<string>()
  const deliveries: Delivery[] = []

  for (const userId of parseMentions(input.comment.body)) {
    if (userId === actorId || recipients.has(userId)) continue
    // A Viewer grant is not a workspace membership, so it is not mentionable.
    if (!(await store.getMembership(context.workspace.id, userId))) continue
    await store.addWatcher(input.issue.id, userId)
    recipients.add(userId)
    deliveries.push({
      userId,
      type: "comment.mention",
      payload: commentPayload,
    })
  }

  const parent = input.parent
  if (
    parent !== null &&
    parent.authorId !== actorId &&
    !recipients.has(parent.authorId)
  ) {
    recipients.add(parent.authorId)
    deliveries.push({
      userId: parent.authorId,
      type: "comment.created",
      payload: commentPayload,
    })
  }

  // Mentions were auto-watched above; the recipient set keeps them at one row.
  for (const userId of await store.listWatcherIds(input.issue.id)) {
    if (userId === actorId || recipients.has(userId)) continue
    recipients.add(userId)
    deliveries.push({
      userId,
      type: "comment.created",
      payload: commentPayload,
    })
  }

  return deliver(deps, input.issue, input.actor, context, deliveries)
}

/**
 * Issue-update fan-out: assignment notifies the new and old assignee (and
 * auto-watches the new one), status changes notify watchers, and every other
 * field stays silent. Unassignment never removes a watcher.
 */
export async function notifyIssueUpdated(
  deps: NotifyDeps,
  input: {
    actor: Actor
    before: Issue
    after: Issue
    input: UpdateIssueInput
  }
): Promise<Notification[]> {
  const { store } = deps
  const { actor, before, after } = input
  const context = await fanOutContext(store, after, actor)
  if (!context) return []

  const deliveries: Delivery[] = []

  if (
    input.input.assigneeId !== undefined &&
    before.assigneeId !== after.assigneeId
  ) {
    const from = before.assigneeId
    const to = after.assigneeId
    if (to !== null) await store.addWatcher(after.id, to)
    const assignmentPayload = { ...context.payload, from, to }
    if (to !== null && to !== actor.id) {
      deliveries.push({
        userId: to,
        type: "issue.assigned",
        payload: assignmentPayload,
      })
    }
    if (from !== null && from !== actor.id) {
      deliveries.push({
        userId: from,
        type: "issue.unassigned",
        payload: assignmentPayload,
      })
    }
  }

  if (
    input.input.statusId !== undefined &&
    before.statusId !== after.statusId
  ) {
    const statusPayload = {
      ...context.payload,
      from: before.statusId,
      to: after.statusId,
    }
    for (const userId of await store.listWatcherIds(after.id)) {
      if (userId === actor.id) continue
      deliveries.push({
        userId,
        type: "issue.status_changed",
        payload: statusPayload,
      })
    }
  }

  return deliver(deps, after, actor, context, deliveries)
}
