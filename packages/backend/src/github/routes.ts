import { Hono } from "hono"
import { z } from "zod"
import type { GetSession } from "../workspaces/session.js"
import type { WorkspaceStore } from "../workspaces/store.js"
import type { GitHubWebhookJob } from "./job.js"
import { parseExternalUrl } from "./parse.js"
import type { GitHubStore } from "./store.js"

const installBody = z.object({
  repos: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[^/\s]+\/[^/\s]+$/)
    )
    .min(1)
    .max(100),
})

const manualLinkBody = z.object({ url: z.string().trim().min(1) })

export interface GitHubDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
  getSession: GetSession
  enqueue: (job: GitHubWebhookJob) => Promise<void>
  /**
   * When set, `POST /api/webhooks/github` requires a valid
   * `x-hub-signature-256` HMAC. When unset (local/dev), deliveries are
   * accepted without verification — production must set
   * GITHUB_WEBHOOK_SECRET.
   */
  webhookSecret?: string
}

async function signatureValid(
  secret: string,
  raw: string,
  header: string | null
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false
  const expected = header.slice("sha256=".length)
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw)
  )
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return hex.length === expected.length && hex === expected
}

/**
 * GitHub App HTTP boundary (T6 – External Links). Tested at the Hono
 * app-object seam via `app.request(...)`: status codes and response shapes,
 * never SQL or store internals. Mounted additively alongside the
 * workspaces app; T1–T3 routes are untouched.
 */
export function createGitHubApp({
  workspaces,
  github,
  getSession,
  enqueue,
  webhookSecret,
}: GitHubDeps) {
  const app = new Hono()

  async function adminWorkspace(workspaceId: string, userId: string) {
    const membership = await workspaces.getMembership(workspaceId, userId)
    if (!membership || membership.role === "Member") return null
    return membership
  }

  async function issueProject(issueRef: string, userId: string) {
    const issue = await workspaces.getIssue(issueRef)
    if (!issue) return null
    const project = await workspaces.getProject(issue.projectId)
    if (!project) return null
    const membership = await workspaces.getMembership(
      project.workspaceId,
      userId
    )
    if (!membership) return null
    return { issue, project }
  }

  app.post("/api/workspaces/:id/github-installs", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    if (!(await adminWorkspace(c.req.param("id"), session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = installBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid repos" }, 400)
    const install = await github.createInstall(
      c.req.param("id"),
      parsed.data.repos
    )
    return c.json(install, 201)
  })

  app.get("/api/workspaces/:id/github-installs", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const membership = await workspaces.getMembership(
      c.req.param("id"),
      session.user.id
    )
    if (!membership) return c.json({ error: "Forbidden" }, 403)
    return c.json(await github.listInstalls(c.req.param("id")))
  })

  app.post("/api/issues/:key/external-links", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const found = await issueProject(c.req.param("key"), session.user.id)
    if (!found) {
      const exists = await workspaces.getIssue(c.req.param("key"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    const parsed = manualLinkBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid URL" }, 400)
    const classified = parseExternalUrl(parsed.data.url)
    if (!classified)
      return c.json({ error: "Not a GitHub PR, branch, or commit URL" }, 400)
    const existing = (await github.listExternalLinks(found.issue.id)).find(
      (link) => link.url === classified.url
    )
    if (existing) return c.json(existing, 200)
    const link = await github.createExternalLink(found.issue.id, {
      provider: "github",
      kind: classified.kind,
      url: classified.url,
    })
    await github.appendTimelineEvent(
      found.issue.id,
      "link.manual",
      `External Link added (${classified.kind} ${classified.owner}/${classified.repo})`
    )
    return c.json(link, 201)
  })

  app.get("/api/issues/:key/external-links", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const found = await issueProject(c.req.param("key"), session.user.id)
    if (!found) {
      const exists = await workspaces.getIssue(c.req.param("key"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(await github.listExternalLinks(found.issue.id))
  })

  app.get("/api/issues/:key/timeline", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const found = await issueProject(c.req.param("key"), session.user.id)
    if (!found) {
      const exists = await workspaces.getIssue(c.req.param("key"))
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(await github.listTimelineEvents(found.issue.id))
  })

  app.post("/api/webhooks/github", async (c) => {
    const raw = await c.req.text()
    if (webhookSecret) {
      const ok = await signatureValid(
        webhookSecret,
        raw,
        c.req.header("x-hub-signature-256") ?? null
      )
      if (!ok) return c.json({ error: "Invalid signature" }, 401)
    }
    const event = c.req.header("x-github-event")
    const deliveryId = c.req.header("x-github-delivery") ?? crypto.randomUUID()
    if (event !== "pull_request") return c.json({ ignored: true }, 202)
    let payload: {
      action?: string
      number?: number
      pull_request?: {
        title?: string
        body?: string | null
        html_url?: string
        merged?: boolean
        head?: { ref?: string }
      }
      repository?: { full_name?: string }
    }
    try {
      payload = JSON.parse(raw || "{}")
    } catch {
      return c.json({ error: "Invalid payload" }, 400)
    }
    if (!["opened", "synchronize", "closed"].includes(payload.action ?? "")) {
      return c.json({ ignored: true }, 202)
    }
    const pr = payload.pull_request
    if (!pr?.html_url || !payload.repository?.full_name) {
      return c.json({ error: "Invalid payload" }, 400)
    }
    await enqueue({
      deliveryId,
      action: payload.action as GitHubWebhookJob["action"],
      repoFullName: payload.repository.full_name,
      branch: pr.head?.ref ?? "",
      body: pr.body ?? "",
      url: pr.html_url,
      title: pr.title ?? pr.html_url,
      number: payload.number ?? 0,
      merged: pr.merged ?? false,
    })
    return c.json({ enqueued: true }, 202)
  })

  return app
}
