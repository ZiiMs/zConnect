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

describe("workspace label registry", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let otherWorkspaceId: string
  let projectId: string

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

  function createLabel(
    wsId: string,
    userId: string | undefined,
    body: unknown
  ) {
    return app.request(`/api/workspaces/${wsId}/labels`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
    })
  }

  function listLabels(wsId: string, userId?: string) {
    return app.request(`/api/workspaces/${wsId}/labels`, {
      headers: auth(userId),
    })
  }

  beforeEach(async () => {
    const fresh = setup()
    app = fresh.app
    for (const name of ["Acme", "Other"]) {
      const workspace = await app.request("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name }),
      })
      const id = ((await workspace.json()) as { id: string }).id
      if (name === "Acme") workspaceId = id
      else otherWorkspaceId = id
    }
    const project = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Web", key: "WEB" }),
      }
    )
    projectId = ((await project.json()) as { id: string }).id
    expect(projectId).toBeString()
    await joinAsMember()
  })

  test("member creates a label with name and color", async () => {
    const res = await createLabel(workspaceId, member.id, {
      name: "bug",
      color: "#ef4444",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      workspaceId,
      name: "bug",
      color: "#ef4444",
    })
  })

  test("color defaults when omitted", async () => {
    const res = await createLabel(workspaceId, member.id, { name: "bug" })
    expect(res.status).toBe(201)
    expect((await res.json()) as { color: string }).toMatchObject({
      color: "#94a3b8",
    })
  })

  test("blank name or bad color returns 400", async () => {
    for (const body of [
      { name: " ", color: "#ef4444" },
      { name: "bug", color: "red" },
      { name: "bug", color: "#fff" },
      { name: "bug", color: "#gggggg" },
    ]) {
      const res = await createLabel(workspaceId, member.id, body)
      expect(res.status).toBe(400)
    }
  })

  test("duplicate names conflict case-insensitively", async () => {
    const first = await createLabel(workspaceId, member.id, { name: "bug" })
    expect(first.status).toBe(201)
    const second = await createLabel(workspaceId, member.id, { name: "Bug" })
    expect(second.status).toBe(409)
  })

  test("labels list per workspace in name order", async () => {
    await createLabel(workspaceId, member.id, { name: "feature" })
    await createLabel(workspaceId, member.id, { name: "bug" })
    const res = await listLabels(workspaceId, member.id)
    expect(res.status).toBe(200)
    expect(
      ((await res.json()) as { name: string }[]).map((l) => l.name)
    ).toEqual(["bug", "feature"])

    const other = await listLabels(otherWorkspaceId, owner.id)
    expect(other.status).toBe(200)
    expect(await other.json()).toEqual([])
  })

  test("viewer can list but cannot create (403); outsider 403; anonymous 401", async () => {
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect((await listLabels(workspaceId, viewer.id)).status).toBe(200)
    expect(
      (await createLabel(workspaceId, viewer.id, { name: "bug" })).status
    ).toBe(403)
    expect(
      (await createLabel(workspaceId, outsider.id, { name: "bug" })).status
    ).toBe(403)
    expect(
      (await createLabel(workspaceId, undefined, { name: "bug" })).status
    ).toBe(401)
    expect((await listLabels(workspaceId, outsider.id)).status).toBe(403)
  })

  test("rename and recolor through PATCH; conflicts and unknowns handled", async () => {
    const created = (await (
      await createLabel(workspaceId, member.id, { name: "bug" })
    ).json()) as { id: string }
    await createLabel(workspaceId, member.id, { name: "feature" })

    const renamed = await app.request(
      `/api/workspaces/${workspaceId}/labels/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ name: "defect", color: "#f97316" }),
      }
    )
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({
      name: "defect",
      color: "#f97316",
    })

    const conflict = await app.request(
      `/api/workspaces/${workspaceId}/labels/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ name: "Feature" }),
      }
    )
    expect(conflict.status).toBe(409)

    const missing = await app.request(
      `/api/workspaces/${workspaceId}/labels/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ name: "nope" }),
      }
    )
    expect(missing.status).toBe(404)

    const crossWorkspace = await app.request(
      `/api/workspaces/${otherWorkspaceId}/labels/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "nope" }),
      }
    )
    expect(crossWorkspace.status).toBe(404)
  })

  test("labels support one-level groups, descriptions, counts, and last applied", async () => {
    const parent = (await (
      await createLabel(workspaceId, member.id, {
        name: "Area",
        description: "The part of the product this touches.",
      })
    ).json()) as { id: string }
    const child = (await (
      await createLabel(workspaceId, member.id, {
        name: "Frontend",
        description: "Browser-facing work.",
        parentId: parent.id,
      })
    ).json()) as {
      id: string
      parentId: string | null
      description: string | null
      issueCount: number
      lastAppliedAt: string | null
      createdAt: string
    }
    expect(child).toMatchObject({
      parentId: parent.id,
      description: "Browser-facing work.",
      issueCount: 0,
      lastAppliedAt: null,
    })
    expect(child.createdAt).toBeString()

    const statuses = (await (
      await app.request(`/api/projects/${projectId}/statuses`, {
        headers: auth(member.id),
      })
    ).json()) as { id: string; name: string }[]
    const todo = statuses.find((status) => status.name === "Todo")
    if (!todo) throw new Error("seeded Todo status missing")

    const issue = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({
        title: "Build the label table",
        statusId: todo.id,
        labels: ["Frontend"],
      }),
    })
    expect(issue.status).toBe(201)

    const labels = (await (
      await listLabels(workspaceId, member.id)
    ).json()) as {
      name: string
      parentId: string | null
      issueCount: number
      lastAppliedAt: string | null
    }[]
    expect(labels.find((label) => label.name === "Frontend")).toMatchObject({
      parentId: parent.id,
      issueCount: 1,
    })
    expect(
      labels.find((label) => label.name === "Frontend")?.lastAppliedAt
    ).toBeString()
    expect(labels.find((label) => label.name === "Area")).toMatchObject({
      parentId: null,
      issueCount: 0,
      lastAppliedAt: null,
    })
  })

  test("label groups cannot nest or point at themselves", async () => {
    const area = (await (
      await createLabel(workspaceId, member.id, { name: "Area" })
    ).json()) as { id: string }
    const child = (await (
      await createLabel(workspaceId, member.id, {
        name: "Frontend",
        parentId: area.id,
      })
    ).json()) as { id: string }

    const nested = await createLabel(workspaceId, member.id, {
      name: "Buttons",
      parentId: child.id,
    })
    expect(nested.status).toBe(400)

    const self = await app.request(
      `/api/workspaces/${workspaceId}/labels/${area.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ parentId: area.id }),
      }
    )
    expect(self.status).toBe(400)

    const parentWithChildren = await app.request(
      `/api/workspaces/${workspaceId}/labels/${area.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ parentId: child.id }),
      }
    )
    expect(parentWithChildren.status).toBe(400)
  })

  test("deleting a group promotes its children to top level", async () => {
    const area = (await (
      await createLabel(workspaceId, member.id, { name: "Area" })
    ).json()) as { id: string }
    const child = (await (
      await createLabel(workspaceId, member.id, {
        name: "Frontend",
        parentId: area.id,
      })
    ).json()) as { id: string }

    const deleted = await app.request(
      `/api/workspaces/${workspaceId}/labels/${area.id}`,
      { method: "DELETE", headers: auth(member.id) }
    )
    expect(deleted.status).toBe(204)

    const labels = (await (
      await listLabels(workspaceId, member.id)
    ).json()) as { id: string; parentId: string | null }[]
    expect(labels.find((label) => label.id === child.id)?.parentId).toBeNull()
  })

  test("label DELETE removes it from the registry", async () => {
    const created = (await (
      await createLabel(workspaceId, member.id, { name: "bug" })
    ).json()) as { id: string }
    const deleted = await app.request(
      `/api/workspaces/${workspaceId}/labels/${created.id}`,
      { method: "DELETE", headers: auth(member.id) }
    )
    expect(deleted.status).toBe(204)
    expect(
      (await (await listLabels(workspaceId, member.id)).json()) as unknown[]
    ).toEqual([])

    const again = await app.request(
      `/api/workspaces/${workspaceId}/labels/${created.id}`,
      { method: "DELETE", headers: auth(member.id) }
    )
    expect(again.status).toBe(404)
  })
})
