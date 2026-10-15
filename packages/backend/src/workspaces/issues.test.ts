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

describe("issue creation", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let projectId: string
  let statusId: string

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

  function createIssue(userId: string | undefined, body: unknown) {
    return app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify(body),
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
    // T2: every new project arrives seeded; this describe wants a clean one.
    await clearSeededTracker(fresh.store, projectId)
    const status = await app.request(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Backlog", category: "Unstarted" }),
    })
    statusId = (await status.json()).id
    await joinAsMember()
  })

  test("member creates an issue with KEY-N identifier", async () => {
    const res = await createIssue(member.id, {
      title: "Fix login",
      description: "Session expires too fast",
      statusId,
      priority: "High",
      assigneeId: member.id,
      dueDate: "2026-11-01T00:00:00.000Z",
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.identifier).toBe("WEB-7")
    expect(body).toMatchObject({
      projectId,
      number: 7,
      title: "Fix login",
      description: "Session expires too fast",
      statusId,
      priority: "High",
      assigneeId: member.id,
    })
  })

  test("numbers increment per project from the sequence", async () => {
    await createIssue(member.id, { title: "One", statusId })
    const res = await createIssue(member.id, { title: "Two", statusId })
    expect(res.status).toBe(201)
    expect((await res.json()).identifier).toBe("WEB-8")
  })

  test("unassigned (no assignee) is allowed", async () => {
    const res = await createIssue(member.id, { title: "Unowned", statusId })
    expect(res.status).toBe(201)
    expect((await res.json()).assigneeId).toBeNull()
  })

  test("blank title returns 400", async () => {
    const res = await createIssue(member.id, { title: " ", statusId })
    expect(res.status).toBe(400)
  })

  test("unknown or foreign status returns 400", async () => {
    const missing = await createIssue(member.id, {
      title: "Bad status",
      statusId: "00000000-0000-0000-0000-000000000000",
    })
    expect(missing.status).toBe(400)
  })

  test("invalid priority returns 400", async () => {
    const res = await createIssue(member.id, {
      title: "Bad priority",
      statusId,
      priority: "Critical",
    })
    expect(res.status).toBe(400)
  })

  test("assignee must be a workspace member (400 otherwise)", async () => {
    const res = await createIssue(member.id, {
      title: "Bad assignee",
      statusId,
      assigneeId: outsider.id,
    })
    expect(res.status).toBe(400)
  })

  test("creating on an unknown project returns 404", async () => {
    const res = await app.request(
      "/api/projects/00000000-0000-0000-0000-000000000000/issues",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ title: "Lost", statusId }),
      }
    )
    expect(res.status).toBe(404)
  })

  test("viewer cannot create (403); outsider 403; anonymous 401", async () => {
    const grant = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(grant.status).toBe(201)

    for (const userId of [viewer.id, outsider.id]) {
      const res = await createIssue(userId, { title: "Nope", statusId })
      expect(res.status).toBe(403)
    }
    expect(
      (await createIssue(undefined, { title: "Nope", statusId })).status
    ).toBe(401)
  })
})

describe("issue read and lifecycle", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
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

  async function seedIssue(title = "Fix login") {
    const res = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ title, statusId: backlogId, priority: "High" }),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { id: string; identifier: string }
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
    // T2: every new project arrives seeded; this describe wants a clean one.
    await clearSeededTracker(fresh.store, projectId)
    for (const [name, category] of [
      ["Backlog", "Unstarted"],
      ["Shipped", "Completed"],
    ] as const) {
      const created = await app.request(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name, category }),
      })
      expect(created.status).toBe(201)
      const body = (await created.json()) as { id: string }
      if (name === "Backlog") backlogId = body.id
      else doneId = body.id
    }
    await joinAsMember()
  })

  test("GET /api/issues/WEB-7 resolves the human identifier", async () => {
    const seeded = await seedIssue()
    const res = await app.request(`/api/issues/${seeded.identifier}`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      identifier: "WEB-7",
      title: "Fix login",
    })
  })

  test("identifier lookup is case-insensitive; unknown returns 404", async () => {
    await seedIssue()
    const lower = await app.request("/api/issues/web-7", {
      headers: auth(member.id),
    })
    expect(lower.status).toBe(200)
    const missing = await app.request("/api/issues/WEB-999", {
      headers: auth(member.id),
    })
    expect(missing.status).toBe(404)
  })

  test("viewer can read; outsider 403; anonymous 401", async () => {
    const seeded = await seedIssue()
    const grant = await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    expect(grant.status).toBe(201)

    const asViewer = await app.request(`/api/issues/${seeded.identifier}`, {
      headers: auth(viewer.id),
    })
    expect(asViewer.status).toBe(200)
    expect(
      (
        await app.request(`/api/issues/${seeded.identifier}`, {
          headers: auth(outsider.id),
        })
      ).status
    ).toBe(403)
    expect((await app.request(`/api/issues/${seeded.identifier}`)).status).toBe(
      401
    )
  })

  test("completing the lifecycle Unstarted to Completed works through PATCH", async () => {
    const seeded = await seedIssue()
    const res = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ statusId: doneId }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      identifier: "WEB-7",
      statusId: doneId,
    })
  })

  test("PATCH with a foreign status returns 400", async () => {
    const seeded = await seedIssue()
    const res = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({
        statusId: "00000000-0000-0000-0000-000000000000",
      }),
    })
    expect(res.status).toBe(400)
  })

  test("PATCH with a blank title returns 400", async () => {
    const seeded = await seedIssue()
    const res = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ title: "  " }),
    })
    expect(res.status).toBe(400)
  })

  test("viewer cannot PATCH (403); anonymous gets 401", async () => {
    const seeded = await seedIssue()
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    const denied = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(viewer.id) },
      body: JSON.stringify({ title: "Sneaky" }),
    })
    expect(denied.status).toBe(403)
    const anonymous = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Sneaky" }),
    })
    expect(anonymous.status).toBe(401)
  })

  test("identifier is immutable when the issue moves between projects", async () => {
    const seeded = await seedIssue()
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

    const moved = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ projectId: otherId, statusId: targetStatusId }),
    })
    expect(moved.status).toBe(200)
    const body = (await moved.json()) as {
      identifier: string
      projectId: string
      number: number
    }
    expect(body.identifier).toBe("WEB-7")
    expect(body.projectId).toBe(otherId)

    const reread = await app.request(`/api/issues/${seeded.identifier}`, {
      headers: auth(member.id),
    })
    expect(((await reread.json()) as { projectId: string }).projectId).toBe(
      otherId
    )
  })

  test("moving without a status in the target project returns 400", async () => {
    const seeded = await seedIssue()
    const other = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Api", key: "API" }),
    })
    const otherId = ((await other.json()) as { id: string }).id
    const moved = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ projectId: otherId }),
    })
    expect(moved.status).toBe(400)
  })

  test("archiving hides the issue from the default list", async () => {
    const seeded = await seedIssue()
    const archived = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ archived: true }),
    })
    expect(archived.status).toBe(200)

    const listed = await app.request(`/api/projects/${projectId}/issues`, {
      headers: auth(member.id),
    })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([])

    const withArchived = await app.request(
      `/api/projects/${projectId}/issues?archived=true`,
      { headers: auth(member.id) }
    )
    expect(
      ((await withArchived.json()) as { identifier: string }[]).map(
        (i) => i.identifier
      )
    ).toEqual(["WEB-7"])
  })

  test("deleting a status that holds a real issue is blocked", async () => {
    await seedIssue()
    const res = await app.request(
      `/api/projects/${projectId}/statuses/${backlogId}`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(res.status).toBe(409)
  })

  test("project key locks once a real issue exists", async () => {
    await seedIssue()
    const res = await app.request(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ key: "NEW" }),
    })
    expect(res.status).toBe(409)
  })
})

describe("issue list filtering", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
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

  async function createIssue(body: Record<string, unknown>) {
    const res = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { identifier: string }
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
    // T2: every new project arrives seeded; this describe wants a clean one.
    await clearSeededTracker(fresh.store, projectId)
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
    await createIssue({
      title: "Fix login",
      statusId: backlogId,
      priority: "High",
      assigneeId: member.id,
      labels: ["bug"],
    })
    await createIssue({
      title: "Ship homepage",
      statusId: doneId,
      priority: "Low",
      labels: ["feature"],
    })
    await createIssue({
      title: "Fix logout",
      statusId: backlogId,
      priority: "Urgent",
      labels: ["bug", "auth"],
    })
  })

  test("unfiltered list returns every issue in number order", async () => {
    expect(await listIds()).toEqual(["WEB-7", "WEB-8", "WEB-9"])
  })

  test("filtering by status narrows the list", async () => {
    expect(await listIds(`?status=${backlogId}`)).toEqual(["WEB-7", "WEB-9"])
    expect(await listIds(`?status=${doneId}`)).toEqual(["WEB-8"])
  })

  test("filtering by priority narrows the list", async () => {
    expect(await listIds("?priority=Urgent")).toEqual(["WEB-9"])
    expect(await listIds("?priority=High&priority=Low")).toEqual([
      "WEB-7",
      "WEB-8",
    ])
  })

  test("filtering by assignee narrows the list; none finds unassigned", async () => {
    expect(await listIds(`?assignee=${member.id}`)).toEqual(["WEB-7"])
    expect(await listIds("?assignee=none")).toEqual(["WEB-8", "WEB-9"])
  })

  test("filtering by label requires every label", async () => {
    expect(await listIds("?label=bug")).toEqual(["WEB-7", "WEB-9"])
    expect(await listIds("?label=bug&label=auth")).toEqual(["WEB-9"])
  })

  test("text search matches identifier or title", async () => {
    expect(await listIds("?q=fix")).toEqual(["WEB-7", "WEB-9"])
    expect(await listIds("?q=WEB-8")).toEqual(["WEB-8"])
    expect(await listIds("?q=homepage")).toEqual(["WEB-8"])
  })

  test("combined filters intersect", async () => {
    expect(await listIds(`?status=${backlogId}&priority=Urgent`)).toEqual([
      "WEB-9",
    ])
  })

  test("viewer can list; outsider 403; anonymous 401", async () => {
    await app.request(`/api/projects/${projectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
    const asViewer = await app.request(`/api/projects/${projectId}/issues`, {
      headers: auth(viewer.id),
    })
    expect(asViewer.status).toBe(200)
    expect(
      ((await asViewer.json()) as { identifier: string }[]).map(
        (i) => i.identifier
      )
    ).toEqual(["WEB-7", "WEB-8", "WEB-9"])
    expect(
      (
        await app.request(`/api/projects/${projectId}/issues`, {
          headers: auth(outsider.id),
        })
      ).status
    ).toBe(403)
    expect(
      (await app.request(`/api/projects/${projectId}/issues`)).status
    ).toBe(401)
  })

  test("moved issues leave the old project list and join the new one", async () => {
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
    const moved = await app.request("/api/issues/WEB-7", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ projectId: otherId, statusId: targetStatusId }),
    })
    expect(moved.status).toBe(200)

    expect(await listIds()).toEqual(["WEB-8", "WEB-9"])
    const otherList = await app.request(
      `/api/projects/${otherId}/issues?status=${targetStatusId}`,
      {
        headers: auth(member.id),
      }
    )
    expect(
      ((await otherList.json()) as { identifier: string }[]).map(
        (i) => i.identifier
      )
    ).toEqual(["WEB-7"])
  })
})
