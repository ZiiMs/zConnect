import { beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { createWorkspacesApp } from "../workspaces/routes.js"
import type { Session } from "../workspaces/session.js"
import { createMemoryWorkspaceStore } from "../workspaces/store.js"
import { createMcpApp } from "./routes.js"
import { createMemoryTokenStore } from "./tokens.js"

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

function rpc(method: string, params?: unknown, id = 1) {
  return { jsonrpc: "2.0", id, method, params: params ?? {} }
}

export async function seedWorkspace(
  app: ReturnType<typeof setup>["app"],
  as: string = owner.id
) {
  const created = await app.request("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(as) },
    body: JSON.stringify({ name: "Acme" }),
  })
  const workspaceId = ((await created.json()) as { id: string }).id
  const tokenRes = await app.request(`/api/workspaces/${workspaceId}/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(as) },
    body: JSON.stringify({ name: "agent-1" }),
  })
  const { token } = (await tokenRes.json()) as { token: string }
  return { workspaceId, token }
}

function mcp(token: string | undefined, body: unknown) {
  return setupApp.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

let setupApp: ReturnType<typeof setup>["app"]

describe("mcp transport", () => {
  let token: string

  beforeEach(async () => {
    setupApp = setup().app
    ;({ token } = await seedWorkspace(setupApp))
  })

  test("missing or unknown bearer token returns 401", async () => {
    const missing = await mcp(undefined, rpc("tools/list"))
    expect(missing.status).toBe(401)
    const bogus = await mcp("zct_bogus", rpc("tools/list"))
    expect(bogus.status).toBe(401)
  })

  test("a session bearer token is not a workspace token (401)", async () => {
    const res = await mcp(owner.id, rpc("tools/list"))
    expect(res.status).toBe(401)
  })

  test("tools/list enumerates exactly the five MVP tools", async () => {
    const res = await mcp(token, rpc("tools/list"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1 })
    const names = (body.result.tools as { name: string }[]).map((t) => t.name)
    expect(names.sort()).toEqual(
      [
        "issue.create",
        "issue.get",
        "issue.list",
        "issue.update",
        "project.list",
      ].sort()
    )
  })

  test("unknown methods are not reachable (404); GET is rejected (405)", async () => {
    const noDelete = await mcp(token, rpc("issue.delete", { ref: "WEB-1" }))
    expect(noDelete.status).toBe(404)
    const noAdmin = await mcp(token, rpc("member.add", { userId: "x" }))
    expect(noAdmin.status).toBe(404)
    const get = await setupApp.request("/api/mcp", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(get.status).toBe(405)
  })

  test("a malformed JSON-RPC envelope returns 400", async () => {
    const res = await mcp(token, { method: "tools/list" })
    expect(res.status).toBe(400)
  })
})

describe("mcp project.list and issue.list parity", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let token: string
  let projectId: string
  let backlogId: string
  let doneId: string

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

  async function callMcp(tokenValue: string | undefined, body: unknown) {
    return app.request("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tokenValue ? { authorization: `Bearer ${tokenValue}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  async function restList(query = "", as: string | null = member.id) {
    return app.request(`/api/projects/${projectId}/issues${query}`, {
      headers: as ? auth(as) : {},
    })
  }

  async function mcpList(params: unknown, tokenValue: string | null = token) {
    return callMcp(tokenValue ?? undefined, rpc("issue.list", params))
  }

  async function expectParity(
    restRes: Response,
    mcpRes: Response,
    expectedStatus = 200
  ) {
    expect(restRes.status).toBe(expectedStatus)
    expect(mcpRes.status).toBe(expectedStatus)
    if (expectedStatus === 200) {
      const restBody = await restRes.json()
      const mcpBody = await mcpRes.json()
      expect(mcpBody).toMatchObject({ jsonrpc: "2.0", id: 1 })
      expect(mcpBody.result).toEqual(restBody)
    }
  }

  beforeEach(async () => {
    app = setup().app
    ;({ workspaceId, token } = await seedWorkspace(app))
    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    projectId = (await project.json()).id
    for (const [name, category] of [
      ["Backlog", "Unstarted"],
      ["Shipped", "Completed"],
    ] as const) {
      const created = await app.request(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name, category }),
      })
      const body = (await created.json()) as { id: string }
      if (name === "Backlog") backlogId = body.id
      else doneId = body.id
    }
    await joinAsMember()
    for (const issue of [
      { title: "Fix login", statusId: backlogId, priority: "High" },
      { title: "Ship homepage", statusId: doneId, priority: "Low" },
    ]) {
      await app.request(`/api/projects/${projectId}/issues`, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify(issue),
      })
    }
  })

  test("project.list matches the REST project list", async () => {
    const rest = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      headers: auth(member.id),
    })
    const viaMcp = await callMcp(token, rpc("project.list", {}))
    await expectParity(rest, viaMcp)
  })

  test("issue.list unfiltered matches REST", async () => {
    await expectParity(await restList(), await mcpList({ projectId }))
  })

  test("issue.list filters match REST", async () => {
    await expectParity(
      await restList(`?status=${backlogId}`),
      await mcpList({ projectId, statusIds: [backlogId] })
    )
    await expectParity(
      await restList("?priority=High"),
      await mcpList({ projectId, priorities: ["High"] })
    )
    await expectParity(
      await restList("?q=login"),
      await mcpList({ projectId, text: "login" })
    )
  })

  test("issue.list denials match REST: anon 401", async () => {
    await expectParity(
      await restList("", null),
      await mcpList({ projectId }, null),
      401
    )
    expect((await mcpList({ projectId }, "zct_bogus")).status).toBe(401)
  })

  test("issue.list on unknown or foreign projects matches REST (404/403)", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    const restMissing = await app.request(`/api/projects/${missing}/issues`, {
      headers: auth(member.id),
    })
    const mcpMissing = await mcpList({ projectId: missing })
    await expectParity(restMissing, mcpMissing, 404)

    const other = await seedWorkspace(app)
    const restForeign = await app.request(`/api/projects/${projectId}/issues`, {
      headers: auth(outsider.id),
    })
    expect(restForeign.status).toBe(403)
    const mcpForeign = await callMcp(
      other.token,
      rpc("issue.list", { projectId })
    )
    expect(mcpForeign.status).toBe(403)
  })

  test("viewer reads match MCP reads (200 both)", async () => {
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    await expectParity(
      await restList("", viewer.id),
      await mcpList({ projectId })
    )
  })

  test("issue.list without a projectId returns 400", async () => {
    const res = await mcpList({})
    expect(res.status).toBe(400)
  })
})

describe("mcp issue.get parity", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let token: string
  let projectId: string
  let statusId: string
  let identifier: string
  let rowId: string

  async function callMcp(tokenValue: string | null, body: unknown) {
    return app.request("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tokenValue ? { authorization: `Bearer ${tokenValue}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  async function expectGetParity(ref: string, expectedStatus = 200) {
    const rest = await app.request(`/api/issues/${ref}`, {
      headers: auth(member.id),
    })
    const viaMcp = await callMcp(token, rpc("issue.get", { ref }))
    expect(rest.status).toBe(expectedStatus)
    expect(viaMcp.status).toBe(expectedStatus)
    if (expectedStatus === 200) {
      const restBody = await rest.json()
      const mcpBody = await viaMcp.json()
      expect(mcpBody).toMatchObject({ jsonrpc: "2.0", id: 1 })
      expect(mcpBody.result).toEqual(restBody)
    }
  }

  beforeEach(async () => {
    app = setup().app
    ;({ workspaceId, token } = await seedWorkspace(app))
    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    projectId = (await project.json()).id
    const status = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Backlog", category: "Unstarted" }),
    })
    statusId = (await status.json()).id
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
    const issue = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ title: "Fix login", statusId }),
    })
    ;({ identifier, id: rowId } = await issue.json())
  })

  test("issue.get resolves the human identifier like REST", async () => {
    expect(identifier).toBe("WEB-1")
    await expectGetParity("WEB-1")
  })

  test("issue.get is case-insensitive and resolves row ids", async () => {
    await expectGetParity("web-1")
    await expectGetParity(rowId)
  })

  test("issue.get denials match REST: unknown 404, foreign 403, anon 401", async () => {
    await expectGetParity("WEB-999", 404)

    const other = await seedWorkspace(app)
    const restForeign = await app.request(`/api/issues/${identifier}`, {
      headers: auth(outsider.id),
    })
    expect(restForeign.status).toBe(403)
    const mcpForeign = await callMcp(
      other.token,
      rpc("issue.get", { ref: identifier })
    )
    expect(mcpForeign.status).toBe(403)

    const restAnon = await app.request(`/api/issues/${identifier}`)
    const mcpAnon = await callMcp(null, rpc("issue.get", { ref: identifier }))
    expect(restAnon.status).toBe(401)
    expect(mcpAnon.status).toBe(401)
  })

  test("issue.get without a ref returns 400", async () => {
    const res = await callMcp(token, rpc("issue.get", {}))
    expect(res.status).toBe(400)
  })
})

describe("mcp issue.create and issue.update parity", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let token: string
  let projectId: string
  let statusId: string

  async function callMcp(tokenValue: string | null, body: unknown) {
    return app.request("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(tokenValue ? { authorization: `Bearer ${tokenValue}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  async function restCreate(as: string | null, body: unknown) {
    return app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(as ? auth(as) : {}),
      },
      body: JSON.stringify(body),
    })
  }

  async function restPatch(ref: string, as: string | null, body: unknown) {
    return app.request(`/api/issues/${ref}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(as ? auth(as) : {}),
      },
      body: JSON.stringify(body),
    })
  }

  async function expectWriteParity(
    restRes: Response,
    mcpRes: Response,
    expectedStatus: number
  ) {
    expect(restRes.status).toBe(expectedStatus)
    expect(mcpRes.status).toBe(expectedStatus)
    if (expectedStatus === 200 || expectedStatus === 201) {
      const restBody = await restRes.json()
      const mcpBody = await mcpRes.json()
      expect(mcpBody).toMatchObject({ jsonrpc: "2.0", id: 1 })
      expect(mcpBody.result).toMatchObject({
        identifier: restBody.identifier,
        title: restBody.title,
      })
    }
  }

  beforeEach(async () => {
    app = setup().app
    ;({ workspaceId, token } = await seedWorkspace(app))
    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    projectId = (await project.json()).id
    const status = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Backlog", category: "Unstarted" }),
    })
    statusId = (await status.json()).id
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
  })

  test("issue.create matches REST (201 with KEY-N identifier)", async () => {
    const body = { title: "Fix login", statusId, priority: "High" }
    const restRes = await restCreate(member.id, body)
    expect(restRes.status).toBe(201)
    const restBody = (await restRes.json()) as { identifier: string }
    expect(restBody.identifier).toBe("WEB-1")

    // A second creation through MCP consumes the next sequence number, so
    // parity here is semantic (same shape, next identifier), not identical.
    const mcpRes = await callMcp(
      token,
      rpc("issue.create", { projectId, ...body })
    )
    expect(mcpRes.status).toBe(201)
    const mcpBody = (await mcpRes.json()) as {
      result: { identifier: string; title: string; projectId: string }
    }
    expect(mcpBody).toMatchObject({ jsonrpc: "2.0", id: 1 })
    expect(mcpBody.result).toMatchObject({
      identifier: "WEB-2",
      title: "Fix login",
      projectId,
    })
  })

  test("issue.create validation matches REST (400s)", async () => {
    await expectWriteParity(
      await restCreate(member.id, { title: " ", statusId }),
      await callMcp(
        token,
        rpc("issue.create", { projectId, title: " ", statusId })
      ),
      400
    )
    const bogus = "00000000-0000-0000-0000-000000000000"
    await expectWriteParity(
      await restCreate(member.id, { title: "Bad", statusId: bogus }),
      await callMcp(
        token,
        rpc("issue.create", { projectId, title: "Bad", statusId: bogus })
      ),
      400
    )
  })

  test("issue.create denials match REST: anon 401, foreign project 403", async () => {
    const body = { title: "Fix login", statusId }
    await expectWriteParity(
      await restCreate(null, body),
      await callMcp(null, rpc("issue.create", { projectId, ...body })),
      401
    )
    const other = await seedWorkspace(app)
    const restForeign = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(outsider.id) },
      body: JSON.stringify(body),
    })
    expect(restForeign.status).toBe(403)
    const mcpForeign = await callMcp(
      other.token,
      rpc("issue.create", { projectId, ...body })
    )
    expect(mcpForeign.status).toBe(403)
  })

  test("viewer is read-only via REST while the Member-level token writes", async () => {
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    const body = { title: "Fix login", statusId }
    expect((await restCreate(viewer.id, body)).status).toBe(403)
    const viaMcp = await callMcp(
      token,
      rpc("issue.create", { projectId, ...body })
    )
    expect(viaMcp.status).toBe(201)
  })

  test("issue.update matches REST (title, status, archive)", async () => {
    const seeded = (await (
      await restCreate(member.id, { title: "Fix login", statusId })
    ).json()) as { identifier: string }
    const done = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Shipped", category: "Completed" }),
    })
    const doneId = ((await done.json()) as { id: string }).id

    await expectWriteParity(
      await restPatch(seeded.identifier, member.id, {
        title: "Fix login faster",
      }),
      await callMcp(
        token,
        rpc("issue.update", {
          ref: seeded.identifier,
          title: "Fix login faster",
        })
      ),
      200
    )
    await expectWriteParity(
      await restPatch(seeded.identifier, member.id, { statusId: doneId }),
      await callMcp(
        token,
        rpc("issue.update", { ref: seeded.identifier, statusId: doneId })
      ),
      200
    )
    await expectWriteParity(
      await restPatch(seeded.identifier, member.id, { archived: true }),
      await callMcp(
        token,
        rpc("issue.update", { ref: seeded.identifier, archived: true })
      ),
      200
    )
  })

  test("issue.update validation matches REST: blank title and foreign status are 400", async () => {
    const seeded = (await (
      await restCreate(member.id, { title: "Fix login", statusId })
    ).json()) as { identifier: string }
    await expectWriteParity(
      await restPatch(seeded.identifier, member.id, { title: "  " }),
      await callMcp(
        token,
        rpc("issue.update", { ref: seeded.identifier, title: "  " })
      ),
      400
    )
    const bogus = "00000000-0000-0000-0000-000000000000"
    await expectWriteParity(
      await restPatch(seeded.identifier, member.id, { statusId: bogus }),
      await callMcp(
        token,
        rpc("issue.update", { ref: seeded.identifier, statusId: bogus })
      ),
      400
    )
  })

  test("issue.update denials match REST: unknown 404, viewer 403, anon 401", async () => {
    const seeded = (await (
      await restCreate(member.id, { title: "Fix login", statusId })
    ).json()) as { identifier: string }
    await expectWriteParity(
      await restPatch("WEB-999", member.id, { title: "x" }),
      await callMcp(token, rpc("issue.update", { ref: "WEB-999", title: "x" })),
      404
    )
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(
      (await restPatch(seeded.identifier, viewer.id, { title: "Sneaky" }))
        .status
    ).toBe(403)
    const viewerMcp = await callMcp(
      token,
      rpc("issue.update", { ref: seeded.identifier, title: "Sneaky" })
    )
    expect(viewerMcp.status).toBe(200)
    await expectWriteParity(
      await restPatch(seeded.identifier, null, { title: "x" }),
      await callMcp(
        null,
        rpc("issue.update", { ref: seeded.identifier, title: "x" })
      ),
      401
    )
  })

  test("issue.update keeps the identifier immutable on project move", async () => {
    const seeded = (await (
      await restCreate(member.id, { title: "Fix login", statusId })
    ).json()) as { identifier: string }
    const other = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Api", key: "API" }),
    })
    const otherId = ((await other.json()) as { id: string }).id
    const targetStatus = await app.request(
      `/api/projects/${otherId}/statuses`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Triage", category: "Unstarted" }),
      }
    )
    const targetStatusId = ((await targetStatus.json()) as { id: string }).id
    const viaMcp = await callMcp(
      token,
      rpc("issue.update", {
        ref: seeded.identifier,
        projectId: otherId,
        statusId: targetStatusId,
      })
    )
    expect(viaMcp.status).toBe(200)
    const body = (await viaMcp.json()).result as {
      identifier: string
      projectId: string
    }
    expect(body.identifier).toBe("WEB-1")
    expect(body.projectId).toBe(otherId)
  })
})
