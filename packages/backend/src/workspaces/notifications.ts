import { type Context, Hono } from "hono"
import { z } from "zod"
import type { Mailer } from "../lib/mailer.js"
import type { GetSession } from "./session.js"
import type {
  Issue,
  Membership,
  MyIssue,
  Notification,
  Project,
  Status,
  Workspace,
  WorkspaceStore,
} from "./store.js"

const MY_ISSUE_TABS = ["assigned", "created", "watched"] as const

type MyIssueTab = (typeof MY_ISSUE_TABS)[number]

const notificationSettingsBody = z.object({
  emailMode: z.enum(["immediate", "digest", "off"]),
})

export interface NotificationsDeps {
  store: WorkspaceStore
  getSession: GetSession
  /**
   * Accepted for parity with the comment routes that mount beside this app;
   * notification reads and settings changes never send mail directly.
   */
  mailer?: Mailer | null
  frontendUrl?: string
}

function authRequired(c: Context) {
  return c.json({ error: "Unauthorized" }, 401)
}

/** Empty or non-numeric query params fall through to the store's clamp. */
function optionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined
  const value = Number(raw)
  return Number.isNaN(value) ? undefined : value
}

function optionalCursor(raw: string | undefined): string | undefined {
  return raw === undefined || raw === "" ? undefined : raw
}

function loadCached<K, V>(
  cache: Map<K, Promise<V>>,
  key: K,
  load: () => Promise<V>
): Promise<V> {
  const existing = cache.get(key)
  if (existing) return existing
  const pending = load()
  cache.set(key, pending)
  return pending
}

/**
 * Fill `payload.actorName` for older rows or stores that cannot join the auth
 * user at write time. Best effort: a missing membership leaves the payload
 * untouched and the client falls back to `actorId`.
 */
async function enrichActorNames(
  store: WorkspaceStore,
  notifications: Notification[]
): Promise<Notification[]> {
  const rosters = new Map<string, Promise<Membership[]>>()
  return Promise.all(
    notifications.map(async (notification) => {
      const existing = notification.payload.actorName
      if (typeof existing === "string" && existing.trim() !== "") {
        return notification
      }
      const workspaceId = notification.payload.workspaceId
      if (typeof workspaceId !== "string" || notification.actorId === null) {
        return notification
      }
      const roster = loadCached(rosters, workspaceId, () =>
        store.listMembers(workspaceId)
      )
      const actor = (await roster).find(
        (member) => member.userId === notification.actorId
      )
      const name = actor?.name?.trim()
      if (!name) return notification
      return {
        ...notification,
        payload: { ...notification.payload, actorName: name },
      }
    })
  )
}

/**
 * Join each cross-project Issue row with the project, workspace, and status
 * labels the My Issues list renders. Lookups are cached per project and
 * workspace so one page is a small constant number of store reads.
 */
async function enrichMyIssues(
  store: WorkspaceStore,
  issues: Issue[]
): Promise<MyIssue[]> {
  const projects = new Map<string, Promise<Project | null>>()
  const workspaces = new Map<string, Promise<Workspace | null>>()
  const statuses = new Map<string, Promise<Status | null>>()
  const rows: MyIssue[] = []

  for (const issue of issues) {
    const project = await loadCached(projects, issue.projectId, () =>
      store.getProject(issue.projectId)
    )
    if (!project) continue
    const workspace = await loadCached(workspaces, project.workspaceId, () =>
      store.getWorkspace(project.workspaceId)
    )
    if (!workspace) continue
    const status = await loadCached(statuses, issue.statusId, () =>
      store.getStatus(issue.statusId)
    )
    if (!status) continue
    rows.push({
      ...issue,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      projectName: project.name,
      projectKey: project.key,
      projectIcon: project.icon,
      projectColor: project.color,
      statusName: status.name,
      statusCategory: status.category,
      statusColor: status.color,
    })
  }

  return rows
}

/**
 * Notification Inbox, My Issues, and notification-settings HTTP boundary.
 * Every route is session-scoped and resolves the acting user from the
 * session; no route accepts a user id from the client.
 */
export function createNotificationsApp({
  store,
  getSession,
}: NotificationsDeps) {
  const app = new Hono()

  app.get("/api/notifications", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    const filter = c.req.query("filter") === "unread" ? "unread" : "all"
    const [page, unreadCount] = await Promise.all([
      store.listNotifications(session.user.id, {
        filter,
        limit: optionalNumber(c.req.query("limit")),
        before: optionalCursor(c.req.query("before")),
      }),
      store.unreadNotificationCount(session.user.id),
    ])
    return c.json({
      notifications: await enrichActorNames(store, page.notifications),
      nextCursor: page.nextCursor,
      unreadCount,
    })
  })

  app.post("/api/notifications/:id/read", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    const notification = await store.markNotificationRead(
      c.req.param("id"),
      session.user.id
    )
    // A row owned by another user is indistinguishable from a missing row.
    if (!notification) return c.json({ error: "Not found" }, 404)
    return c.json(notification)
  })

  app.post("/api/notifications/read-all", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    const updated = await store.markAllNotificationsRead(session.user.id)
    return c.json({ updated })
  })

  app.get("/api/notifications/unread-count", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    return c.json({
      count: await store.unreadNotificationCount(session.user.id),
    })
  })

  app.get("/api/me/issues", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    const tab = (c.req.query("tab") ?? "assigned") as MyIssueTab
    if (!MY_ISSUE_TABS.includes(tab)) {
      return c.json({ error: "Invalid tab" }, 400)
    }
    const issues = await store.listMyIssues(session.user.id, tab)
    return c.json(await enrichMyIssues(store, issues))
  })

  app.get("/api/me/notification-settings", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    const settings = await store.getNotificationSettings(session.user.id)
    return c.json({ emailMode: settings.emailMode })
  })

  app.patch("/api/me/notification-settings", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return authRequired(c)
    const parsed = notificationSettingsBody.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: "Invalid notification settings" }, 400)
    }
    const settings = await store.setNotificationSettings(
      session.user.id,
      parsed.data.emailMode
    )
    return c.json({ emailMode: settings.emailMode })
  })

  return app
}
