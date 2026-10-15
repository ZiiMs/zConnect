import { beforeEach, describe, expect, test } from "bun:test"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
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

describe("issue label links", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let projectId: string
  let otherProjectId: string
  let statusId: string
  let otherStatusId: string

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

  async function createIssue(project: string, body: Record<string, unknown>) {
    const res = await app.request(`/api/projects/${project}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as { id: string; identifier: string }
  }

  async function labelNames(wsId: string) {
    const res = await app.request(`/api/workspaces/${wsId}/labels`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    return (await res.json()) as {
      id: string
      name: string
      color: string
    }[]
  }

  async function issueLabels(identifier: string) {
    const res = await app.request(`/api/issues/${identifier}`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    return ((await res.json()) as { labels: string[] }).labels
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
    for (const [name, key] of [
      ["Web", "WEB"],
      ["Api", "API"],
    ] as const) {
      const project = await app.request(
        `/api/workspaces/${workspaceId}/projects`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...auth(owner.id) },
          body: JSON.stringify({ name, key }),
        }
      )
      const id = ((await project.json()) as { id: string }).id
      const created = await app.request(`/api/projects/${id}/statuses`, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ name: "Backlog", category: "Todo" }),
      })
      const status = ((await created.json()) as { id: string }).id
      if (key === "WEB") {
        projectId = id
        statusId = status
      } else {
        otherProjectId = id
        otherStatusId = status
      }
    }
    await joinAsMember()
  })

  test("assigning free-form names auto-creates registry rows", async () => {
    await createIssue(projectId, {
      title: "Fix login",
      statusId,
      labels: ["bug", "auth"],
    })
    expect(await labelNames(workspaceId)).toMatchObject([
      { name: "auth", color: "#94a3b8" },
      { name: "bug", color: "#94a3b8" },
    ])
  })

  test("assigning an existing label reuses its row and color", async () => {
    await app.request(`/api/workspaces/${workspaceId}/labels`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ name: "bug", color: "#ef4444" }),
    })
    await createIssue(projectId, {
      title: "Fix login",
      statusId,
      labels: ["bug"],
    })
    expect(await labelNames(workspaceId)).toMatchObject([
      { name: "bug", color: "#ef4444" },
    ])
  })

  test("labels are workspace-shared across projects with one registry row", async () => {
    await createIssue(projectId, { title: "One", statusId, labels: ["bug"] })
    await createIssue(otherProjectId, {
      title: "Two",
      statusId: otherStatusId,
      labels: ["bug"],
    })
    expect(await labelNames(workspaceId)).toHaveLength(1)
    expect(await issueLabels("WEB-1")).toEqual(["bug"])
    expect(await issueLabels("API-1")).toEqual(["bug"])
  })

  test("updating labels replaces the set; AND filter keeps working", async () => {
    const seeded = await createIssue(projectId, {
      title: "Fix login",
      statusId,
      labels: ["bug"],
    })
    const patched = await app.request(`/api/issues/${seeded.identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ labels: ["feature", "auth"] }),
    })
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { labels: string[] }).labels).toEqual([
      "feature",
      "auth",
    ])

    async function listIds(query: string) {
      const res = await app.request(
        `/api/projects/${projectId}/issues${query}`,
        { headers: auth(member.id) }
      )
      expect(res.status).toBe(200)
      return ((await res.json()) as { identifier: string }[]).map(
        (i) => i.identifier
      )
    }
    expect(await listIds("?label=feature&label=auth")).toEqual(["WEB-1"])
    expect(await listIds("?label=feature&label=bug")).toEqual([])
  })

  test("renaming a label propagates to linked issues", async () => {
    const seeded = await createIssue(projectId, {
      title: "Fix login",
      statusId,
      labels: ["bug"],
    })
    const [row] = await labelNames(workspaceId)
    const renamed = await app.request(
      `/api/workspaces/${workspaceId}/labels/${row?.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ name: "defect" }),
      }
    )
    expect(renamed.status).toBe(200)
    expect(await issueLabels(seeded.identifier)).toEqual(["defect"])

    const res = await app.request(
      `/api/projects/${projectId}/issues?label=defect`,
      { headers: auth(member.id) }
    )
    expect(
      ((await res.json()) as { identifier: string }[]).map((i) => i.identifier)
    ).toEqual(["WEB-1"])
  })

  test("deleting a label scrubs it from linked issues", async () => {
    const seeded = await createIssue(projectId, {
      title: "Fix login",
      statusId,
      labels: ["bug", "feature"],
    })
    const rows = await labelNames(workspaceId)
    const bug = rows.find((l) => l.name === "bug")
    const deleted = await app.request(
      `/api/workspaces/${workspaceId}/labels/${bug?.id}`,
      { method: "DELETE", headers: auth(member.id) }
    )
    expect(deleted.status).toBe(204)
    expect(await issueLabels(seeded.identifier)).toEqual(["feature"])
    expect(await labelNames(workspaceId)).toMatchObject([{ name: "feature" }])
  })
})
