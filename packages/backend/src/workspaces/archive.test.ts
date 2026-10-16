import { beforeEach, describe, expect, test } from "bun:test"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore } from "./store.js"
import { clearSeededTracker } from "./test-support.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const admin = { id: "user-admin", email: "admin@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [admin.id]: admin,
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

describe("issue archive and hard delete", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let projectId: string
  let backlogId: string

  async function joinAs(
    user: Session["user"],
    role: "Admin" | "Member" = "Member"
  ) {
    await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: user.email, role }),
    })
    const mine = await app.request("/api/invitations", {
      headers: auth(user.id),
    })
    const [{ id }] = await mine.json()
    await app.request(`/api/invitations/${id}/accept`, {
      method: "POST",
      headers: auth(user.id),
    })
  }

  async function createIssue(title = "Fix login") {
    const res = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ title, statusId: backlogId }),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { id: string; identifier: string }
  }

  async function listIds(query = "") {
    const res = await app.request(`/api/projects/${projectId}/issues${query}`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    return ((await res.json()) as { identifier: string }[]).map(
      (i) => i.identifier
    )
  }

  function removeIssue(identifier: string, userId?: string) {
    return app.request(`/api/issues/${identifier}`, {
      method: "DELETE",
      headers: auth(userId),
    })
  }

  beforeEach(async () => {
    const fresh = setup()
    app = fresh.app
    const workspace = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    workspaceId = ((await workspace.json()) as { id: string }).id
    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    projectId = ((await project.json()) as { id: string }).id
    // T2: every new project arrives seeded; this describe wants a clean one.
    await clearSeededTracker(fresh.store, projectId)
    const status = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Backlog", category: "Unstarted" }),
    })
    backlogId = ((await status.json()) as { id: string }).id
    await joinAs(member)
    await joinAs(admin, "Admin")
  })

  test("archiving hides from the default query and restores on unarchive", async () => {
    const seeded = await createIssue()
    const archived = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ archived: true }),
    })
    expect(archived.status).toBe(200)
    expect(await listIds()).toEqual([])
    expect(await listIds("?archived=true")).toEqual(["WEB-7"])

    const restored = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ archived: false }),
    })
    expect(restored.status).toBe(200)
    expect(((await restored.json()) as { archived: boolean }).archived).toBe(
      false
    )
    expect(await listIds()).toEqual(["WEB-7"])
  })

  test("owner hard-deletes; the issue is gone everywhere", async () => {
    const seeded = await createIssue()
    expect(await removeIssue(seeded.identifier, owner.id)).toHaveProperty(
      "status",
      204
    )
    expect(
      (
        await app.request(`/api/issues/${seeded.identifier}`, {
          headers: auth(member.id),
        })
      ).status
    ).toBe(404)
    expect(await listIds()).toEqual([])
    expect(await listIds("?archived=true")).toEqual([])
  })

  test("admin can hard-delete but member cannot", async () => {
    const first = await createIssue("One")
    expect((await removeIssue(first.identifier, admin.id)).status).toBe(204)

    const second = await createIssue("Two")
    expect((await removeIssue(second.identifier, member.id)).status).toBe(403)
    expect(await listIds()).toEqual(["WEB-8"])
  })

  test("viewer, outsider and anonymous cannot hard-delete; unknown is 404", async () => {
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    const seeded = await createIssue()
    expect((await removeIssue(seeded.identifier, viewer.id)).status).toBe(403)
    expect((await removeIssue(seeded.identifier, outsider.id)).status).toBe(403)
    expect((await removeIssue(seeded.identifier, undefined)).status).toBe(401)
    expect((await removeIssue("WEB-999", owner.id)).status).toBe(404)
  })

  test("deleting a parent clears subtask links to top-level", async () => {
    const parent = await createIssue("Parent")
    const childRes = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({
        title: "Child",
        statusId: backlogId,
        parentId: parent.id,
      }),
    })
    expect(childRes.status).toBe(201)
    const child = (await childRes.json()) as { identifier: string }

    expect((await removeIssue(parent.identifier, owner.id)).status).toBe(204)
    const reread = await app.request(`/api/issues/${child.identifier}`, {
      headers: auth(member.id),
    })
    expect(reread.status).toBe(200)
    expect(
      ((await reread.json()) as { parentId: string | null }).parentId
    ).toBeNull()
  })
})
