import { beforeEach, describe, expect, test } from "bun:test"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import { createMemoryWorkspaceStore } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [outsider.id]: outsider,
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

interface SeededIssue {
  id: string
  identifier: string
  parentId: string | null
}

describe("issue subtasks", () => {
  let app: ReturnType<typeof setup>["app"]
  let workspaceId: string
  let projectId: string
  let otherProjectId: string
  /** An Unstarted-category status: the "open" status most tests move issues around. */
  let backlogId: string
  let backlogCategoryId: string
  let inProgressId: string
  let doneId: string
  let canceledId: string
  let duplicateId: string
  let otherBacklogId: string

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

  async function createIssue(
    project: string,
    body: Record<string, unknown>
  ): Promise<SeededIssue> {
    const res = await app.request(`/api/projects/${project}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as SeededIssue
  }

  async function patchIssue(identifier: string, body: Record<string, unknown>) {
    return app.request(`/api/issues/${identifier}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth(member.id) },
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
      for (const [statusName, category] of [
        ["Backlog", "Backlog"],
        ["Todo", "Unstarted"],
        ["In Progress", "In Progress"],
        ["Shipped", "Completed"],
        ["Canceled", "Canceled"],
        ["Duplicate", "Duplicate"],
      ] as const) {
        const created = await app.request(`/api/projects/${id}/statuses`, {
          method: "POST",
          headers: { "content-type": "application/json", ...auth(owner.id) },
          body: JSON.stringify({ name: statusName, category }),
        })
        const status = ((await created.json()) as { id: string }).id
        if (key === "WEB") {
          projectId = id
          if (statusName === "Backlog") backlogCategoryId = status
          else if (statusName === "Todo") backlogId = status
          else if (statusName === "In Progress") inProgressId = status
          else if (statusName === "Shipped") doneId = status
          else if (statusName === "Canceled") canceledId = status
          else duplicateId = status
        } else {
          otherProjectId = id
          if (statusName === "Todo") otherBacklogId = status
        }
      }
    }
    await joinAsMember()
  })

  test("creates a subtask linked to its parent", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    expect(parent.parentId).toBeNull()
    const child = await createIssue(projectId, {
      title: "Child",
      statusId: backlogId,
      parentId: parent.id,
    })
    expect(child.parentId).toBe(parent.id)

    const reread = await app.request(`/api/issues/${child.identifier}`, {
      headers: auth(member.id),
    })
    expect(((await reread.json()) as SeededIssue).parentId).toBe(parent.id)
  })

  test("links to a parent at update time and unlinks with null", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    const child = await createIssue(projectId, {
      title: "Child",
      statusId: backlogId,
    })
    const linked = await patchIssue(child.identifier, { parentId: parent.id })
    expect(linked.status).toBe(200)
    expect(((await linked.json()) as SeededIssue).parentId).toBe(parent.id)

    const unlinked = await patchIssue(child.identifier, { parentId: null })
    expect(unlinked.status).toBe(200)
    expect(((await unlinked.json()) as SeededIssue).parentId).toBeNull()
  })

  test("rejects missing, cross-project, self and nested parents", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    const child = await createIssue(projectId, {
      title: "Child",
      statusId: backlogId,
      parentId: parent.id,
    })
    const other = await createIssue(otherProjectId, {
      title: "Other",
      statusId: otherBacklogId,
    })

    // Creating with a missing or cross-project parent fails the same way.
    for (const parentId of ["00000000-0000-0000-0000-000000000000", other.id]) {
      const bad = await app.request(`/api/projects/${projectId}/issues`, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({
          title: "Bad link",
          statusId: backlogId,
          parentId,
        }),
      })
      expect(bad.status).toBe(400)
    }

    const missing = await patchIssue(parent.identifier, {
      parentId: "00000000-0000-0000-0000-000000000000",
    })
    expect(missing.status).toBe(400)
    const crossProject = await patchIssue(parent.identifier, {
      parentId: other.id,
    })
    expect(crossProject.status).toBe(400)
    const self = await patchIssue(child.identifier, { parentId: child.id })
    expect(self.status).toBe(400)
    // A subtask (child) cannot itself become a parent: grandchild fails.
    const grandchild = await app.request(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({
        title: "Grandchild",
        statusId: backlogId,
        parentId: child.id,
      }),
    })
    expect(grandchild.status).toBe(400)
  })

  test("rejects making an issue with subtasks into a subtask", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    await createIssue(projectId, {
      title: "Child",
      statusId: backlogId,
      parentId: parent.id,
    })
    const sibling = await createIssue(projectId, {
      title: "Sibling",
      statusId: backlogId,
    })
    const res = await patchIssue(parent.identifier, { parentId: sibling.id })
    expect(res.status).toBe(400)
  })

  test("lists direct subtasks in number order", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    await createIssue(projectId, {
      title: "Child b",
      statusId: backlogId,
      parentId: parent.id,
    })
    await createIssue(projectId, {
      title: "Child a",
      statusId: backlogId,
      parentId: parent.id,
    })
    const res = await app.request(`/api/issues/${parent.identifier}/subtasks`, {
      headers: auth(member.id),
    })
    expect(res.status).toBe(200)
    expect(
      ((await res.json()) as { identifier: string }[]).map((i) => i.identifier)
    ).toEqual(["WEB-2", "WEB-3"])

    expect(
      (
        await app.request("/api/issues/WEB-999/subtasks", {
          headers: auth(member.id),
        })
      ).status
    ).toBe(404)
    expect(
      (
        await app.request(`/api/issues/${parent.identifier}/subtasks`, {
          headers: auth(outsider.id),
        })
      ).status
    ).toBe(403)
  })

  test("completing a parent with open subtasks warns but allows it", async () => {
    for (const [category, statusId] of [
      ["Completed", doneId],
      ["Canceled", canceledId],
      ["Duplicate", duplicateId],
    ] as const) {
      const parent = await createIssue(projectId, {
        title: `Parent (${category})`,
        statusId: backlogId,
      })
      await createIssue(projectId, {
        title: `Open child (${category})`,
        statusId: backlogId,
        parentId: parent.id,
      })
      const res = await patchIssue(parent.identifier, { statusId })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        statusId: string
        warnings: string[]
      }
      expect(body.statusId).toBe(statusId)
      expect(body.warnings).toHaveLength(1)
      expect(body.warnings[0]).toMatch(/open subtask/i)
    }
  })

  test("moving to a terminal status with subtasks already done warns nothing", async () => {
    for (const [category, childStatusId] of [
      ["Completed", doneId],
      ["Canceled", canceledId],
      ["Duplicate", duplicateId],
    ] as const) {
      const parent = await createIssue(projectId, {
        title: `Parent with ${category} child`,
        statusId: backlogId,
      })
      const child = await createIssue(projectId, {
        title: `Done child (${category})`,
        statusId: backlogId,
        parentId: parent.id,
      })
      await patchIssue(child.identifier, { statusId: childStatusId })
      const res = await patchIssue(parent.identifier, { statusId: doneId })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { warnings: string[] }).warnings).toEqual(
        []
      )
    }
  })

  test("moving with open subtasks to a non-terminal status warns nothing", async () => {
    for (const [category, statusId] of [
      ["Backlog", backlogCategoryId],
      ["Unstarted", backlogId],
      ["In Progress", inProgressId],
    ] as const) {
      const parent = await createIssue(projectId, {
        title: `Parent (${category})`,
        statusId: backlogId,
      })
      await createIssue(projectId, {
        title: `Open child (${category})`,
        statusId: backlogId,
        parentId: parent.id,
      })
      const res = await patchIssue(parent.identifier, { statusId })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        statusId: string
        warnings: string[]
      }
      expect(body.statusId).toBe(statusId)
      expect(body.warnings).toEqual([])
    }
  })

  test("an unrelated update carries no warnings", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    await createIssue(projectId, {
      title: "Open child",
      statusId: backlogId,
      parentId: parent.id,
    })
    const renamed = await patchIssue(parent.identifier, { title: "Renamed" })
    expect(renamed.status).toBe(200)
    expect(((await renamed.json()) as { warnings: string[] }).warnings).toEqual(
      []
    )
  })

  test("cannot move a subtask or a parent to another project", async () => {
    const parent = await createIssue(projectId, {
      title: "Parent",
      statusId: backlogId,
    })
    const child = await createIssue(projectId, {
      title: "Child",
      statusId: backlogId,
      parentId: parent.id,
    })
    expect(
      (
        await patchIssue(child.identifier, {
          projectId: otherProjectId,
          statusId: otherBacklogId,
        })
      ).status
    ).toBe(400)
    expect(
      (
        await patchIssue(parent.identifier, {
          projectId: otherProjectId,
          statusId: otherBacklogId,
        })
      ).status
    ).toBe(400)
  })
})
