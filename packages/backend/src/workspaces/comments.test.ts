import { beforeEach, describe, expect, test } from "bun:test"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore } from "./store.js"
import { clearSeededTracker } from "./test-support.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [outsider.id]: outsider,
  [viewer.id]: viewer,
}

function setup() {
  const store = createMemoryWorkspaceStore()
  const app = createWorkspacesApp({
    store,
    getSession: async (req) => {
      const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
      const user = match ? users[match[1]] : undefined
      return user ? { user } : null
    },
  })
  return { app, store }
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

interface TimelinePage {
  items: {
    id: string
    kind: "comment" | "activity"
    body?: string
    createdAt: string
  }[]
  nextCursor: string | null
}

interface CommentRow {
  id: string
  issueId: string
  authorId: string
  body: string
  parentId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
}

describe("comments, timeline, and watch routes", () => {
  let app: ReturnType<typeof setup>["app"]
  let store: ReturnType<typeof setup>["store"]
  let workspaceId: string
  let projectId: string
  let statusId: string
  let issueId: string
  let issueKey: string

  function postComment(
    userId: string | undefined,
    body: unknown,
    key = issueKey
  ) {
    return app.request(`/api/issues/${key}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
    })
  }

  function patchComment(
    userId: string | undefined,
    commentId: string,
    body: unknown
  ) {
    return app.request(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
    })
  }

  function deleteComment(userId: string | undefined, commentId: string) {
    return app.request(`/api/comments/${commentId}`, {
      method: "DELETE",
      headers: auth(userId),
    })
  }

  function watch(userId: string | undefined, method = "GET", key = issueKey) {
    return app.request(`/api/issues/${key}/watch`, {
      method,
      headers: auth(userId),
    })
  }

  function createIssue(userId: string | undefined, title: string) {
    return app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify({ title, statusId }),
    })
  }

  function timeline(userId: string | undefined, query = "", key = issueKey) {
    return app.request(`/api/issues/${key}/timeline${query}`, {
      headers: auth(userId),
    })
  }

  async function grantViewer(userId: string) {
    const res = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId }),
    })
    expect(res.status).toBe(201)
  }

  async function joinAsMember() {
    await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })
    const mine = await app.request("/api/invitations", {
      headers: auth(member.id),
    })
    const [{ id }] = await mine.json()
    await app.request(`/api/invitations/${id}/accept`, {
      method: "POST",
      headers: auth(member.id),
    })
  }

  beforeEach(async () => {
    const fresh = setup()
    app = fresh.app
    store = fresh.store
    const workspace = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    workspaceId = (await workspace.json()).id
    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    projectId = (await project.json()).id
    // Every new project arrives seeded; this suite wants a clean tracker.
    await clearSeededTracker(store, projectId)
    const status = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Backlog", category: "Unstarted" }),
    })
    statusId = (await status.json()).id
    await joinAsMember()
    // The creator auto-watches their issue; create it as the owner so this
    // suite starts the member with no watch state.
    const issue = await (await createIssue(owner.id, "Primary issue")).json()
    issueId = issue.id
    issueKey = issue.identifier
  })

  test("member posts a markdown comment", async () => {
    const res = await postComment(member.id, {
      body: "# Heading\n\n**bold** and `code`",
    })
    expect(res.status).toBe(201)
    const comment = (await res.json()) as CommentRow
    expect(comment).toMatchObject({
      issueId,
      authorId: member.id,
      body: "# Heading\n\n**bold** and `code`",
      parentId: null,
      editedAt: null,
      deletedAt: null,
    })
    expect(comment.id).toBeTruthy()
    expect(typeof comment.createdAt).toBe("string")
  })

  test("empty, whitespace-only, and oversized bodies are 400", async () => {
    expect((await postComment(member.id, { body: "" })).status).toBe(400)
    expect((await postComment(member.id, { body: "   \n\t " })).status).toBe(
      400
    )
    expect(
      (await postComment(member.id, { body: "x".repeat(10_001) })).status
    ).toBe(400)
    expect(
      (await postComment(member.id, { body: "x".repeat(10_000) })).status
    ).toBe(201)
  })

  test("anonymous writes are 401 and outsiders are 403", async () => {
    expect((await postComment(undefined, { body: "hello" })).status).toBe(401)
    expect((await postComment(outsider.id, { body: "hello" })).status).toBe(403)
  })

  test("unknown issues are 404 across comment, timeline, and watch", async () => {
    expect(
      (await postComment(member.id, { body: "x" }, "WEB-999")).status
    ).toBe(404)
    expect((await timeline(member.id, "", "WEB-999")).status).toBe(404)
    expect((await watch(member.id, "GET", "WEB-999")).status).toBe(404)
    expect((await watch(member.id, "POST", "WEB-999")).status).toBe(404)
  })

  test("Viewer can read the timeline but cannot comment or moderate", async () => {
    const posted = await postComment(member.id, {
      body: "visible to viewers",
    })
    const comment = (await posted.json()) as CommentRow
    await grantViewer(viewer.id)

    const res = await timeline(viewer.id)
    expect(res.status).toBe(200)
    const page = (await res.json()) as TimelinePage
    expect(page.items).toContainEqual(
      expect.objectContaining({
        kind: "comment",
        id: comment.id,
        body: "visible to viewers",
      })
    )

    expect((await postComment(viewer.id, { body: "nope" })).status).toBe(403)
    expect(
      (await patchComment(viewer.id, comment.id, { body: "nope" })).status
    ).toBe(403)
    expect((await deleteComment(viewer.id, comment.id)).status).toBe(403)
    expect((await timeline(outsider.id)).status).toBe(403)
  })

  test("replies attach to top-level comments and reject bad parents", async () => {
    const top = (await (
      await postComment(member.id, { body: "top" })
    ).json()) as CommentRow

    const replyRes = await postComment(owner.id, {
      body: "reply",
      parentId: top.id,
    })
    expect(replyRes.status).toBe(201)
    const reply = (await replyRes.json()) as CommentRow
    expect(reply.parentId).toBe(top.id)

    expect(
      (await postComment(owner.id, { body: "nested", parentId: reply.id }))
        .status
    ).toBe(400)

    const other = await (await createIssue(member.id, "Other issue")).json()
    const otherComment = (await (
      await postComment(member.id, { body: "elsewhere" }, other.identifier)
    ).json()) as CommentRow
    expect(
      (
        await postComment(owner.id, {
          body: "wrong issue",
          parentId: otherComment.id,
        })
      ).status
    ).toBe(400)
  })

  test("only the author can edit, and edits set editedAt", async () => {
    const comment = (await (
      await postComment(member.id, { body: "first" })
    ).json()) as CommentRow
    const edited = await patchComment(member.id, comment.id, {
      body: " second ",
    })
    expect(edited.status).toBe(200)
    const body = (await edited.json()) as CommentRow
    expect(body.body).toBe("second")
    expect(body.editedAt).not.toBeNull()
    expect(typeof body.editedAt).toBe("string")

    const ownerComment = (await (
      await postComment(owner.id, { body: "owner's comment" })
    ).json()) as CommentRow
    expect(
      (await patchComment(member.id, ownerComment.id, { body: "hijack" }))
        .status
    ).toBe(403)
    expect(
      (await patchComment(owner.id, ownerComment.id, { body: "   " })).status
    ).toBe(400)
    expect(
      (await patchComment(member.id, "missing-comment", { body: "x" })).status
    ).toBe(404)
  })

  test("author delete is an idempotent tombstone; Owner can moderate", async () => {
    const comment = (await (
      await postComment(member.id, { body: "delete me" })
    ).json()) as CommentRow
    const deleted = await deleteComment(member.id, comment.id)
    expect(deleted.status).toBe(200)
    const tombstone = (await deleted.json()) as CommentRow
    expect(tombstone.body).toBe("")
    expect(tombstone.deletedAt).not.toBeNull()

    const again = await deleteComment(member.id, comment.id)
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({
      body: "",
      deletedAt: tombstone.deletedAt,
    })

    expect(
      (await patchComment(member.id, comment.id, { body: "revive" })).status
    ).toBe(400)

    const moderated = (await (
      await postComment(member.id, { body: "moderate me" })
    ).json()) as CommentRow
    const res = await deleteComment(owner.id, moderated.id)
    expect(res.status).toBe(200)
    expect(((await res.json()) as CommentRow).body).toBe("")
  })

  test("outsider, Viewer, and non-author Member cannot delete", async () => {
    const comment = (await (
      await postComment(member.id, { body: "mine" })
    ).json()) as CommentRow
    const ownerComment = (await (
      await postComment(owner.id, { body: "not yours" })
    ).json()) as CommentRow
    await grantViewer(viewer.id)

    expect((await deleteComment(outsider.id, comment.id)).status).toBe(403)
    expect((await deleteComment(viewer.id, comment.id)).status).toBe(403)
    expect((await deleteComment(member.id, ownerComment.id)).status).toBe(403)
    expect((await deleteComment(member.id, "missing-comment")).status).toBe(404)
  })

  test("timeline merges comments and activity newest first with stable pages", async () => {
    for (let index = 0; index < 3; index += 1) {
      const res = await postComment(member.id, { body: `comment ${index}` })
      expect(res.status).toBe(201)
    }

    const fullRes = await timeline(member.id, "?limit=50")
    expect(fullRes.status).toBe(200)
    const full = (await fullRes.json()) as TimelinePage
    expect(full.nextCursor).toBeNull()
    expect(new Set(full.items.map((item) => item.kind))).toEqual(
      new Set(["activity", "comment"])
    )
    for (let index = 1; index < full.items.length; index += 1) {
      const previous = full.items[index - 1]
      const current = full.items[index]
      expect(
        previous.createdAt > current.createdAt ||
          (previous.createdAt === current.createdAt && previous.id > current.id)
      ).toBe(true)
    }

    const collected: string[] = []
    let before: string | null = null
    for (;;) {
      const query = `?limit=2${before ? `&before=${encodeURIComponent(before)}` : ""}`
      const pageRes = await timeline(member.id, query)
      expect(pageRes.status).toBe(200)
      const page = (await pageRes.json()) as TimelinePage
      collected.push(...page.items.map((item) => item.id))
      if (!page.nextCursor) break
      before = page.nextCursor
    }
    expect(collected).toEqual(full.items.map((item) => item.id))
    expect(new Set(collected).size).toBe(collected.length)
  })

  test("timeline ignores a non-numeric or empty limit", async () => {
    for (const query of ["?limit=abc", "?limit=", "?limit=0"]) {
      const res = await timeline(member.id, query)
      expect(res.status).toBe(200)
      const page = (await res.json()) as TimelinePage
      expect(page.items.length).toBeLessThanOrEqual(20)
    }
  })

  test("watch toggles idempotently and is member-only", async () => {
    const initial = await watch(member.id)
    expect(initial.status).toBe(200)
    expect(await initial.json()).toEqual({ watching: false })

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await watch(member.id, "POST")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ watching: true })
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await watch(member.id, "DELETE")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ watching: false })
    }

    await grantViewer(viewer.id)
    const viewerRead = await watch(viewer.id)
    expect(viewerRead.status).toBe(200)
    expect(await viewerRead.json()).toEqual({ watching: false })
    expect((await watch(viewer.id, "POST")).status).toBe(403)
    expect((await watch(viewer.id, "DELETE")).status).toBe(403)
    expect((await watch(outsider.id, "POST")).status).toBe(403)
    expect((await watch(undefined)).status).toBe(401)
  })

  test("posting a comment auto-watches the author", async () => {
    expect((await watch(member.id)).status).toBe(200)
    await postComment(member.id, { body: "follow this" })
    const res = await watch(member.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ watching: true })
  })
})
