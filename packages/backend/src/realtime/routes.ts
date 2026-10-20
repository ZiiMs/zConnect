import { Hono } from "hono"
import { z } from "zod"
import { readableIssue, readableProject } from "../workspaces/permissions.js"
import type { GetSession } from "../workspaces/session.js"
import {
  PRIORITIES,
  type Priority,
  type WorkspaceStore,
} from "../workspaces/store.js"
import {
  issueQuery,
  issuesQuery,
  notificationsQuery,
  timelineQuery,
  unreadCountQuery,
} from "./queries.js"
import type { RealtimeSealer } from "./service.js"

const idSchema = z.string().trim().min(1).max(100)

const filtersSchema = z
  .object({
    statusIds: z.array(idSchema).max(100).optional(),
    priorities: z.array(z.string().max(20)).max(20).optional(),
    assigneeId: idSchema.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    text: z.string().max(200).optional(),
  })
  .strict()

const projectIssuesBody = z
  .object({ projectId: idSchema, filters: filtersSchema.optional() })
  .strict()

const issueBody = z.object({ ref: idSchema }).strict()

const timelineBody = z
  .object({ ref: idSchema, limit: z.number().int().min(1).max(100).optional() })
  .strict()

const notificationsBody = z
  .object({ limit: z.number().int().min(1).max(100).optional() })
  .strict()

const emptyBody = z.object({}).strict()

export interface RealtimeDeps {
  store: WorkspaceStore
  getSession: GetSession
  /** `null` when the branch has no Realtime secret configured. */
  sealer: RealtimeSealer | null
}

function notConfigured() {
  return { error: "Realtime is not configured" } as const
}

/**
 * Sealed live queries for the collaboration surfaces. Every route authenticates
 * the request, authorizes the exact scope, and only then seals a query whose
 * parameters already contain the signed-in user's id. The client can subscribe
 * but cannot read or change the SQL, the parameters, or the authorization.
 */
export function createRealtimeApp({ store, getSession, sealer }: RealtimeDeps) {
  const app = new Hono()

  app.post("/api/realtime/queries/project-issues", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const parsed = projectIssuesBody.safeParse(
      await c.req.json().catch(() => null)
    )
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)
    if (!sealer) return c.json(notConfigured(), 503)

    const project = await readableProject(
      store,
      parsed.data.projectId,
      session.user.id
    )
    if (!project) {
      const exists = await store.getProject(parsed.data.projectId)
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }

    const filters = parsed.data.filters ?? {}
    const priorities = filters.priorities?.filter((priority): priority is Priority =>
      (PRIORITIES as readonly string[]).includes(priority)
    )
    return c.json(
      await sealer.seal(
        issuesQuery(session.user.id, project.id, {
          ...filters,
          priorities,
        })
      )
    )
  })

  app.post("/api/realtime/queries/issue", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const parsed = issueBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)
    if (!sealer) return c.json(notConfigured(), 503)

    const access = await readableIssue(store, parsed.data.ref, session.user.id)
    if (!access) {
      const exists = await store.getIssue(parsed.data.ref)
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(
      await sealer.seal(issueQuery(session.user.id, access.issue.id))
    )
  })

  app.post("/api/realtime/queries/timeline", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const parsed = timelineBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)
    if (!sealer) return c.json(notConfigured(), 503)

    const access = await readableIssue(store, parsed.data.ref, session.user.id)
    if (!access) {
      const exists = await store.getIssue(parsed.data.ref)
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(
      await sealer.seal(
        timelineQuery(session.user.id, access.issue.id, parsed.data.limit ?? 50)
      )
    )
  })

  app.post("/api/realtime/queries/notifications", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const parsed = notificationsBody.safeParse(
      await c.req.json().catch(() => null)
    )
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)
    if (!sealer) return c.json(notConfigured(), 503)

    return c.json(
      await sealer.seal(
        notificationsQuery(session.user.id, parsed.data.limit ?? 100)
      )
    )
  })

  app.post("/api/realtime/queries/unread-count", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const parsed = emptyBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)
    if (!sealer) return c.json(notConfigured(), 503)

    return c.json(await sealer.seal(unreadCountQuery(session.user.id)))
  })

  return app
}
