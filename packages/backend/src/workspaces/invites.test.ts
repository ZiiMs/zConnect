import { beforeEach, describe, expect, test } from "bun:test"
import { createMemoryMailer } from "../lib/mailer.js"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore, type WorkspaceStore } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }
const upperCaseMember = {
  id: "user-member-upper",
  email: "MEMBER@EXAMPLE.COM",
}

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [outsider.id]: outsider,
  [upperCaseMember.id]: upperCaseMember,
}

const profiles = {
  [owner.id]: { name: "Ada Owner", email: owner.email },
  [member.id]: { name: "Grace Member", email: member.email },
  [outsider.id]: { name: "Oscar Outsider", email: outsider.email },
}

function setup(mailer: ReturnType<typeof createMemoryMailer> | null = null) {
  const store = createMemoryWorkspaceStore({ users: profiles })
  const app = createWorkspacesApp({
    store,
    mailer,
    frontendUrl: "http://localhost:5173",
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

async function fixture(
  mailer: ReturnType<typeof createMemoryMailer> | null = null
) {
  const fresh = setup(mailer)
  const created = await fresh.app.request("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(owner.id) },
    body: JSON.stringify({ name: "Acme" }),
  })
  const workspaceId = (await created.json()).id
  return { ...fresh, workspaceId }
}

function invite(
  app: ReturnType<typeof setup>["app"],
  workspaceId: string,
  userId: string | undefined,
  body: unknown = { email: member.email, role: "Member" }
) {
  return app.request(`/api/workspaces/${workspaceId}/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(userId) },
    body: JSON.stringify(body),
  })
}

async function joinAs(
  store: WorkspaceStore,
  workspaceId: string,
  user: Session["user"]
) {
  const invitation = await store.createInvitation({
    workspaceId,
    email: user.email,
    role: "Member",
    invitedBy: owner.id,
  })
  await store.acceptInvitation(invitation.id, user.id)
}

/**
 * The memory store hands back copies, so expiry cannot be written in place.
 * Shadow `getInvitation` on this test's store instance instead: the routes
 * read through this seam, and no production code changes for tests.
 */
function expireInvitation(store: WorkspaceStore, invitationId: string) {
  const getInvitation = store.getInvitation.bind(store)
  store.getInvitation = async (id) => {
    const invitation = await getInvitation(id)
    return invitation && invitation.id === invitationId
      ? { ...invitation, expiresAt: "2020-01-01T00:00:00.000Z" }
      : invitation
  }
}

describe("invite creation", () => {
  let app: ReturnType<typeof setup>["app"]
  let store: WorkspaceStore
  let workspaceId: string

  beforeEach(async () => {
    const fresh = await fixture()
    app = fresh.app
    store = fresh.store
    workspaceId = fresh.workspaceId
  })

  test("emails the invitee and returns the copy-link URL", async () => {
    const mailer = createMemoryMailer()
    const withMail = await fixture(mailer)
    const before = Date.now()

    const res = await invite(withMail.app, withMail.workspaceId, owner.id)
    expect(res.status).toBe(201)
    const body = await res.json()

    expect(body.email).toBe(member.email)
    expect(body.role).toBe("Member")
    expect(body.mailSent).toBe(true)
    expect(body.acceptUrl).toBe(`http://localhost:5173/invite/${body.id}`)
    const daysOut = (Date.parse(body.expiresAt) - before) / 86_400_000
    expect(daysOut).toBeGreaterThan(6.99)
    expect(daysOut).toBeLessThan(7.01)

    expect(mailer.sent).toHaveLength(1)
    const [message] = mailer.sent
    expect(message.to).toBe(member.email)
    expect(message.subject).toBe("Join Acme on zConnect")
    expect(message.text).toContain("Acme")
    expect(message.text).toContain("Member")
    expect(message.text).toContain("Ada Owner")
    expect(message.text).toContain(`/invite/${body.id}`)
    expect(message.text).toContain(body.expiresAt.slice(0, 10))
  })

  test("without a mailer falls back to the accept URL", async () => {
    const res = await invite(app, workspaceId, owner.id)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.mailSent).toBe(false)
    expect(body.acceptUrl.endsWith(`/invite/${body.id}`)).toBe(true)
  })

  test("a plain Member cannot invite (403)", async () => {
    await joinAs(store, workspaceId, member)
    const res = await invite(app, workspaceId, member.id, {
      email: outsider.email,
      role: "Member",
    })
    expect(res.status).toBe(403)
  })

  test("a duplicate pending invite returns 409", async () => {
    expect((await invite(app, workspaceId, owner.id)).status).toBe(201)
    expect((await invite(app, workspaceId, owner.id)).status).toBe(409)
  })
})

describe("invitation accept page", () => {
  let app: ReturnType<typeof setup>["app"]
  let store: WorkspaceStore
  let workspaceId: string
  let invitationId: string
  let expiresAt: string

  beforeEach(async () => {
    const fresh = await fixture()
    app = fresh.app
    store = fresh.store
    workspaceId = fresh.workspaceId
    const created = await invite(app, workspaceId, owner.id)
    const body = await created.json()
    invitationId = body.id
    expiresAt = body.expiresAt
  })

  test("GET returns the workspace, inviter, role and expiry to the invitee", async () => {
    const res = await app.request(`/api/invitations/${invitationId}`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: invitationId,
      email: member.email,
      role: "Member",
      expiresAt,
      workspace: { id: workspaceId, name: "Acme" },
      inviter: { id: owner.id, name: "Ada Owner", email: owner.email },
    })
  })

  test("GET matches the signed-in email case-insensitively", async () => {
    const res = await app.request(`/api/invitations/${invitationId}`, {
      headers: auth(upperCaseMember.id),
    })
    expect(res.status).toBe(200)
  })

  test("GET for another signed-in email returns 403", async () => {
    const res = await app.request(`/api/invitations/${invitationId}`, {
      headers: auth(outsider.id),
    })
    expect(res.status).toBe(403)
  })

  test("GET for an unknown invitation returns 404", async () => {
    const res = await app.request("/api/invitations/missing", {
      headers: auth(member.id),
    })
    expect(res.status).toBe(404)
  })

  test("GET for an expired invitation returns 410", async () => {
    expireInvitation(store, invitationId)
    const res = await app.request(`/api/invitations/${invitationId}`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(410)
  })

  test("GET without a session returns 401", async () => {
    const res = await app.request(`/api/invitations/${invitationId}`)
    expect(res.status).toBe(401)
  })

  test("accepting creates the membership and deletes the invitation", async () => {
    const accepted = await app.request(
      `/api/invitations/${invitationId}/accept`,
      { method: "POST", headers: auth(member.id) }
    )
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({
      workspaceId,
      userId: member.id,
      role: "Member",
    })

    const again = await app.request(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: auth(member.id),
    })
    expect(again.status).toBe(404)

    const gone = await app.request(`/api/invitations/${invitationId}`, {
      headers: auth(member.id),
    })
    expect(gone.status).toBe(404)
  })

  test("accepting without a session returns 401", async () => {
    const res = await app.request(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
    })
    expect(res.status).toBe(401)
  })

  test("accepting another user's invitation returns 403", async () => {
    const res = await app.request(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: auth(outsider.id),
    })
    expect(res.status).toBe(403)
  })

  test("an expired invitation cannot be accepted (410)", async () => {
    expireInvitation(store, invitationId)
    const res = await app.request(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: auth(member.id),
    })
    expect(res.status).toBe(410)
  })
})

describe("invitation inbox and management", () => {
  test("GET /api/invitations returns enriched rows for the inbox", async () => {
    const { app, workspaceId } = await fixture()
    await invite(app, workspaceId, owner.id)
    const res = await app.request("/api/invitations", {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      email: member.email,
      role: "Member",
      workspaceId,
      workspace: { id: workspaceId, name: "Acme" },
      inviter: { id: owner.id },
    })
  })

  test("GET /api/workspaces/:id/invites lists pending invites for managers", async () => {
    const { app, workspaceId } = await fixture()
    await invite(app, workspaceId, owner.id)
    const res = await app.request(`/api/workspaces/${workspaceId}/invites`, {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].email).toBe(member.email)
  })

  test("GET /api/workspaces/:id/invites rejects members and outsiders", async () => {
    const { app, store, workspaceId } = await fixture()
    await invite(app, workspaceId, owner.id)
    // A plain Member (joined via their own invite) cannot list invites.
    const memberInvite = await store.createInvitation({
      workspaceId,
      email: outsider.email,
      role: "Member",
      invitedBy: owner.id,
    })
    await store.acceptInvitation(memberInvite.id, outsider.id)
    const asMember = await app.request(
      `/api/workspaces/${workspaceId}/invites`,
      { headers: auth(outsider.id) }
    )
    expect(asMember.status).toBe(403)
    const asOutsider = await app.request(
      `/api/workspaces/${workspaceId}/invites`,
      { headers: auth(upperCaseMember.id) }
    )
    expect(asOutsider.status).toBe(403)
    const anonymous = await app.request(
      `/api/workspaces/${workspaceId}/invites`
    )
    expect(anonymous.status).toBe(401)
  })

  test("DELETE /api/invitations/:id lets a manager cancel", async () => {
    const { app, workspaceId } = await fixture()
    const created = await invite(app, workspaceId, owner.id)
    const { id } = await created.json()
    const res = await app.request(`/api/invitations/${id}`, {
      method: "DELETE",
      headers: auth(owner.id),
    })
    expect(res.status).toBe(204)
    const mine = await app.request("/api/invitations", {
      headers: auth(member.id),
    })
    expect(await mine.json()).toHaveLength(0)
  })

  test("DELETE /api/invitations/:id lets the invitee decline", async () => {
    const { app, workspaceId } = await fixture()
    const created = await invite(app, workspaceId, owner.id)
    const { id } = await created.json()
    const res = await app.request(`/api/invitations/${id}`, {
      method: "DELETE",
      headers: auth(member.id),
    })
    expect(res.status).toBe(204)
  })

  test("DELETE /api/invitations/:id rejects outsiders and unknown ids", async () => {
    const { app, workspaceId } = await fixture()
    const created = await invite(app, workspaceId, owner.id)
    const { id } = await created.json()
    const asOutsider = await app.request(`/api/invitations/${id}`, {
      method: "DELETE",
      headers: auth(outsider.id),
    })
    expect(asOutsider.status).toBe(403)
    const missing = await app.request("/api/invitations/missing", {
      method: "DELETE",
      headers: auth(owner.id),
    })
    expect(missing.status).toBe(404)
    const anonymous = await app.request(`/api/invitations/${id}`, {
      method: "DELETE",
    })
    expect(anonymous.status).toBe(401)
  })
})
