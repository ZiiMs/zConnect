import { beforeEach, describe, expect, test } from "bun:test"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
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

/**
 * A Viewer is a grant, not a membership: one project is readable, the rest
 * of the workspace is not, by id or through the project list (ticket #26).
 */
describe("viewer project scoping", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let grantedProjectId: string
  let otherProjectId: string
  let otherIssueIdentifier: string

  beforeEach(async () => {
    const fresh = setup()
    app = fresh.app
    const workspace = await app.request("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Acme" }),
    })
    workspaceId = (await workspace.json()).id

    const granted = await app.request(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Granted", key: "GRA" }),
      }
    )
    grantedProjectId = (await granted.json()).id
    const other = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ name: "Other", key: "OTH" }),
    })
    const otherProject = await other.json()
    otherProjectId = otherProject.id

    const statuses = await app.request(
      `/api/projects/${otherProjectId}/statuses`,
      { headers: auth(owner.id) }
    )
    const [status] = await statuses.json()
    const issue = await app.request(`/api/projects/${otherProjectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ title: "Secret", statusId: status.id }),
    })
    otherIssueIdentifier = (await issue.json()).identifier

    await app.request(`/api/projects/${grantedProjectId}/viewers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ userId: viewer.id }),
    })
  })

  test("the project list shows a Viewer only the granted project", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      headers: auth(viewer.id),
    })
    expect(res.status).toBe(200)
    const projects = await res.json()
    expect(projects.map((p: { id: string }) => p.id)).toEqual([
      grantedProjectId,
    ])
  })

  test("the granted project is readable by id", async () => {
    const res = await app.request(`/api/projects/${grantedProjectId}`, {
      headers: auth(viewer.id),
    })
    expect(res.status).toBe(200)
  })

  test("a non-granted project is forbidden by id", async () => {
    const res = await app.request(`/api/projects/${otherProjectId}`, {
      headers: auth(viewer.id),
    })
    expect(res.status).toBe(403)
  })

  test("a non-granted project's issues and issue detail are forbidden", async () => {
    const list = await app.request(`/api/projects/${otherProjectId}/issues`, {
      headers: auth(viewer.id),
    })
    expect(list.status).toBe(403)

    const detail = await app.request(`/api/issues/${otherIssueIdentifier}`, {
      headers: auth(viewer.id),
    })
    expect(detail.status).toBe(403)
  })

  test("the workspace list still reports the synthetic Viewer role", async () => {
    const res = await app.request("/api/workspaces", {
      headers: auth(viewer.id),
    })
    const workspaces = await res.json()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      id: workspaceId,
      role: "Viewer",
    })
  })

  test("a workspace Member keeps seeing every project", async () => {
    const res = await app.request(`/api/workspaces/${workspaceId}/projects`, {
      headers: auth(owner.id),
    })
    const projects = await res.json()
    expect(projects).toHaveLength(2)
  })
})
