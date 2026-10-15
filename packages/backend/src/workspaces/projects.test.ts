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

describe("project sequence and status reads", () => {
  let app: ReturnType<typeof setup>["app"]
  let store: ReturnType<typeof setup>["store"]
  let workspaceId: string

  beforeEach(async () => {
    const fresh = setup()
    app = fresh.app
    store = fresh.store
    const created = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    workspaceId = (await created.json()).id
  })

  async function createProject() {
    const res = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Web", key: "WEB" }),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { id: string }
  }

  test("creating a project starts its per-project issue sequence at 1", async () => {
    const { id } = await createProject()
    expect(await store.getNextIssueNumber(id)).toBe(1)
  })

  test("a new project has no statuses", async () => {
    const { id } = await createProject()
    const res = await app.request(`/api/projects/${id}/statuses`, {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  test("getting a project returns it; unknown id returns 404", async () => {
    const { id } = await createProject()
    const res = await app.request(`/api/projects/${id}`, {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, key: "WEB", name: "Web" })

    const missing = await app.request(
      `/api/projects/00000000-0000-0000-0000-000000000000`,
      { headers: auth(owner.id) }
    )
    expect(missing.status).toBe(404)
  })

  test("outsider cannot read a project (403); anonymous gets 401", async () => {
    const { id } = await createProject()
    const denied = await app.request(`/api/projects/${id}`, {
      headers: auth(outsider.id),
    })
    expect(denied.status).toBe(403)
    const anonymous = await app.request(`/api/projects/${id}`)
    expect(anonymous.status).toBe(401)
  })
})

describe("project key editing", () => {
  let app: ReturnType<typeof setup>["app"]
  let store: ReturnType<typeof setup>["store"]
  let workspaceId: string
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

  async function seedIssue() {
    const status = await store.createStatus(projectId, {
      name: "Backlog",
      category: "Unstarted",
    })
    await store.recordIssue(projectId, status.id)
  }

  function patchProject(userId: string | undefined, body: unknown) {
    return app.request(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
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
  })

  test("admin renames a project and edits its key before the first issue", async () => {
    const res = await patchProject(owner.id, { name: "Website", key: "site" })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: projectId,
      name: "Website",
      key: "SITE",
    })
  })

  test("key edit with an invalid shape returns 400", async () => {
    const res = await patchProject(owner.id, { key: "w!" })
    expect(res.status).toBe(400)
  })

  test("key edit after the first issue is locked (409)", async () => {
    await seedIssue()

    const res = await patchProject(owner.id, { key: "NEW" })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(/locked/i)
  })

  test("renaming still works after the first issue", async () => {
    await seedIssue()
    const res = await patchProject(owner.id, { name: "Website" })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: "Website", key: "WEB" })
  })

  test("duplicate key on edit returns 409", async () => {
    await app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Other", key: "OTHER" }),
    })
    const res = await patchProject(owner.id, { key: "other" })
    expect(res.status).toBe(409)
  })

  test("member and viewer cannot edit (403); anonymous gets 401", async () => {
    await joinAsMember()
    const grant = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(grant.status).toBe(201)

    for (const userId of [member.id, viewer.id]) {
      const res = await patchProject(userId, { name: "Sneaky" })
      expect(res.status).toBe(403)
    }
    expect((await patchProject(undefined, { name: "Sneaky" })).status).toBe(401)
  })
})

describe("project statuses", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let projectId: string

  function postStatus(
    userId: string | undefined,
    target: string,
    body: unknown
  ) {
    return app.request(`/api/projects/${target}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
    })
  }

  function patchStatus(
    userId: string | undefined,
    target: string,
    statusId: string,
    body: unknown
  ) {
    return app.request(`/api/projects/${target}/statuses/${statusId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
    })
  }

  async function listStatuses() {
    const res = await app.request(`/api/projects/${projectId}/statuses`, {
      headers: auth(owner.id),
    })
    expect(res.status).toBe(200)
    return (await res.json()) as {
      id: string
      name: string
      category: string
      position: number
    }[]
  }

  beforeEach(async () => {
    const fresh = setup()
    app = fresh.app
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
  })

  test("admin defines ordered statuses across all six categories", async () => {
    // One status per category, in roster order (ADR-0001).
    for (const [name, category] of [
      ["Backlog", "Backlog"],
      ["Triage", "Unstarted"],
      ["In Review", "In Progress"],
      ["Shipped", "Completed"],
      ["Dropped", "Canceled"],
      ["Repeat", "Duplicate"],
    ] as const) {
      const res = await postStatus(owner.id, projectId, { name, category })
      expect(res.status).toBe(201)
    }

    const statuses = await listStatuses()
    expect(statuses.map((s) => [s.name, s.category, s.position])).toEqual([
      ["Backlog", "Backlog", 0],
      ["Triage", "Unstarted", 1],
      ["In Review", "In Progress", 2],
      ["Shipped", "Completed", 3],
      ["Dropped", "Canceled", 4],
      ["Repeat", "Duplicate", 5],
    ])
  })

  test("create status with invalid category or blank name returns 400", async () => {
    const badCategory = await postStatus(owner.id, projectId, {
      name: "Backlog",
      category: "Blocked",
    })
    expect(badCategory.status).toBe(400)
    expect(await badCategory.json()).toEqual({ error: "Invalid status" })
    // The retired three-bucket categories are no longer accepted.
    for (const category of ["Todo", "Done"]) {
      const retired = await postStatus(owner.id, projectId, {
        name: "Old",
        category,
      })
      expect(retired.status).toBe(400)
      expect(await retired.json()).toEqual({ error: "Invalid status" })
    }
    const blankName = await postStatus(owner.id, projectId, {
      name: " ",
      category: "Unstarted",
    })
    expect(blankName.status).toBe(400)
  })

  test("duplicate status name returns 409", async () => {
    await postStatus(owner.id, projectId, {
      name: "Backlog",
      category: "Unstarted",
    })
    const res = await postStatus(owner.id, projectId, {
      name: "Backlog",
      category: "Completed",
    })
    expect(res.status).toBe(409)
  })

  test("member and viewer cannot define statuses (403)", async () => {
    await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })
    const mine = await app.request("/api/invitations", {
      headers: auth(member.id),
    })
    const [{ id: invitationId }] = await mine.json()
    await app.request(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: auth(member.id),
    })
    const grant = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(grant.status).toBe(201)

    for (const userId of [member.id, viewer.id]) {
      const res = await postStatus(userId, projectId, {
        name: "Backlog",
        category: "Unstarted",
      })
      expect(res.status).toBe(403)
    }
    expect(
      (
        await postStatus(undefined, projectId, {
          name: "B",
          category: "Unstarted",
        })
      ).status
    ).toBe(401)
  })

  test("status routes on an unknown project return 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000"
    const listed = await app.request(`/api/projects/${missing}/statuses`, {
      headers: auth(owner.id),
    })
    expect(listed.status).toBe(404)
    const created = await postStatus(owner.id, missing, {
      name: "Backlog",
      category: "Unstarted",
    })
    expect(created.status).toBe(404)
  })

  test("admin renames and recategorizes a status", async () => {
    await postStatus(owner.id, projectId, {
      name: "Backlog",
      category: "Unstarted",
    })
    const [{ id }] = await listStatuses()

    const res = await patchStatus(owner.id, projectId, id, {
      name: "Refinement",
      category: "In Progress",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id,
      name: "Refinement",
      category: "In Progress",
    })
  })

  test("admin reorders a status by position", async () => {
    for (const name of ["First", "Second", "Third"]) {
      await postStatus(owner.id, projectId, { name, category: "Unstarted" })
    }
    const before = await listStatuses()
    const third = before.find((s) => s.name === "Third")
    if (!third) throw new Error("Third status missing")

    const moved = await patchStatus(owner.id, projectId, third.id, {
      position: 0,
    })
    expect(moved.status).toBe(200)

    const after = await listStatuses()
    expect(after.map((s) => s.name)).toEqual(["Third", "First", "Second"])
    expect(after.map((s) => s.position)).toEqual([0, 1, 2])
  })

  test("outsider cannot rename a status (403)", async () => {
    await postStatus(owner.id, projectId, {
      name: "Backlog",
      category: "Unstarted",
    })
    const listed = await app.request(`/api/projects/${projectId}/statuses`, {
      headers: auth(owner.id),
    })
    const [{ id }] = (await listed.json()) as { id: string }[]
    const res = await patchStatus(outsider.id, projectId, id, {
      name: "Sneaky",
    })
    expect(res.status).toBe(403)
  })

  test("updating an unknown or foreign status returns 404", async () => {
    const missing = await patchStatus(
      owner.id,
      projectId,
      "00000000-0000-0000-0000-000000000000",
      { name: "Nope" }
    )
    expect(missing.status).toBe(404)

    const other = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Other", key: "OTHER" }),
    })
    const otherId = ((await other.json()) as { id: string }).id
    await postStatus(owner.id, otherId, {
      name: "Backlog",
      category: "Unstarted",
    })
    const foreign = (
      (await (
        await app.request(`/api/projects/${otherId}/statuses`, {
          headers: auth(owner.id),
        })
      ).json()) as { id: string }[]
    )[0]
    const crossed = await patchStatus(owner.id, projectId, foreign.id, {
      name: "Nope",
    })
    expect(crossed.status).toBe(404)
  })
})

describe("status deletion", () => {
  let app: ReturnType<typeof setup>["app"]
  let store: ReturnType<typeof setup>["store"]
  let workspaceId: string
  let projectId: string

  function deleteStatus(
    userId: string | undefined,
    target: string,
    statusId: string
  ) {
    return app.request(`/api/projects/${target}/statuses/${statusId}`, {
      method: "DELETE",
      headers: auth(userId),
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
  })

  async function defineStatus(name: string, category = "Unstarted") {
    const res = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name, category }),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { id: string }
  }

  test("admin deletes an empty status; remaining order compacts", async () => {
    await defineStatus("Backlog")
    const middle = await defineStatus("In Progress")
    await defineStatus("Done")

    const res = await deleteStatus(owner.id, projectId, middle.id)
    expect(res.status).toBe(204)

    const listed = await app.request(`/api/projects/${projectId}/statuses`, {
      headers: auth(owner.id),
    })
    const names = (
      (await listed.json()) as { name: string; position: number }[]
    ).map((s) => [s.name, s.position])
    expect(names).toEqual([
      ["Backlog", 0],
      ["Done", 1],
    ])
  })

  test("deleting a status that holds issues is blocked with a clear error", async () => {
    const status = await defineStatus("Backlog")
    const empty = await defineStatus("Done")
    await store.recordIssue(projectId, status.id)

    const res = await deleteStatus(owner.id, projectId, status.id)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toMatch(
      /holds issues/i
    )

    const other = await deleteStatus(owner.id, projectId, empty.id)
    expect(other.status).toBe(204)
  })

  test("deleting an unknown or foreign status returns 404", async () => {
    const missing = await deleteStatus(
      owner.id,
      projectId,
      "00000000-0000-0000-0000-000000000000"
    )
    expect(missing.status).toBe(404)
  })

  test("member and viewer cannot delete statuses (403)", async () => {
    await app.request(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ email: member.email, role: "Member" }),
    })
    const mine = await app.request("/api/invitations", {
      headers: auth(member.id),
    })
    const [{ id: invitationId }] = await mine.json()
    await app.request(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: auth(member.id),
    })
    const grant = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(grant.status).toBe(201)

    const status = await defineStatus("Backlog")
    for (const userId of [member.id, viewer.id]) {
      const res = await deleteStatus(userId, projectId, status.id)
      expect(res.status).toBe(403)
    }
    expect((await deleteStatus(undefined, projectId, status.id)).status).toBe(
      401
    )
  })
})
