import { Hono } from "hono"
import { z } from "zod"
import type { GetSession } from "../workspaces/session.js"
import {
  PRIORITIES,
  type Priority,
  type WorkspaceStore,
} from "../workspaces/store.js"
import type { TokenStore, WorkspaceToken } from "./tokens.js"

const createTokenBody = z.object({ name: z.string().trim().min(1).max(64) })

const rpcEnvelope = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.unknown(),
  method: z.string(),
  params: z.unknown().optional(),
})

const getIssueParams = z.object({ ref: z.string().trim().min(1) })

const createIssueParams = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  statusId: z.string().trim().min(1),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
})

const updateIssueParams = z
  .object({
    ref: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    statusId: z.string().trim().min(1).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(),
    dueDate: z.string().trim().min(1).nullable().optional(),
    archived: z.boolean().optional(),
    labels: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    projectId: z.string().trim().min(1).optional(),
  })
  .refine(
    (body) => {
      const { ref: _ref, ...patch } = body
      return Object.values(patch).some((v) => v !== undefined)
    },
    { message: "Nothing to update" }
  )

const listIssuesParams = z.object({
  projectId: z.string().trim().min(1),
  statusIds: z.array(z.string().trim().min(1)).optional(),
  priorities: z.array(z.string()).optional(),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  archived: z.boolean().optional(),
  text: z.string().optional(),
})

const DATA_TOOLS = [
  {
    name: "issue.list",
    description: "List issues in a project with the shared issue filters.",
  },
  {
    name: "issue.get",
    description: "Resolve one issue by human identifier (WEB-123) or row id.",
  },
  {
    name: "issue.create",
    description: "Create an issue in a project (Member-level write).",
  },
  {
    name: "issue.update",
    description: "Update an issue by human identifier or row id.",
  },
  {
    name: "project.list",
    description: "List projects in the token workspace.",
  },
] as const

export interface McpDeps {
  store: WorkspaceStore
  tokens: TokenStore
  getSession: GetSession
}

/**
 * Workspace token issuance (session-authenticated, Owner/Admin only, mirroring
 * the invite guards) plus the Streamable HTTP MCP route below.
 */
export function createMcpApp({ store, tokens, getSession }: McpDeps) {
  const app = new Hono()

  app.post("/api/workspaces/:id/tokens", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = createTokenBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid token" }, 400)
    const { record, plaintext } = await tokens.createToken({
      workspaceId,
      name: parsed.data.name,
      createdBy: session.user.id,
    })
    return c.json({ ...record, token: plaintext }, 201)
  })

  app.get("/api/workspaces/:id/tokens", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    return c.json(await tokens.listTokens(workspaceId))
  })

  app.delete("/api/workspaces/:id/tokens/:tokenId", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const [token] = (await tokens.listTokens(workspaceId)).filter(
      (t) => t.id === c.req.param("tokenId")
    )
    if (!token) return c.json({ error: "Not found" }, 404)
    await tokens.revokeToken(token.id)
    return new Response(null, { status: 204 })
  })

  app.get("/api/mcp", (c) => c.json({ error: "Method Not Allowed" }, 405))

  /**
   * Streamable HTTP MCP route (hand-rolled JSON-RPC dispatcher, no extra
   * dependencies): the JSON-RPC method name IS the tool name, so the surface
   * is exactly the five MVP tools plus tools/list. Bearer workspace token
   * auth grants Member-level access scoped to the token workspace; every
   * failure mirrors its REST counterpart status with a REST-shaped
   * `{ error }` body, while success wraps the REST-shaped payload in
   * `{ jsonrpc, id, result }`.
   */
  app.post("/api/mcp", async (c) => {
    const match = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")
    const resolved = match ? await tokens.resolveToken(match[1]) : null
    if (!resolved) return c.json({ error: "Unauthorized" }, 401)
    const parsed = rpcEnvelope.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)
    const { id, method, params } = parsed.data
    if (method === "tools/list") {
      return c.json({ jsonrpc: "2.0", id, result: { tools: DATA_TOOLS } })
    }
    const outcome = await dispatchTool(store, method, params ?? {}, resolved)
    if ("error" in outcome)
      return c.json({ error: outcome.error }, outcome.status)
    return c.json(
      { jsonrpc: "2.0", id, result: outcome.result },
      outcome.status
    )
  })

  return app
}

type ToolError = { status: 400 | 403 | 404; error: string }
type ToolResult = { status: 200 | 201; result: unknown }

function isInvalid(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "invalid"
  )
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "not_found"
  )
}

/**
 * Thin wrappers over the SAME store queries the REST routes use, with the
 * SAME permission rules: a workspace token acts as a Member of its workspace
 * (read + issue write, no admin), and cross-workspace reads resolve to 403
 * exactly like the REST `readableProject` guard.
 */
async function scopedProject(
  store: WorkspaceStore,
  token: WorkspaceToken,
  projectId: string
): Promise<
  { id: string; workspaceId: string; name: string; key: string } | ToolError
> {
  const project = await store.getProject(projectId)
  if (!project) return { status: 404, error: "Not found" }
  if (project.workspaceId !== token.workspaceId) {
    return { status: 403, error: "Forbidden" }
  }
  return project
}

async function dispatchTool(
  store: WorkspaceStore,
  method: string,
  params: unknown,
  token: WorkspaceToken
): Promise<ToolResult | ToolError> {
  if (method === "project.list") {
    return { status: 200, result: await store.listProjects(token.workspaceId) }
  }

  if (method === "issue.list") {
    const parsed = listIssuesParams.safeParse(params)
    if (!parsed.success) return { status: 400, error: "Invalid params" }
    const scoped = await scopedProject(store, token, parsed.data.projectId)
    if ("error" in scoped) return scoped
    const priorities = (parsed.data.priorities ?? []).filter((p) =>
      (PRIORITIES as readonly string[]).includes(p)
    ) as Priority[]
    return {
      status: 200,
      result: await store.listIssues(scoped.id, {
        statusIds: parsed.data.statusIds,
        priorities,
        ...(parsed.data.assigneeId !== undefined
          ? { assigneeId: parsed.data.assigneeId }
          : {}),
        labels: parsed.data.labels,
        archived: parsed.data.archived,
        text: parsed.data.text,
      }),
    }
  }

  if (method === "issue.get") {
    const parsed = getIssueParams.safeParse(params)
    if (!parsed.success) return { status: 400, error: "Invalid params" }
    const issue = await store.getIssue(parsed.data.ref)
    if (!issue) return { status: 404, error: "Not found" }
    const project = await store.getProject(issue.projectId)
    if (!project || project.workspaceId !== token.workspaceId) {
      return { status: 403, error: "Forbidden" }
    }
    return { status: 200, result: issue }
  }

  if (method === "issue.create") {
    const parsed = createIssueParams.safeParse(params)
    if (!parsed.success) return { status: 400, error: "Invalid params" }
    const scoped = await scopedProject(store, token, parsed.data.projectId)
    if ("error" in scoped) return scoped
    const { projectId: _projectId, ...input } = parsed.data
    try {
      return {
        status: 201,
        result: await store.createIssue(scoped.id, input),
      }
    } catch (error) {
      if (isInvalid(error))
        return { status: 400, error: (error as Error).message }
      if (isNotFound(error)) return { status: 404, error: "Not found" }
      throw error
    }
  }

  if (method === "issue.update") {
    const parsed = updateIssueParams.safeParse(params)
    if (!parsed.success) return { status: 400, error: "Invalid params" }
    const issue = await store.getIssue(parsed.data.ref)
    if (!issue) return { status: 404, error: "Not found" }
    const project = await store.getProject(issue.projectId)
    if (!project || project.workspaceId !== token.workspaceId) {
      return { status: 403, error: "Forbidden" }
    }
    if (
      parsed.data.projectId !== undefined &&
      !(await store.getProject(parsed.data.projectId))
    ) {
      return { status: 404, error: "Not found" }
    }
    const { ref: _ref, ...input } = parsed.data
    try {
      return { status: 200, result: await store.updateIssue(issue.id, input) }
    } catch (error) {
      if (isInvalid(error))
        return { status: 400, error: (error as Error).message }
      if (isNotFound(error)) return { status: 404, error: "Not found" }
      throw error
    }
  }

  return { status: 404, error: "Unknown method" }
}
