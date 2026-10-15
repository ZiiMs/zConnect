import { Hono } from "hono"
import { z } from "zod"
import type { GetSession } from "./session.js"
import {
  PRIORITIES,
  type Priority,
  STATUS_CATEGORIES,
  WORKSPACE_ROLES,
  type WorkspaceStore,
} from "./store.js"

const createWorkspaceBody = z.object({ name: z.string().trim().min(1) })

const inviteBody = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(WORKSPACE_ROLES),
})

const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,15}$/)

const createProjectBody = z.object({
  name: z.string().trim().min(1),
  key: projectKeySchema,
})

const updateProjectBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    key: projectKeySchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.key !== undefined, {
    message: "Nothing to update",
  })

const grantViewerBody = z.object({ userId: z.string().trim().min(1) })

/** T5 workspace-shared Label registry: names unique per workspace. */
const labelColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const createLabelBody = z.object({
  name: z.string().trim().min(1).max(64),
  color: labelColorSchema.optional(),
})

const updateLabelBody = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    color: labelColorSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.color !== undefined, {
    message: "Nothing to update",
  })

const createStatusBody = z.object({
  name: z.string().trim().min(1),
  category: z.enum(STATUS_CATEGORIES),
})

const updateStatusBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.enum(STATUS_CATEGORIES).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.category !== undefined ||
      body.position !== undefined,
    { message: "Nothing to update" }
  )

const createIssueBody = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  statusId: z.string().trim().min(1),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
})

const updateIssueBody = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    statusId: z.string().trim().min(1).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(),
    dueDate: z.string().trim().min(1).nullable().optional(),
    archived: z.boolean().optional(),
    labels: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    projectId: z.string().trim().min(1).optional(),
    parentId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: "Nothing to update",
  })

function queryList(getAll: (name: string) => string[], name: string): string[] {
  return getAll(name)
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

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

function isLocked(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "locked"
  )
}

function isInvalid(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "invalid"
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

  async function readableProject(projectId: string, userId: string) {
    const project = await store.getProject(projectId)
    if (!project) return null
    const visible = await visibleWorkspace(project.workspaceId, userId)
    if (!visible) return null
    return project
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

  /**
   * T5 label registry. Reading needs any visible workspace membership
   * (viewers included); writes need a real membership (Owner/Admin/Member).
   */
  app.get("/api/workspaces/:id/labels", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const visible = await visibleWorkspace(c.req.param("id"), session.user.id)
    if (!visible) return c.json({ error: "Forbidden" }, 403)
    return c.json(await store.listLabels(visible.id))
  })

  app.post("/api/workspaces/:id/labels", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership) return c.json({ error: "Forbidden" }, 403)
    const parsed = createLabelBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid label" }, 400)
    try {
      const label = await store.createLabel(workspaceId, parsed.data)
      return c.json(label, 201)
    } catch (error) {
      if (isConflict(error)) return c.json({ error: "Label taken" }, 409)
      if (isInvalid(error))
        return c.json({ error: (error as Error).message }, 400)
      throw error
    }
  })

  async function workspaceLabel(workspaceId: string, labelId: string) {
    const labels = await store.listLabels(workspaceId)
    return labels.find((l) => l.id === labelId) ?? null
  }

  app.patch("/api/workspaces/:id/labels/:labelId", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership) return c.json({ error: "Forbidden" }, 403)
    const label = await workspaceLabel(workspaceId, c.req.param("labelId"))
    if (!label) return c.json({ error: "Not found" }, 404)
    const parsed = updateLabelBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid label" }, 400)
    try {
      return c.json(await store.updateLabel(label.id, parsed.data))
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      if (isConflict(error)) return c.json({ error: "Label taken" }, 409)
      if (isInvalid(error))
        return c.json({ error: (error as Error).message }, 400)
      throw error
    }
  })

  app.delete("/api/workspaces/:id/labels/:labelId", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership) return c.json({ error: "Forbidden" }, 403)
    const label = await workspaceLabel(workspaceId, c.req.param("labelId"))
    if (!label) return c.json({ error: "Not found" }, 404)
    try {
      await store.deleteLabel(label.id)
      return new Response(null, { status: 204 })
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
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

  app.get("/api/projects/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await readableProject(c.req.param("id"), session.user.id)
    if (!project) {
      const exists = await store.getProject(c.req.param("id"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(project)
  })

  app.get("/api/projects/:id/statuses", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await readableProject(c.req.param("id"), session.user.id)
    if (!project) {
      const exists = await store.getProject(c.req.param("id"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(await store.listStatuses(project.id))
  })

  app.patch("/api/projects/:id", async (c) => {
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
    const parsed = updateProjectBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid project" }, 400)
    try {
      return c.json(await store.updateProject(project.id, parsed.data))
    } catch (error) {
      if (isLocked(error))
        return c.json({ error: (error as Error).message }, 409)
      if (isConflict(error)) return c.json({ error: "Key taken" }, 409)
      throw error
    }
  })

  async function manageableProject(projectId: string, userId: string) {
    const project = await store.getProject(projectId)
    if (!project) return null
    const membership = await store.getMembership(project.workspaceId, userId)
    if (!membership || membership.role === "Member") return null
    return project
  }

  /** Any workspace membership (Owner/Admin/Member) may write issues. */
  async function writableProject(projectId: string, userId: string) {
    const project = await store.getProject(projectId)
    if (!project) return null
    const membership = await store.getMembership(project.workspaceId, userId)
    if (!membership) return null
    return project
  }

  app.post("/api/projects/:id/statuses", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await store.getProject(c.req.param("id"))
    if (!project) return c.json({ error: "Not found" }, 404)
    if (!(await manageableProject(project.id, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = createStatusBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid status" }, 400)
    try {
      const status = await store.createStatus(project.id, parsed.data)
      return c.json(status, 201)
    } catch (error) {
      if (isConflict(error)) return c.json({ error: "Status name taken" }, 409)
      throw error
    }
  })

  app.patch("/api/projects/:projectId/statuses/:statusId", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await manageableProject(
      c.req.param("projectId"),
      session.user.id
    )
    if (!project) {
      const exists = await store.getProject(c.req.param("projectId"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    const status = await store.getStatus(c.req.param("statusId"))
    if (!status || status.projectId !== project.id) {
      return c.json({ error: "Not found" }, 404)
    }
    const parsed = updateStatusBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid status" }, 400)
    try {
      return c.json(await store.updateStatus(status.id, parsed.data))
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      if (isConflict(error)) return c.json({ error: "Status name taken" }, 409)
      throw error
    }
  })

  app.delete("/api/projects/:projectId/statuses/:statusId", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await manageableProject(
      c.req.param("projectId"),
      session.user.id
    )
    if (!project) {
      const exists = await store.getProject(c.req.param("projectId"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    const status = await store.getStatus(c.req.param("statusId"))
    if (!status || status.projectId !== project.id) {
      return c.json({ error: "Not found" }, 404)
    }
    try {
      await store.deleteStatus(status.id)
      return new Response(null, { status: 204 })
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      if (isLocked(error))
        return c.json({ error: (error as Error).message }, 409)
      throw error
    }
  })

  app.post("/api/projects/:id/issues", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await store.getProject(c.req.param("id"))
    if (!project) return c.json({ error: "Not found" }, 404)
    if (!(await writableProject(project.id, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = createIssueBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid issue" }, 400)
    try {
      const issue = await store.createIssue(project.id, parsed.data)
      return c.json(issue, 201)
    } catch (error) {
      if (isInvalid(error))
        return c.json({ error: (error as Error).message }, 400)
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  app.get("/api/projects/:id/issues", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await readableProject(c.req.param("id"), session.user.id)
    if (!project) {
      const exists = await store.getProject(c.req.param("id"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    const getAll = (name: string) => c.req.queries(name) ?? []
    const assignee = c.req.query("assignee")
    const priorities = queryList(getAll, "priority").filter((p) =>
      (PRIORITIES as readonly string[]).includes(p)
    ) as Priority[]
    return c.json(
      await store.listIssues(project.id, {
        statusIds: queryList(getAll, "status"),
        priorities,
        ...(assignee !== undefined
          ? { assigneeId: assignee === "none" ? null : assignee }
          : {}),
        labels: queryList(getAll, "label"),
        archived: c.req.query("archived") === "true",
        text: c.req.query("q") ?? c.req.query("text"),
      })
    )
  })

  app.get("/api/issues/:key", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const issue = await store.getIssue(c.req.param("key"))
    if (!issue) return c.json({ error: "Not found" }, 404)
    const project = await readableProject(issue.projectId, session.user.id)
    if (!project) return c.json({ error: "Forbidden" }, 403)
    return c.json(issue)
  })

  app.get("/api/issues/:key/subtasks", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const issue = await store.getIssue(c.req.param("key"))
    if (!issue) return c.json({ error: "Not found" }, 404)
    const project = await readableProject(issue.projectId, session.user.id)
    if (!project) return c.json({ error: "Forbidden" }, 403)
    return c.json(await store.listSubtasks(issue.id))
  })

  /**
   * T5 hard delete: Owner/Admin of the owning workspace only. Archiving
   * (PATCH archived) stays the recoverable default; this is the permanent
   * escape hatch.
   */
  app.delete("/api/issues/:key", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const issue = await store.getIssue(c.req.param("key"))
    if (!issue) return c.json({ error: "Not found" }, 404)
    const project = await store.getProject(issue.projectId)
    if (!project) return c.json({ error: "Not found" }, 404)
    const membership = await store.getMembership(
      project.workspaceId,
      session.user.id
    )
    if (
      !membership ||
      (membership.role !== "Owner" && membership.role !== "Admin")
    ) {
      return c.json({ error: "Forbidden" }, 403)
    }
    try {
      await store.deleteIssue(issue.id)
      return new Response(null, { status: 204 })
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  app.patch("/api/issues/:key", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const issue = await store.getIssue(c.req.param("key"))
    if (!issue) return c.json({ error: "Not found" }, 404)
    if (!(await writableProject(issue.projectId, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = updateIssueBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid issue" }, 400)
    if (
      parsed.data.projectId !== undefined &&
      !(await store.getProject(parsed.data.projectId))
    ) {
      return c.json({ error: "Not found" }, 404)
    }
    try {
      const updated = await store.updateIssue(issue.id, parsed.data)
      return c.json({
        ...updated,
        warnings: await completionWarnings(updated, parsed.data.statusId),
      })
    } catch (error) {
      if (isInvalid(error))
        return c.json({ error: (error as Error).message }, 400)
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  /**
   * T5 gentle guardrail: completing means moving to a Done-category status.
   * A parent with open (non-archived, non-Done) subtasks still completes,
   * but the response carries warnings describing the open work.
   */
  async function completionWarnings(
    updated: { id: string; projectId: string },
    statusId: string | undefined
  ): Promise<string[]> {
    if (statusId === undefined) return []
    const target = await store.getStatus(statusId)
    if (target?.category !== "Done") return []
    const children = await store.listSubtasks(updated.id)
    if (children.length === 0) return []
    const byId = new Map(
      (await store.listStatuses(updated.projectId)).map((s) => [s.id, s])
    )
    const open = children.filter(
      (child) =>
        !child.archived && byId.get(child.statusId)?.category !== "Done"
    )
    if (open.length === 0) return []
    const noun = open.length === 1 ? "subtask" : "subtasks"
    return [
      `Completing with ${open.length} open ${noun}: ${open.map((child) => child.identifier).join(", ")}`,
    ]
  }

  return app
}

export { WORKSPACE_ROLES }
