import { beforeEach, describe, expect, test } from "bun:test"
import { createMemoryMailer, type Mailer } from "../lib/mailer.js"
import { createWorkspacesApp } from "./routes.js"
import type { Session } from "./session.js"
import {
  type CreateIssueInput,
  createMemoryWorkspaceStore,
  type Issue,
  type MemoryWorkspaceStoreOptions,
  type MyIssue,
  type Notification,
  type UpdateIssueInput,
  type WorkspaceStore,
} from "./store.js"
import { clearSeededTracker } from "./test-support.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const second = { id: "user-second", email: "second@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const sessions: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [second.id]: second,
  [viewer.id]: viewer,
  [outsider.id]: outsider,
}

const profiles: MemoryWorkspaceStoreOptions["users"] = {
  [owner.id]: { name: "Owner", email: owner.email },
  [member.id]: { name: "Member", email: member.email },
  [second.id]: { name: "Second", email: second.email },
  [viewer.id]: { name: "Viewer", email: viewer.email },
  [outsider.id]: { name: "Outsider", email: outsider.email },
}

interface Fixture {
  app: ReturnType<typeof createWorkspacesApp>
  store: WorkspaceStore
  workspaceId: string
  projectId: string
  backlogId: string
  doneId: string
}

interface NotificationPage {
  notifications: Notification[]
  nextCursor: string | null
  unreadCount: number
}

interface CommentRow {
  id: string
  issueId: string
  authorId: string
  body: string
  parentId: string | null
  createdAt: string
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

function jsonAuth(userId: string): Record<string, string> {
  return { "content-type": "application/json", ...auth(userId) }
}

async function addMember(
  store: WorkspaceStore,
  workspaceId: string,
  user: { id: string; email: string }
): Promise<void> {
  const invitation = await store.createInvitation({
    workspaceId,
    email: user.email,
    role: "Member",
    invitedBy: owner.id,
  })
  await store.acceptInvitation(invitation.id, user.id)
}

async function setupFixture(
  options: { mailer?: Mailer | null; frontendUrl?: string } = {}
): Promise<Fixture> {
  const store = createMemoryWorkspaceStore({ users: profiles })
  const app = createWorkspacesApp({
    store,
    getSession: async (req) => {
      const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
      const user = match ? sessions[match[1]] : undefined
      return user ? { user } : null
    },
    mailer: options.mailer ?? null,
    frontendUrl: options.frontendUrl,
  })
  const workspace = await store.createWorkspace(owner.id, "Acme")
  await addMember(store, workspace.id, member)
  await addMember(store, workspace.id, second)
  const project = await store.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  // Seeded rows would drown the assertions; tests want a clean tracker.
  await clearSeededTracker(store, project.id)
  const backlog = await store.createStatus(project.id, {
    name: "Backlog",
    category: "Unstarted",
  })
  const done = await store.createStatus(project.id, {
    name: "Done",
    category: "Completed",
  })
  await store.addProjectViewer(project.id, viewer.id)
  return {
    app,
    store,
    workspaceId: workspace.id,
    projectId: project.id,
    backlogId: backlog.id,
    doneId: done.id,
  }
}

async function createIssue(
  fixture: Fixture,
  userId: string,
  body: Partial<CreateIssueInput> = {}
): Promise<Issue> {
  const res = await fixture.app.request(
    `/api/projects/${fixture.projectId}/issues`,
    {
      method: "POST",
      headers: jsonAuth(userId),
      body: JSON.stringify({
        title: "Primary issue",
        statusId: fixture.backlogId,
        ...body,
      }),
    }
  )
  expect(res.status).toBe(201)
  return (await res.json()) as Issue
}

function patchIssue(
  fixture: Fixture,
  userId: string,
  key: string,
  body: UpdateIssueInput
) {
  return fixture.app.request(`/api/issues/${key}`, {
    method: "PATCH",
    headers: jsonAuth(userId),
    body: JSON.stringify(body),
  })
}

async function postComment(
  fixture: Fixture,
  userId: string,
  key: string,
  body: { body: string; parentId?: string | null }
): Promise<CommentRow> {
  const res = await fixture.app.request(`/api/issues/${key}/comments`, {
    method: "POST",
    headers: jsonAuth(userId),
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(201)
  return (await res.json()) as CommentRow
}

async function storedNotifications(
  fixture: Fixture,
  userId: string
): Promise<Notification[]> {
  const page = await fixture.store.listNotifications(userId, {
    filter: "all",
    limit: 100,
  })
  return page.notifications
}

async function inbox(
  fixture: Fixture,
  userId: string,
  query = ""
): Promise<NotificationPage> {
  const res = await fixture.app.request(`/api/notifications${query}`, {
    headers: auth(userId),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as NotificationPage
}

async function setEmailMode(
  fixture: Fixture,
  userId: string,
  emailMode: "immediate" | "digest" | "off"
): Promise<void> {
  const res = await fixture.app.request("/api/me/notification-settings", {
    method: "PATCH",
    headers: jsonAuth(userId),
    body: JSON.stringify({ emailMode }),
  })
  expect(res.status).toBe(200)
}

describe("notification fan-out", () => {
  let fixture: Fixture
  let issue: Issue
  let issueKey: string

  beforeEach(async () => {
    fixture = await setupFixture()
    issue = await createIssue(fixture, member.id)
    issueKey = issue.identifier
  })

  test("creating an issue auto-watches the creator and notifies nobody", async () => {
    expect(issue.createdBy).toBe(member.id)
    expect(await fixture.store.isWatching(issue.id, member.id)).toBe(true)
    expect(await storedNotifications(fixture, member.id)).toEqual([])
    expect(await storedNotifications(fixture, owner.id)).toEqual([])
  })

  test("creating an issue already assigned notifies and watches the assignee", async () => {
    const assigned = await createIssue(fixture, owner.id, {
      title: "Created assigned",
      assigneeId: second.id,
    })
    expect(await fixture.store.isWatching(assigned.id, second.id)).toBe(true)
    const rows = await storedNotifications(fixture, second.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: "issue.assigned",
      actorId: owner.id,
      payload: {
        from: null,
        to: second.id,
        issueIdentifier: assigned.identifier,
      },
    })
    expect(await storedNotifications(fixture, owner.id)).toEqual([])
  })

  test("assignment notifies the new assignee; unassignment notifies the old", async () => {
    const assigned = await patchIssue(fixture, owner.id, issueKey, {
      assigneeId: second.id,
    })
    expect(assigned.status).toBe(200)

    const secondRows = await storedNotifications(fixture, second.id)
    expect(secondRows).toHaveLength(1)
    expect(secondRows[0]).toMatchObject({
      type: "issue.assigned",
      actorId: owner.id,
      payload: {
        issueIdentifier: issueKey,
        issueTitle: "Primary issue",
        workspaceId: fixture.workspaceId,
        actorName: "Owner",
        from: null,
        to: second.id,
      },
    })
    expect(await fixture.store.isWatching(issue.id, second.id)).toBe(true)
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)

    const unassigned = await patchIssue(fixture, owner.id, issueKey, {
      assigneeId: null,
    })
    expect(unassigned.status).toBe(200)

    const afterUnassign = await storedNotifications(fixture, second.id)
    expect(afterUnassign).toHaveLength(2)
    expect(
      afterUnassign.find((row) => row.type === "issue.unassigned")?.payload
    ).toMatchObject({ from: second.id, to: null })
    // Unassignment never removes the watcher.
    expect(await fixture.store.isWatching(issue.id, second.id)).toBe(true)
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)
  })

  test("reassignment notifies both assignees", async () => {
    await patchIssue(fixture, owner.id, issueKey, { assigneeId: member.id })
    await patchIssue(fixture, owner.id, issueKey, { assigneeId: second.id })

    const memberRows = await storedNotifications(fixture, member.id)
    expect(memberRows).toHaveLength(2)
    expect(new Set(memberRows.map((row) => row.type))).toEqual(
      new Set(["issue.assigned", "issue.unassigned"])
    )
    expect(
      (await storedNotifications(fixture, second.id)).map((row) => row.type)
    ).toEqual(["issue.assigned"])
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)
  })

  test("self-assignment is silent for the actor", async () => {
    const res = await patchIssue(fixture, member.id, issueKey, {
      assigneeId: member.id,
    })
    expect(res.status).toBe(200)
    expect(await storedNotifications(fixture, member.id)).toHaveLength(0)
    expect(await fixture.store.isWatching(issue.id, member.id)).toBe(true)
  })

  test("status changes notify watchers except the actor; other fields are silent", async () => {
    await fixture.store.addWatcher(issue.id, second.id)
    await fixture.store.addWatcher(issue.id, owner.id)

    const res = await patchIssue(fixture, owner.id, issueKey, {
      statusId: fixture.doneId,
    })
    expect(res.status).toBe(200)

    const memberRows = await storedNotifications(fixture, member.id)
    expect(memberRows).toHaveLength(1)
    expect(memberRows[0]).toMatchObject({
      type: "issue.status_changed",
      actorId: owner.id,
      payload: {
        from: fixture.backlogId,
        to: fixture.doneId,
        issueIdentifier: issueKey,
      },
    })
    const secondRows = await storedNotifications(fixture, second.id)
    expect(secondRows).toHaveLength(1)
    expect(secondRows[0].type).toBe("issue.status_changed")
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)

    for (const body of [
      { priority: "High" },
      { dueDate: "2026-12-01T00:00:00.000Z" },
      { title: "Renamed" },
      { description: "Changed description" },
      { labels: ["bug"] },
      { archived: true },
    ] satisfies UpdateIssueInput[]) {
      const patch = await patchIssue(fixture, owner.id, issueKey, body)
      expect(patch.status).toBe(200)
    }

    expect(await storedNotifications(fixture, member.id)).toHaveLength(1)
    expect(await storedNotifications(fixture, second.id)).toHaveLength(1)
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)
  })

  test("comments notify watchers except the author", async () => {
    await fixture.store.addWatcher(issue.id, second.id)
    const comment = await postComment(fixture, owner.id, issueKey, {
      body: "hello team",
    })

    for (const userId of [member.id, second.id]) {
      const rows = await storedNotifications(fixture, userId)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        type: "comment.created",
        actorId: owner.id,
        payload: {
          commentId: comment.id,
          parentId: null,
          excerpt: "hello team",
          issueIdentifier: issueKey,
          actorName: "Owner",
        },
      })
    }
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)
  })

  test("a reply notifies the parent author exactly once", async () => {
    const parent = await postComment(fixture, member.id, issueKey, {
      body: "parent",
    })
    const reply = await postComment(fixture, second.id, issueKey, {
      body: "reply",
      parentId: parent.id,
    })

    const memberRows = await storedNotifications(fixture, member.id)
    expect(memberRows).toHaveLength(1)
    expect(memberRows[0]).toMatchObject({
      type: "comment.created",
      payload: {
        commentId: reply.id,
        parentId: parent.id,
        replyToCommentId: parent.id,
        excerpt: "reply",
      },
    })
    // The reply author is never notified of their own comment.
    expect(await storedNotifications(fixture, second.id)).toHaveLength(0)
  })

  test("a mention creates one row and auto-watches the mentioned member", async () => {
    const comment = await postComment(fixture, member.id, issueKey, {
      body: "hi @[Second](mention:user-second)",
    })

    const rows = await storedNotifications(fixture, second.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: "comment.mention",
      actorId: member.id,
      payload: {
        commentId: comment.id,
        issueIdentifier: issueKey,
        excerpt: "hi @[Second](mention:user-second)",
      },
    })
    expect(await fixture.store.isWatching(issue.id, second.id)).toBe(true)
    // The author is not notified of their own comment.
    expect(await storedNotifications(fixture, member.id)).toHaveLength(0)
  })

  test("mention plus watcher dedupes to a single mention row", async () => {
    await fixture.store.addWatcher(issue.id, second.id)
    await postComment(fixture, member.id, issueKey, {
      body: "[Second](mention:user-second) again",
    })

    const rows = await storedNotifications(fixture, second.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("comment.mention")
  })

  test("self-mention notifies nothing", async () => {
    await postComment(fixture, member.id, issueKey, {
      body: "[Me](mention:user-member)",
    })
    expect(await storedNotifications(fixture, member.id)).toHaveLength(0)
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)
  })

  test("editing a comment never notifies", async () => {
    const comment = await postComment(fixture, member.id, issueKey, {
      body: "first",
    })
    await fixture.store.addWatcher(issue.id, owner.id)

    const edited = await fixture.app.request(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: jsonAuth(member.id),
      body: JSON.stringify({ body: "second" }),
    })
    expect(edited.status).toBe(200)
    expect(await storedNotifications(fixture, owner.id)).toHaveLength(0)
  })

  test("outsider and Viewer mentions are ignored", async () => {
    await postComment(fixture, member.id, issueKey, {
      body: "[Out](mention:user-outsider) [View](mention:user-viewer)",
    })

    expect(await storedNotifications(fixture, outsider.id)).toHaveLength(0)
    expect(await storedNotifications(fixture, viewer.id)).toHaveLength(0)
    expect(await fixture.store.isWatching(issue.id, outsider.id)).toBe(false)
    expect(await fixture.store.isWatching(issue.id, viewer.id)).toBe(false)
  })
})

describe("notification inbox", () => {
  test("lists newest first, filters unread, and reports counts", async () => {
    const fixture = await setupFixture()
    const issue = await createIssue(fixture, member.id)
    await Bun.sleep(5)
    await patchIssue(fixture, owner.id, issue.identifier, {
      assigneeId: second.id,
    })
    await Bun.sleep(5)
    await postComment(fixture, owner.id, issue.identifier, { body: "comment" })
    await Bun.sleep(5)
    await patchIssue(fixture, owner.id, issue.identifier, {
      statusId: fixture.doneId,
    })

    const all = await inbox(fixture, second.id)
    expect(all.notifications.map((row) => row.type)).toEqual([
      "issue.status_changed",
      "comment.created",
      "issue.assigned",
    ])
    expect(all.nextCursor).toBeNull()
    expect(all.unreadCount).toBe(3)
    for (let index = 1; index < all.notifications.length; index += 1) {
      expect(
        all.notifications[index - 1].createdAt >=
          all.notifications[index].createdAt
      ).toBe(true)
    }

    const unread = await inbox(fixture, second.id, "?filter=unread")
    expect(unread.notifications).toHaveLength(3)

    const countRes = await fixture.app.request(
      "/api/notifications/unread-count",
      { headers: auth(second.id) }
    )
    expect(await countRes.json()).toEqual({ count: 3 })

    const first = all.notifications[0]
    const read = await fixture.app.request(
      `/api/notifications/${first.id}/read`,
      { method: "POST", headers: auth(second.id) }
    )
    expect(read.status).toBe(200)
    expect(((await read.json()) as Notification).readAt).not.toBeNull()

    const afterRead = await inbox(fixture, second.id, "?filter=unread")
    expect(afterRead.notifications.map((row) => row.id)).toEqual(
      all.notifications.slice(1).map((row) => row.id)
    )
    expect(afterRead.unreadCount).toBe(2)

    const readAll = await fixture.app.request("/api/notifications/read-all", {
      method: "POST",
      headers: auth(second.id),
    })
    expect(readAll.status).toBe(200)
    expect(await readAll.json()).toEqual({ updated: 2 })
    expect(
      (await inbox(fixture, second.id, "?filter=unread")).unreadCount
    ).toBe(0)
  })

  test("enriches a missing actorName from workspace members", async () => {
    const fixture = await setupFixture()
    const issue = await createIssue(fixture, member.id)
    await fixture.store.createNotification({
      userId: member.id,
      issueId: issue.id,
      type: "comment.created",
      actorType: "user",
      actorId: second.id,
      payload: {
        issueIdentifier: issue.identifier,
        issueTitle: issue.title,
        workspaceId: fixture.workspaceId,
      },
    })

    const page = await inbox(fixture, member.id)
    expect(page.notifications).toHaveLength(1)
    expect(page.notifications[0].payload.actorName).toBe("Second")
  })

  test("reading another user's notification is 404", async () => {
    const fixture = await setupFixture()
    const issue = await createIssue(fixture, member.id)
    await patchIssue(fixture, owner.id, issue.identifier, {
      assigneeId: second.id,
    })
    const [row] = await storedNotifications(fixture, second.id)
    expect(row).toBeDefined()

    const res = await fixture.app.request(`/api/notifications/${row.id}/read`, {
      method: "POST",
      headers: auth(member.id),
    })
    expect(res.status).toBe(404)
  })

  test("pagination walks the inbox without duplicates", async () => {
    const fixture = await setupFixture()
    const issue = await createIssue(fixture, member.id)
    for (let index = 0; index < 3; index += 1) {
      await Bun.sleep(5)
      // Status flips notify; each one adds a row for the watching creator.
      const res = await patchIssue(fixture, owner.id, issue.identifier, {
        statusId: index % 2 === 0 ? fixture.doneId : fixture.backlogId,
      })
      expect(res.status).toBe(200)
      await Bun.sleep(5)
    }

    const collected: string[] = []
    let before: string | null = null
    for (;;) {
      const query = `?limit=2${before ? `&before=${encodeURIComponent(before)}` : ""}`
      const page = await inbox(fixture, member.id, query)
      collected.push(...page.notifications.map((row) => row.id))
      if (!page.nextCursor) break
      before = page.nextCursor
    }
    const all = await inbox(fixture, member.id)
    expect(collected).toEqual(all.notifications.map((row) => row.id))
    expect(new Set(collected).size).toBe(collected.length)
  })
})

describe("my issues", () => {
  test("assigned, created, and watched tabs span projects", async () => {
    const fixture = await setupFixture()
    const assigned = await createIssue(fixture, owner.id, {
      title: "Assigned web",
      assigneeId: member.id,
    })
    const created = await createIssue(fixture, member.id, {
      title: "Created by member",
    })

    const api = await fixture.store.createProject(fixture.workspaceId, {
      name: "Api",
      key: "API",
    })
    await clearSeededTracker(fixture.store, api.id)
    const apiStatus = await fixture.store.createStatus(api.id, {
      name: "Todo",
      category: "Unstarted",
    })
    const crossAssignedRes = await fixture.app.request(
      `/api/projects/${api.id}/issues`,
      {
        method: "POST",
        headers: jsonAuth(owner.id),
        body: JSON.stringify({
          title: "Assigned api",
          statusId: apiStatus.id,
          assigneeId: member.id,
        }),
      }
    )
    expect(crossAssignedRes.status).toBe(201)
    const crossAssigned = (await crossAssignedRes.json()) as Issue

    const watchedRes = await fixture.app.request(
      `/api/projects/${api.id}/issues`,
      {
        method: "POST",
        headers: jsonAuth(owner.id),
        body: JSON.stringify({ title: "Watched api", statusId: apiStatus.id }),
      }
    )
    expect(watchedRes.status).toBe(201)
    const watched = (await watchedRes.json()) as Issue
    const watchRes = await fixture.app.request(
      `/api/issues/${watched.identifier}/watch`,
      { method: "POST", headers: auth(member.id) }
    )
    expect(watchRes.status).toBe(200)

    const assignedRows = (await (
      await fixture.app.request("/api/me/issues?tab=assigned", {
        headers: auth(member.id),
      })
    ).json()) as MyIssue[]
    expect(new Set(assignedRows.map((row) => row.id))).toEqual(
      new Set([assigned.id, crossAssigned.id])
    )

    const createdRows = (await (
      await fixture.app.request("/api/me/issues?tab=created", {
        headers: auth(member.id),
      })
    ).json()) as MyIssue[]
    expect(createdRows.map((row) => row.id)).toEqual([created.id])

    const crossRow = assignedRows.find((row) => row.id === crossAssigned.id)
    expect(crossRow).toMatchObject({
      workspaceId: fixture.workspaceId,
      workspaceName: "Acme",
      projectName: "Api",
      projectKey: "API",
      projectIcon: "Folder",
      projectColor: "#94a3b8",
      statusName: "Todo",
      statusCategory: "Unstarted",
    })

    const watchedRows = (await (
      await fixture.app.request("/api/me/issues?tab=watched", {
        headers: auth(member.id),
      })
    ).json()) as MyIssue[]
    expect(new Set(watchedRows.map((row) => row.id))).toEqual(
      new Set([assigned.id, crossAssigned.id, created.id, watched.id])
    )

    await Bun.sleep(5)
    const touched = await patchIssue(fixture, owner.id, watched.identifier, {
      title: "Watched api renamed",
    })
    expect(touched.status).toBe(200)
    const sorted = (await (
      await fixture.app.request("/api/me/issues?tab=watched", {
        headers: auth(member.id),
      })
    ).json()) as MyIssue[]
    // The patched row moves to the top; the rest keep `updatedAt` order.
    expect(sorted[0]?.id).toBe(watched.id)
    expect(new Set(sorted.slice(1).map((row) => row.id))).toEqual(
      new Set([assigned.id, crossAssigned.id, created.id])
    )
  })

  test("Viewers only see issues from granted projects", async () => {
    const fixture = await setupFixture()
    const granted = await createIssue(fixture, owner.id, { title: "Granted" })
    const hiddenProject = await fixture.store.createProject(
      fixture.workspaceId,
      { name: "Hidden", key: "HID" }
    )
    await clearSeededTracker(fixture.store, hiddenProject.id)
    const hiddenStatus = await fixture.store.createStatus(hiddenProject.id, {
      name: "Todo",
      category: "Unstarted",
    })
    const hidden = await fixture.store.createIssue(
      hiddenProject.id,
      { title: "Hidden", statusId: hiddenStatus.id },
      { type: "user", id: owner.id }
    )
    await fixture.store.addWatcher(granted.id, viewer.id)
    await fixture.store.addWatcher(hidden.id, viewer.id)

    const res = await fixture.app.request("/api/me/issues?tab=watched", {
      headers: auth(viewer.id),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as MyIssue[]).map((row) => row.id)).toEqual([
      granted.id,
    ])
  })

  test("empty tabs are empty arrays and unknown tabs are 400", async () => {
    const fixture = await setupFixture()

    for (const tab of ["assigned", "created", "watched"]) {
      const res = await fixture.app.request(`/api/me/issues?tab=${tab}`, {
        headers: auth(member.id),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    }

    const emptyForOutsider = await fixture.app.request(
      "/api/me/issues?tab=assigned",
      { headers: auth(outsider.id) }
    )
    expect(await emptyForOutsider.json()).toEqual([])

    expect(
      (
        await fixture.app.request("/api/me/issues?tab=everything", {
          headers: auth(member.id),
        })
      ).status
    ).toBe(400)
    expect(
      (await fixture.app.request("/api/me/issues", { headers: {} })).status
    ).toBe(401)
  })
})

describe("notification settings", () => {
  test("default to digest, patch through every mode, and reject invalid values", async () => {
    const fixture = await setupFixture()
    const read = () =>
      fixture.app.request("/api/me/notification-settings", {
        headers: auth(member.id),
      })

    const initial = await read()
    expect(initial.status).toBe(200)
    expect(await initial.json()).toEqual({ emailMode: "digest" })

    for (const mode of ["immediate", "off", "digest"] as const) {
      await setEmailMode(fixture, member.id, mode)
      expect(await (await read()).json()).toEqual({ emailMode: mode })
    }

    const invalid = await fixture.app.request("/api/me/notification-settings", {
      method: "PATCH",
      headers: jsonAuth(member.id),
      body: JSON.stringify({ emailMode: "often" }),
    })
    expect(invalid.status).toBe(400)

    const anonymous = await fixture.app.request(
      "/api/me/notification-settings",
      { headers: {} }
    )
    expect(anonymous.status).toBe(401)
  })
})

describe("notification email", () => {
  test("immediate mode mails every row and stamps emailedAt", async () => {
    const mailer = createMemoryMailer()
    const fixture = await setupFixture({
      mailer,
      frontendUrl: "https://app.example",
    })
    const issue = await createIssue(fixture, member.id, { title: "Mail me" })
    await setEmailMode(fixture, second.id, "immediate")

    const res = await patchIssue(fixture, owner.id, issue.identifier, {
      assigneeId: second.id,
    })
    expect(res.status).toBe(200)

    expect(mailer.sent).toHaveLength(1)
    const [message] = mailer.sent
    expect(message.to).toBe(second.email)
    expect(message.subject).toContain(issue.identifier)
    expect(message.subject).toContain("Mail me")
    expect(message.text).toContain("Owner")
    expect(message.text).toContain("assigned you")
    expect(message.text).toContain(issue.identifier)
    expect(message.text).toContain("Mail me")
    expect(message.text).toContain(
      `https://app.example/acme/issue/${issue.identifier}`
    )
    expect(message.text).toContain("Manage notification settings")

    const rows = await storedNotifications(fixture, second.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].emailedAt).not.toBeNull()
  })

  test("digest mails mentions and assignments now but leaves plain comments", async () => {
    const mailer = createMemoryMailer()
    const fixture = await setupFixture({ mailer })
    const issue = await createIssue(fixture, member.id, { title: "Digest" })

    await postComment(fixture, member.id, issue.identifier, {
      body: "[Second](mention:user-second)",
    })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0].to).toBe(second.email)
    expect(mailer.sent[0].text).toContain("mentioned you")

    // A plain comment reaches the watcher in-app, but digest holds the mail.
    await postComment(fixture, owner.id, issue.identifier, { body: "plain" })
    const memberRows = await storedNotifications(fixture, member.id)
    expect(memberRows).toHaveLength(1)
    expect(memberRows[0].type).toBe("comment.created")
    expect(memberRows[0].emailedAt).toBeNull()
    expect(mailer.sent).toHaveLength(1)

    await patchIssue(fixture, owner.id, issue.identifier, {
      assigneeId: second.id,
    })
    const assigned = (await storedNotifications(fixture, second.id)).find(
      (row) => row.type === "issue.assigned"
    )
    expect(assigned).toBeDefined()
    expect(assigned?.emailedAt).not.toBeNull()
    expect(mailer.sent).toHaveLength(2)
  })

  test("off suppresses mail but never the in-app row", async () => {
    const mailer = createMemoryMailer()
    const fixture = await setupFixture({ mailer })
    const issue = await createIssue(fixture, member.id, { title: "Off" })
    await setEmailMode(fixture, second.id, "off")

    await postComment(fixture, member.id, issue.identifier, {
      body: "[Second](mention:user-second)",
    })

    expect(mailer.sent).toHaveLength(0)
    const rows = await storedNotifications(fixture, second.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("comment.mention")
    expect(rows[0].emailedAt).toBeNull()
  })

  test("a failed send is logged and never fails the mutation", async () => {
    const failing: Mailer = {
      async send() {
        throw new Error("smtp down")
      },
    }
    const fixture = await setupFixture({ mailer: failing })
    const issue = await createIssue(fixture, member.id, { title: "Failure" })
    await setEmailMode(fixture, second.id, "immediate")

    const res = await patchIssue(fixture, owner.id, issue.identifier, {
      assigneeId: second.id,
    })
    expect(res.status).toBe(200)
    const rows = await storedNotifications(fixture, second.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe("issue.assigned")
    expect(rows[0].emailedAt).toBeNull()
  })
})
