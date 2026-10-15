import { beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { createWorkspacesApp } from "../workspaces/routes.js"
import type { Session } from "../workspaces/session.js"
import { createMemoryWorkspaceStore } from "../workspaces/store.js"
import { createMcpApp } from "./routes.js"
import { createMemoryTokenStore } from "./tokens.js"

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
  const tokens = createMemoryTokenStore()
  const getSession = async (req: Request) => {
    const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
    const user = match ? users[match[1]] : undefined
    return user ? { user } : null
  }
  const app = new Hono()
  app.route("/", createWorkspacesApp({ store, getSession }))
  app.route("/", createMcpApp({ store, tokens, getSession }))
  return { app, store, tokens }
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

describe("workspace token issuance", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string

  async function inviteAs(email: string, role: "Admin" | "Member") {
    await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email, role }),
    })
    const userId = Object.values(users).find((u) => u.email === email)?.id
    const mine = await app.request("/api/invitations", {
      headers: auth(userId),
    })
    const [{ id }] = await mine.json()
    await app.request(`/api/invitations/${id}/accept`, {
      method: "POST",
      headers: auth(userId),
    })
  }

  function createToken(userId: string | undefined, body: unknown) {
    return app.request(`/api/workspaces/${workspaceId}/tokens`, {
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

  test("owner creates a token and sees the plaintext once", async () => {
    const res = await createToken(owner.id, { name: "agent-1" })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.workspaceId).toBe(workspaceId)
    expect(body.name).toBe("agent-1")
    expect(typeof body.token).toBe("string")
    expect(body.token.length).toBeGreaterThan(16)
    expect(typeof body.prefix).toBe("string")
    expect(body).not.toHaveProperty("hash")
  })

  test("creating with a blank name returns 400", async () => {
    const res = await createToken(owner.id, { name: "  " })
    expect(res.status).toBe(400)
  })

  test("listing tokens hides all secrets", async () => {
    await createToken(owner.id, { name: "agent-1" })
    const res = await app.request(`/api/workspaces/${workspaceId}/tokens`, {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    const [listed] = await res.json()
    expect(listed.name).toBe("agent-1")
    expect(typeof listed.prefix).toBe("string")
    expect(listed).not.toHaveProperty("token")
    expect(listed).not.toHaveProperty("hash")
  })

  test("revoking a token removes it; second revoke returns 404", async () => {
    const created = await createToken(owner.id, { name: "agent-1" })
    const { id } = await created.json()
    const revoked = await app.request(
      `/api/workspaces/${workspaceId}/tokens/${id}`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(revoked.status).toBe(204)
    const again = await app.request(
      `/api/workspaces/${workspaceId}/tokens/${id}`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(again.status).toBe(404)
  })

  test("admin can manage tokens; member and viewer cannot (403)", async () => {
    await inviteAs(admin.email, "Admin")
    await inviteAs(member.email, "Member")

    expect((await createToken(admin.id, { name: "a" })).status).toBe(201)

    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    const projectId = (await project.json()).id
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })

    for (const userId of [member.id, viewer.id, outsider.id]) {
      expect((await createToken(userId, { name: "sneaky" })).status).toBe(403)
    }
    expect((await createToken(undefined, { name: "sneaky" })).status).toBe(401)
  })

  test("token endpoints on an unknown workspace return 403 for members", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    const res = await app.request(`/api/workspaces/${missing}/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "agent-1" }),
    })
    expect(res.status).toBe(403)
  })
})
