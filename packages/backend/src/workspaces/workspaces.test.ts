import { beforeEach, describe, expect, test } from "bun:test"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore } from "./store.js"

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

describe("workspaces contract", () => {
  let app: ReturnType<typeof setup>["app"]

  beforeEach(() => {
    app = setup().app
  })

  test("GET /api/workspaces without session returns 401", async () => {
    const res = await app.request("/api/workspaces")
    expect(res.status).toBe(401)
  })

  test("POST /api/workspaces without session returns 401", async () => {
    const res = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth() },
      body: JSON.stringify({ name: "Acme" }),
    })
    expect(res.status).toBe(401)
  })

  test("owner creates a workspace and becomes Owner", async () => {
    const res = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("Acme")
    expect(typeof body.id).toBe("string")
    expect(body.role).toBe("Owner")
  })

  test("POST /api/workspaces with blank name returns 400", async () => {
    const res = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "  " }),
    })
    expect(res.status).toBe(400)
  })

  test("created workspace appears in the owner's list", async () => {
    const created = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    const { id } = await created.json()

    const res = await app.request("/api/workspaces", {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject([{ id, name: "Acme", role: "Owner" }])
  })

  test("outsider sees an empty workspace list", async () => {
    await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    const res = await app.request("/api/workspaces", {
      headers: auth(outsider.id),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe("invites and members contract", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string

  beforeEach(async () => {
    app = setup().app
    const created = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    workspaceId = (await created.json()).id
  })

  test("POST invite without session returns 401", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })
    expect(res.status).toBe(401)
  })

  test("owner invites a member by email", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.email).toBe(member.email)
    expect(body.role).toBe("Member")
    expect(body.workspaceId).toBe(workspaceId)
    expect(typeof body.expiresAt).toBe("string")
    // No mailer is injected in this suite: the copy-link fallback is returned.
    expect(body.mailSent).toBe(false)
    expect(body.acceptUrl).toBe(`http://localhost:5173/invite/${body.id}`)
  })

  test("owner invite with unknown role returns 400", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "SuperAdmin" }),
    })
    expect(res.status).toBe(400)
  })

  test("invited member accepts and sees the workspace after sign-in", async () => {
    await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })

    const mine = await app.request("/api/invitations", {
      headers: auth(member.id),
    })
    expect(mine.status).toBe(200)
    const invites = await mine.json()
    expect(invites).toHaveLength(1)

    const accepted = await app.request(
      `/api/invitations/${invites[0].id}/accept`,
      { method: "POST", headers: auth(member.id) }
    )
    expect(accepted.status).toBe(200)

    const list = await app.request("/api/workspaces", {
      headers: auth(member.id),
    })
    expect(await list.json()).toMatchObject([
      { id: workspaceId, name: "Acme", role: "Member" },
    ])
  })

  test("accepting another user's invitation returns 403", async () => {
    const invite = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })
    const { id } = await invite.json()

    const res = await app.request(`/api/invitations/${id}/accept`, {
      method: "POST",
      headers: auth(outsider.id),
    })
    expect(res.status).toBe(403)
  })

  test("member cannot invite others (403)", async () => {
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

    const res = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ email: outsider.email, role: "Member" }),
    })
    expect(res.status).toBe(403)
  })

  test("outsider cannot invite (403)", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(outsider.id) },
      body: JSON.stringify({ email: outsider.email, role: "Member" }),
    })
    expect(res.status).toBe(403)
  })

  test("members list is visible to members but not outsiders", async () => {
    const asMember = await app.request(
      `/api/workspaces/${workspaceId}/members`,
      { headers: auth(owner.id) }
    )
    expect(asMember.status).toBe(200)
    expect(await asMember.json()).toMatchObject([
      { userId: owner.id, role: "Owner" },
    ])

    const asOutsider = await app.request(
      `/api/workspaces/${workspaceId}/members`,
      { headers: auth(outsider.id) }
    )
    expect(asOutsider.status).toBe(403)

    const anonymous = await app.request(
      `/api/workspaces/${workspaceId}/members`
    )
    expect(anonymous.status).toBe(401)
  })
})

describe("projects and viewer contract", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string

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

  function createProject(userId: string | undefined, body: unknown) {
    return app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
    })
  }

  beforeEach(async () => {
    app = setup().app
    const created = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    workspaceId = (await created.json()).id
  })

  test("POST project without session returns 401", async () => {
    const res = await createProject(undefined, { name: "Web", key: "WEB" })
    expect(res.status).toBe(401)
  })

  test("owner creates a project with normalized key", async () => {
    const res = await createProject(owner.id, { name: "Web", key: "web" })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("Web")
    expect(body.key).toBe("WEB")
    expect(body.workspaceId).toBe(workspaceId)
  })

  test("POST project with invalid key or name returns 400", async () => {
    const badKey = await createProject(owner.id, { name: "Web", key: "w!" })
    expect(badKey.status).toBe(400)
    const blankName = await createProject(owner.id, { name: " ", key: "WEB" })
    expect(blankName.status).toBe(400)
  })

  test("duplicate project key returns 409", async () => {
    await createProject(owner.id, { name: "Web", key: "WEB" })
    const res = await createProject(owner.id, { name: "Web Two", key: "web" })
    expect(res.status).toBe(409)
  })

  test("member cannot create projects (403) but can list them", async () => {
    await joinAsMember()
    await createProject(owner.id, { name: "Web", key: "WEB" })

    const denied = await createProject(member.id, {
      name: "Sneaky",
      key: "SNK",
    })
    expect(denied.status).toBe(403)

    const listed = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      { headers: auth(member.id) }
    )
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject([{ key: "WEB" }])
  })

  test("outsider cannot list projects (403)", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      headers: auth(outsider.id),
    })
    expect(res.status).toBe(403)
  })

  test("viewer is read-only: sees workspace and projects, cannot write", async () => {
    const project = await createProject(owner.id, { name: "Web", key: "WEB" })
    const { id: projectId } = await project.json()

    const grant = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(grant.status).toBe(201)

    const list = await app.request("/api/workspaces", {
      headers: auth(viewer.id),
    })
    expect(await list.json()).toMatchObject([
      { id: workspaceId, role: "Viewer" },
    ])

    const projects = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      { headers: auth(viewer.id) }
    )
    expect(projects.status).toBe(200)

    const writeProject = await createProject(viewer.id, {
      name: "Sneaky",
      key: "SNK",
    })
    expect(writeProject.status).toBe(403)

    const invite = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(viewer.id) },
      body: JSON.stringify({ email: outsider.email, role: "Member" }),
    })
    expect(invite.status).toBe(403)
  })

  test("member cannot grant viewers (403)", async () => {
    await joinAsMember()
    const project = await createProject(owner.id, { name: "Web", key: "WEB" })
    const { id: projectId } = await project.json()

    const res = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(res.status).toBe(403)
  })
})
