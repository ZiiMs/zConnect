import { Hono } from "hono"
import { z } from "zod"
import type { Mailer } from "../lib/mailer.js"
import { notifyCommentCreated } from "./notify.js"
import { membershipOf, readableIssue, writableIssue } from "./permissions.js"
import type { GetSession } from "./session.js"
import type { Issue, Project, WorkspaceStore } from "./store.js"

/** Comment bodies are markdown; cap them so one row cannot grow unbounded. */
const COMMENT_BODY_MAX = 10_000

const commentBody = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
  parentId: z.string().trim().min(1).nullable().optional(),
})

const editCommentBody = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
})

export interface CommentsDeps {
  store: WorkspaceStore
  getSession: GetSession
  /** Optional outbound mail for notification fan-out. */
  mailer?: Mailer | null
  /** Origin used for issue links in notification mail. */
  frontendUrl?: string
}

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

type IssueAccess =
  | { ok: true; issue: Issue; project: Project }
  | { ok: false; status: 403 | 404 }

/**
 * Resolve an issue by ref and apply the read or write gate. A row that exists
 * but fails access is a 403; a row that does not exist is a 404, so callers
 * never conflate "forbidden" with "missing".
 */
async function gatedIssue(
  store: WorkspaceStore,
  ref: string,
  userId: string,
  mode: "read" | "write"
): Promise<IssueAccess> {
  const access =
    mode === "write"
      ? await writableIssue(store, ref, userId)
      : await readableIssue(store, ref, userId)
  if (access) return { ok: true, ...access }
  return { ok: false, status: (await store.getIssue(ref)) ? 403 : 404 }
}

function gateError(status: 403 | 404) {
  return status === 403 ? "Forbidden" : "Not found"
}

/**
 * Comment, Activity timeline, and Watcher HTTP boundary. Comments are never
 * Activity Events: the store owns that rule, so these routes only enforce
 * access, validate bodies, and auto-watch the author.
 */
export function createCommentsApp({
  store,
  getSession,
  mailer,
  frontendUrl,
}: CommentsDeps) {
  const app = new Hono()

  app.post("/api/issues/:key/comments", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const access = await gatedIssue(
      store,
      c.req.param("key"),
      session.user.id,
      "write"
    )
    if (!access.ok) {
      return c.json({ error: gateError(access.status) }, access.status)
    }
    const parsed = commentBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid comment" }, 400)
    try {
      const comment = await store.createComment({
        issueId: access.issue.id,
        authorId: session.user.id,
        body: parsed.data.body,
        parentId: parsed.data.parentId ?? null,
      })
      // Posting implies following the conversation; the fan-out then reads
      // the watcher list to notify everyone else.
      await store.addWatcher(access.issue.id, session.user.id)
      await notifyCommentCreated(
        { store, mailer, frontendUrl },
        {
          actor: { type: "user", id: session.user.id },
          issue: access.issue,
          comment,
          parent: comment.parentId
            ? await store.getComment(comment.parentId)
            : null,
        }
      )
      return c.json(comment, 201)
    } catch (error) {
      if (isInvalid(error))
        return c.json({ error: (error as Error).message }, 400)
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  app.patch("/api/comments/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const comment = await store.getComment(c.req.param("id"))
    if (!comment) return c.json({ error: "Not found" }, 404)
    if (comment.authorId !== session.user.id) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = editCommentBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid comment" }, 400)
    try {
      const updated = await store.updateComment(comment.id, parsed.data.body)
      return c.json(updated)
    } catch (error) {
      if (isInvalid(error))
        return c.json({ error: (error as Error).message }, 400)
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  app.delete("/api/comments/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const comment = await store.getComment(c.req.param("id"))
    if (!comment) return c.json({ error: "Not found" }, 404)
    if (comment.authorId !== session.user.id) {
      const issue = await store.getIssue(comment.issueId)
      if (!issue) return c.json({ error: "Not found" }, 404)
      const project = await store.getProject(issue.projectId)
      if (!project) return c.json({ error: "Not found" }, 404)
      const membership = await membershipOf(
        store,
        project.workspaceId,
        session.user.id
      )
      // Only Owner/Admin moderate; plain Members and Viewer grants cannot.
      if (!membership || membership.role === "Member") {
        return c.json({ error: "Forbidden" }, 403)
      }
    }
    try {
      const deleted = await store.softDeleteComment(comment.id)
      return c.json(deleted)
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  app.get("/api/issues/:key/timeline", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const access = await gatedIssue(
      store,
      c.req.param("key"),
      session.user.id,
      "read"
    )
    if (!access.ok) {
      return c.json({ error: gateError(access.status) }, access.status)
    }
    const rawLimit = c.req.query("limit")
    const parsedLimit =
      rawLimit === undefined || rawLimit.trim() === ""
        ? Number.NaN
        : Number(rawLimit)
    const before = c.req.query("before")
    return c.json(
      await store.listTimeline(access.issue.id, {
        limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
        before: before === "" ? undefined : before,
      })
    )
  })

  app.get("/api/issues/:key/watch", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const access = await gatedIssue(
      store,
      c.req.param("key"),
      session.user.id,
      "read"
    )
    if (!access.ok) {
      return c.json({ error: gateError(access.status) }, access.status)
    }
    return c.json({
      watching: await store.isWatching(access.issue.id, session.user.id),
    })
  })

  app.post("/api/issues/:key/watch", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const access = await gatedIssue(
      store,
      c.req.param("key"),
      session.user.id,
      "write"
    )
    if (!access.ok) {
      return c.json({ error: gateError(access.status) }, access.status)
    }
    await store.addWatcher(access.issue.id, session.user.id)
    return c.json({ watching: true })
  })

  app.delete("/api/issues/:key/watch", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const access = await gatedIssue(
      store,
      c.req.param("key"),
      session.user.id,
      "write"
    )
    if (!access.ok) {
      return c.json({ error: gateError(access.status) }, access.status)
    }
    await store.removeWatcher(access.issue.id, session.user.id)
    return c.json({ watching: false })
  })

  return app
}
