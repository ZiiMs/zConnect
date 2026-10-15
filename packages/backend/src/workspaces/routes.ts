import { Hono } from "hono"
import { z } from "zod"
import type { GetSession } from "./session.js"
import { WORKSPACE_ROLES, type WorkspaceStore } from "./store.js"

const createWorkspaceBody = z.object({ name: z.string().trim().min(1) })

const inviteBody = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(WORKSPACE_ROLES),
})

const createProjectBody = z.object({
  name: z.string().trim().min(1),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,15}$/),
})

const grantViewerBody = z.object({ userId: z.string().trim().min(1) })

function isConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "conflict"
  )
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "not_found"
  )
}

export interface WorkspacesDeps {
  store: WorkspaceStore
  getSession: GetSession
}

/**
 * Workspace + membership HTTP boundary. Tested at the Hono app-object seam
 * via `app.request(...)`: tests assert status codes and response shapes,
 * never SQL or store internals.
 */
export function createWorkspacesApp({ store, getSession }: WorkspacesDeps) {
  const app = new Hono()

  app.get("/api/workspaces", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    return c.json(await store.listWorkspacesForUser(session.user.id))
  })

  app.post("/api/workspaces", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const parsed = createWorkspaceBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid name" }, 400)
    const workspace = await store.createWorkspace(
      session.user.id,
      parsed.data.name
    )
    return c.json({ ...workspace, role: "Owner" }, 201)
  })

  app.get("/api/workspaces/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const visible = await visibleWorkspace(c.req.param("id"), session.user.id)
    if (!visible) return c.json({ error: "Forbidden" }, 403)
    return c.json(visible)
  })

  app.get("/api/workspaces/:id/members", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const visible = await visibleWorkspace(c.req.param("id"), session.user.id)
    if (!visible) return c.json({ error: "Forbidden" }, 403)
    return c.json(await store.listMembers(visible.id))
  })

  app.post("/api/workspaces/:id/invites", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = inviteBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid invite" }, 400)
    try {
      const invitation = await store.createInvitation({
        workspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        invitedBy: session.user.id,
      })
      return c.json(invitation, 201)
    } catch (error) {
      if (isConflict(error)) return c.json({ error: "Already invited" }, 409)
      throw error
    }
  })

  app.get("/api/invitations", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    return c.json(await store.listInvitationsForEmail(session.user.email))
  })

  app.post("/api/invitations/:id/accept", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const pending = (
      await store.listInvitationsForEmail(session.user.email)
    ).find((i) => i.id === c.req.param("id"))
    if (!pending) return c.json({ error: "Forbidden" }, 403)
    try {
      const membership = await store.acceptInvitation(
        pending.id,
        session.user.id
      )
      return c.json(membership)
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  async function visibleWorkspace(workspaceId: string, userId: string) {
    const mine = await store.listWorkspacesForUser(userId)
    return mine.find((w) => w.id === workspaceId) ?? null
  }

  app.get("/api/workspaces/:id/projects", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const visible = await visibleWorkspace(c.req.param("id"), session.user.id)
    if (!visible) return c.json({ error: "Forbidden" }, 403)
    return c.json(await store.listProjects(visible.id))
  })

  app.post("/api/workspaces/:id/projects", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = createProjectBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid project" }, 400)
    try {
      const project = await store.createProject(workspaceId, parsed.data)
      return c.json(project, 201)
    } catch (error) {
      if (isConflict(error)) return c.json({ error: "Key taken" }, 409)
      throw error
    }
  })

  app.post("/api/projects/:id/viewers", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await store.getProject(c.req.param("id"))
    if (!project) return c.json({ error: "Not found" }, 404)
    const membership = await store.getMembership(
      project.workspaceId,
      session.user.id
    )
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = grantViewerBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid viewer" }, 400)
    await store.addProjectViewer(project.id, parsed.data.userId)
    return c.json({ projectId: project.id, userId: parsed.data.userId }, 201)
  })

  return app
}

export { WORKSPACE_ROLES }
