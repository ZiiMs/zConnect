import { beforeEach, describe, expect, test } from "bun:test"
import {
  decodeCursor,
  encodeCursor,
  githubActivityDraft,
  githubActivityType,
  isDescriptionCoalesced,
} from "./activity.js"
import {
  type Actor,
  createMemoryWorkspaceStore,
  type Project,
  type Status,
  SYSTEM_ACTOR,
  type Workspace,
  type WorkspaceStore,
} from "./store.js"
import { clearSeededTracker } from "./test-support.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }
const noEmail = { id: "user-no-email" }

const users = {
  [owner.id]: { name: "Owner", email: owner.email },
  [member.id]: { name: "Member", email: member.email },
  [viewer.id]: { name: "Viewer", email: viewer.email },
  [noEmail.id]: { name: "No Email" },
}

const memberActor: Actor = { type: "user", id: member.id, name: "Member" }

interface Fixture {
  store: WorkspaceStore
  workspace: Workspace
  project: Project
  status: Status
}

async function addMember(store: WorkspaceStore, workspaceId: string) {
  const invitation = await store.createInvitation({
    workspaceId,
    email: member.email,
    role: "Member",
    invitedBy: owner.id,
  })
  await store.acceptInvitation(invitation.id, member.id)
}

async function setup(): Promise<Fixture> {
  const store = createMemoryWorkspaceStore({ users })
  const workspace = await store.createWorkspace(owner.id, "Acme")
  await addMember(store, workspace.id)
  const project = await store.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  // T2 seeding always runs; feature tests start from an empty tracker.
  await clearSeededTracker(store, project.id)
  const status = await store.createStatus(project.id, {
    name: "Todo",
    category: "Unstarted",
  })
  return { store, workspace, project, status }
}

describe("collaboration domain model", () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await setup()
  })

  test("seeds have no author and emit no Activity", async () => {
    const store = createMemoryWorkspaceStore({ users })
    const workspace = await store.createWorkspace(owner.id, "Seeded")
    const project = await store.createProject(workspace.id, {
      name: "Seed",
      key: "SEED",
    })
    const seeds = await store.listIssues(project.id)
    expect(seeds).toHaveLength(6)
    for (const issue of seeds) {
      expect(issue.createdBy).toBeNull()
      expect(await store.listActivity(issue.id)).toEqual([])
    }
  })

  test("createIssue records createdBy only for user actors", async () => {
    const { store, project, status } = fixture
    const userIssue = await store.createIssue(
      project.id,
      { title: "User issue", statusId: status.id },
      memberActor
    )
    expect(userIssue.createdBy).toBe(member.id)

    const agentIssue = await store.createIssue(
      project.id,
      { title: "Agent issue", statusId: status.id },
      { type: "agent", id: "token-1", name: "Builder" }
    )
    expect(agentIssue.createdBy).toBeNull()

    const systemIssue = await store.createIssue(project.id, {
      title: "System issue",
      statusId: status.id,
    })
    expect(systemIssue.createdBy).toBeNull()

    const events = await store.listActivity(userIssue.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actorType: "user",
      actorId: member.id,
      type: "issue.created",
      payload: { identifier: userIssue.identifier, title: "User issue" },
    })
  })

  test("updateIssue emits one event per changed field and nothing for no-ops", async () => {
    const { store, project, status } = fixture
    const otherStatus = await store.createStatus(project.id, {
      name: "Doing",
      category: "In Progress",
    })
    const target = await store.createProject(fixture.workspace.id, {
      name: "Other",
      key: "OTH",
    })
    await clearSeededTracker(store, target.id)
    const targetStatus = await store.createStatus(target.id, {
      name: "Todo",
      category: "Unstarted",
    })
    const issue = await store.createIssue(
      project.id,
      { title: "Original", statusId: status.id, priority: "Low" },
      memberActor
    )
    const parent = await store.createIssue(
      project.id,
      { title: "Parent", statusId: status.id },
      memberActor
    )

    await store.updateIssue(issue.id, { statusId: otherStatus.id }, memberActor)
    await store.updateIssue(issue.id, { assigneeId: member.id }, memberActor)
    await store.updateIssue(issue.id, { priority: "High" }, memberActor)
    await store.updateIssue(
      issue.id,
      { dueDate: "2026-12-01T00:00:00.000Z" },
      memberActor
    )
    await store.updateIssue(issue.id, { title: "Renamed" }, memberActor)
    await store.updateIssue(issue.id, { description: "Body text" }, memberActor)
    await store.updateIssue(issue.id, { labels: ["bug", "api"] }, memberActor)
    await store.updateIssue(issue.id, { archived: true }, memberActor)
    await store.updateIssue(issue.id, { archived: false }, memberActor)
    await store.updateIssue(issue.id, { parentId: parent.id }, memberActor)
    // Moves are tested on a separate issue: linked subtasks cannot move.
    const movable = await store.createIssue(
      project.id,
      { title: "Movable", statusId: status.id },
      memberActor
    )
    await store.updateIssue(
      movable.id,
      { projectId: target.id, statusId: targetStatus.id },
      memberActor
    )

    const events = await store.listActivity(issue.id)
    const types = events.map((event) => event.type)
    expect(types).toContain("issue.status_changed")
    expect(types).toContain("issue.assignee_changed")
    expect(types).toContain("issue.priority_changed")
    expect(types).toContain("issue.due_date_changed")
    expect(types).toContain("issue.title_changed")
    expect(types).toContain("issue.description_changed")
    expect(types).toContain("issue.labels_changed")
    expect(types).toContain("issue.archived")
    expect(types).toContain("issue.unarchived")
    expect(types).toContain("issue.parent_changed")
    expect(types).not.toContain("issue.moved")
    const movedTypes = (await store.listActivity(movable.id)).map(
      (event) => event.type
    )
    expect(movedTypes).toContain("issue.moved")
    expect(movedTypes).toContain("issue.status_changed")
    expect(
      types.filter((type) => type === "issue.description_changed")
    ).toHaveLength(1)

    const description = events.find(
      (event) => event.type === "issue.description_changed"
    )
    expect(description?.payload).toEqual({ changed: true })

    const labels = events.find((event) => event.type === "issue.labels_changed")
    expect(labels?.payload).toEqual({ added: ["bug", "api"], removed: [] })

    const parentEvent = events.find(
      (event) => event.type === "issue.parent_changed"
    )
    expect(parentEvent?.payload).toEqual({
      from: null,
      to: parent.identifier,
    })

    const before = events.length
    await store.updateIssue(issue.id, {}, memberActor)
    await store.updateIssue(issue.id, { title: "Renamed" }, memberActor)
    expect(await store.listActivity(issue.id)).toHaveLength(before)
  })

  test("description autosaves coalesce per issue, actor type and actor id", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(
      project.id,
      { title: "Autosave", statusId: status.id },
      memberActor
    )
    await store.updateIssue(issue.id, { description: "one" }, memberActor)
    await store.updateIssue(
      issue.id,
      { description: "one plus more" },
      memberActor
    )
    const events = await store.listActivity(issue.id)
    expect(
      events.filter((event) => event.type === "issue.description_changed")
    ).toHaveLength(1)

    // A different actor gets their own event inside the window.
    await store.updateIssue(
      issue.id,
      { description: "owner edit" },
      { type: "user", id: owner.id }
    )
    expect(
      (await store.listActivity(issue.id)).filter(
        (event) => event.type === "issue.description_changed"
      )
    ).toHaveLength(2)

    expect(isDescriptionCoalesced(new Date().toISOString(), new Date())).toBe(
      true
    )
    expect(
      isDescriptionCoalesced(
        new Date(Date.now() - 16 * 60 * 1000).toISOString(),
        new Date()
      )
    ).toBe(false)
    expect(isDescriptionCoalesced(null, new Date())).toBe(false)
  })

  test("listActivity is ascending by createdAt then id", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(
      project.id,
      { title: "Ordered", statusId: status.id },
      memberActor
    )
    await store.appendActivity(issue.id, {
      actor: SYSTEM_ACTOR,
      type: "custom.first",
      summary: "first",
    })
    await store.appendActivity(issue.id, {
      actor: SYSTEM_ACTOR,
      type: "custom.second",
      summary: "second",
    })
    const events = await store.listActivity(issue.id)
    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1]
      const current = events[index]
      expect(
        previous.createdAt < current.createdAt ||
          (previous.createdAt === current.createdAt && previous.id < current.id)
      ).toBe(true)
    }
  })

  test("GitHub timeline kinds map to github.* Activity types", () => {
    expect(githubActivityType("opened")).toBe("github.opened")
    expect(githubActivityType("merged")).toBe("github.merged")
    expect(githubActivityDraft("merged", "Merged #12")).toEqual({
      type: "github.merged",
      summary: "Merged #12",
      payload: { kind: "merged" },
    })
  })

  test("cursor codec round-trips and rejects malformed input", () => {
    const cursor = { createdAt: "2026-10-20T12:00:00.000Z", id: "row-1" }
    const encoded = encodeCursor(cursor)
    expect(encoded).not.toContain("|")
    expect(decodeCursor(encoded)).toEqual(cursor)
    expect(decodeCursor("not-a-cursor")).toBeNull()
    expect(decodeCursor(undefined)).toBeNull()
  })
})

describe("comments", () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await setup()
  })

  test("validates body, issue, and one-level replies", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(project.id, {
      title: "Comments",
      statusId: status.id,
    })
    const other = await store.createIssue(project.id, {
      title: "Other",
      statusId: status.id,
    })

    await expect(
      store.createComment({
        issueId: "missing",
        authorId: member.id,
        body: "x",
      })
    ).rejects.toMatchObject({ code: "invalid" })
    await expect(
      store.createComment({
        issueId: issue.id,
        authorId: member.id,
        body: "  ",
      })
    ).rejects.toMatchObject({ code: "invalid" })
    await expect(
      store.createComment({
        issueId: issue.id,
        authorId: member.id,
        body: "x",
        parentId: "missing",
      })
    ).rejects.toMatchObject({ code: "invalid" })

    const top = await store.createComment({
      issueId: issue.id,
      authorId: member.id,
      body: "  hello  ",
    })
    expect(top.body).toBe("hello")
    const otherComment = await store.createComment({
      issueId: other.id,
      authorId: member.id,
      body: "elsewhere",
    })
    await expect(
      store.createComment({
        issueId: issue.id,
        authorId: member.id,
        body: "wrong issue",
        parentId: otherComment.id,
      })
    ).rejects.toMatchObject({ code: "invalid" })

    const reply = await store.createComment({
      issueId: issue.id,
      authorId: owner.id,
      body: "reply",
      parentId: top.id,
    })
    expect(reply.parentId).toBe(top.id)
    await expect(
      store.createComment({
        issueId: issue.id,
        authorId: owner.id,
        body: "nested",
        parentId: reply.id,
      })
    ).rejects.toMatchObject({ code: "invalid" })
  })

  test("edits set editedAt, rejects empty bodies, and soft delete is an idempotent tombstone", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(project.id, {
      title: "Edit me",
      statusId: status.id,
    })
    const comment = await store.createComment({
      issueId: issue.id,
      authorId: member.id,
      body: "first",
    })
    const edited = await store.updateComment(comment.id, " second ")
    expect(edited.body).toBe("second")
    expect(edited.editedAt).not.toBeNull()
    await expect(store.updateComment(comment.id, " ")).rejects.toMatchObject({
      code: "invalid",
    })

    const deleted = await store.softDeleteComment(comment.id)
    expect(deleted.body).toBe("")
    expect(deleted.deletedAt).not.toBeNull()
    const again = await store.softDeleteComment(comment.id)
    expect(again.deletedAt).toBe(deleted.deletedAt)
    expect(again.body).toBe("")
    expect(await store.getComment(comment.id)).toMatchObject({
      body: "",
      deletedAt: deleted.deletedAt,
    })
  })

  test("comments never become Activity Events", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(project.id, {
      title: "No activity",
      statusId: status.id,
    })
    const before = (await store.listActivity(issue.id)).length
    const comment = await store.createComment({
      issueId: issue.id,
      authorId: member.id,
      body: "hello",
    })
    await store.updateComment(comment.id, "edited")
    await store.softDeleteComment(comment.id)
    expect((await store.listActivity(issue.id)).length).toBe(before)
  })

  test("listComments paginates newest first without duplicates or gaps", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(project.id, {
      title: "Paged",
      statusId: status.id,
    })
    for (let index = 0; index < 5; index += 1) {
      await store.createComment({
        issueId: issue.id,
        authorId: member.id,
        body: `comment ${index}`,
      })
    }
    const collected: string[] = []
    let before: string | undefined
    for (;;) {
      const page = await store.listComments(issue.id, { limit: 2, before })
      expect(page.comments.length).toBeLessThanOrEqual(2)
      collected.push(...page.comments.map((comment) => comment.id))
      if (!page.nextCursor) break
      before = page.nextCursor
    }
    const all = await store.listComments(issue.id, { limit: 50 })
    expect(all.nextCursor).toBeNull()
    expect(collected).toEqual(all.comments.map((comment) => comment.id))
    expect(new Set(collected).size).toBe(collected.length)
  })
})

describe("timeline", () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await setup()
  })

  test("merges comments and activity newest first with stable cursor pages", async () => {
    const { store, project, status } = fixture
    const issue = await store.createIssue(
      project.id,
      { title: "Timeline", statusId: status.id },
      memberActor
    )
    await store.createComment({
      issueId: issue.id,
      authorId: member.id,
      body: "one",
    })
    await store.updateIssue(issue.id, { title: "Timeline v2" }, memberActor)
    await store.createComment({
      issueId: issue.id,
      authorId: owner.id,
      body: "two",
    })
    await store.appendActivity(issue.id, {
      actor: SYSTEM_ACTOR,
      type: "custom.event",
      summary: "custom",
    })

    const full = await store.listTimeline(issue.id, { limit: 50 })
    expect(full.nextCursor).toBeNull()
    expect(full.items.map((item) => item.kind)).toContain("comment")
    expect(full.items.map((item) => item.kind)).toContain("activity")
    for (let index = 1; index < full.items.length; index += 1) {
      const previous = full.items[index - 1]
      const current = full.items[index]
      expect(
        previous.createdAt > current.createdAt ||
          (previous.createdAt === current.createdAt && previous.id > current.id)
      ).toBe(true)
    }

    const collected: string[] = []
    let before: string | undefined
    for (;;) {
      const page = await store.listTimeline(issue.id, { limit: 2, before })
      collected.push(...page.items.map((item) => item.id))
      if (!page.nextCursor) break
      before = page.nextCursor
    }
    expect(collected).toEqual(full.items.map((item) => item.id))
    expect(new Set(collected).size).toBe(collected.length)
  })
})

describe("watchers", () => {
  test("add and remove are idempotent", async () => {
    const { store, project, status } = await setup()
    const issue = await store.createIssue(project.id, {
      title: "Watch",
      statusId: status.id,
    })
    await store.addWatcher(issue.id, member.id)
    await store.addWatcher(issue.id, member.id)
    expect(await store.isWatching(issue.id, member.id)).toBe(true)
    expect(await store.listWatcherIds(issue.id)).toEqual([member.id])
    await store.removeWatcher(issue.id, member.id)
    await store.removeWatcher(issue.id, member.id)
    expect(await store.isWatching(issue.id, member.id)).toBe(false)
    expect(await store.listWatcherIds(issue.id)).toEqual([])
  })
})

describe("notifications", () => {
  let fixture: Fixture
  let issueId: string

  beforeEach(async () => {
    fixture = await setup()
    const issue = await fixture.store.createIssue(fixture.project.id, {
      title: "Notify",
      statusId: fixture.status.id,
    })
    issueId = issue.id
  })

  function notify(userId: string, label: string) {
    return fixture.store.createNotification({
      userId,
      issueId,
      type: "comment.created",
      actorType: "user",
      actorId: member.id,
      payload: { issueIdentifier: "WEB-7", issueTitle: "Notify", label },
    })
  }

  test("ownership, read state, count, and read-all", async () => {
    const { store } = fixture
    const first = await notify(member.id, "one")
    const second = await notify(member.id, "two")
    await notify(owner.id, "owner")

    expect(await store.markNotificationRead(first.id, owner.id)).toBeNull()
    expect(await store.markNotificationRead("missing", member.id)).toBeNull()

    const read = await store.markNotificationRead(first.id, member.id)
    expect(read?.readAt).not.toBeNull()
    expect(await store.unreadNotificationCount(member.id)).toBe(1)

    const all = await store.listNotifications(member.id, { filter: "all" })
    expect(all.notifications).toHaveLength(2)
    const unread = await store.listNotifications(member.id, {
      filter: "unread",
    })
    expect(unread.notifications.map((row) => row.id)).toEqual([second.id])

    expect(await store.markAllNotificationsRead(member.id)).toBe(1)
    expect(await store.unreadNotificationCount(member.id)).toBe(0)
    expect(
      (await store.listNotifications(member.id, { filter: "unread" }))
        .notifications
    ).toEqual([])
  })

  test("listNotifications cursor pages have no duplicates or gaps", async () => {
    const { store } = fixture
    for (let index = 0; index < 4; index += 1) {
      await notify(member.id, `n${index}`)
    }
    const collected: string[] = []
    let before: string | undefined
    for (;;) {
      const page = await store.listNotifications(member.id, {
        filter: "all",
        limit: 2,
        before,
      })
      collected.push(...page.notifications.map((row) => row.id))
      if (!page.nextCursor) break
      before = page.nextCursor
    }
    const all = await store.listNotifications(member.id, {
      filter: "all",
      limit: 100,
    })
    expect(collected).toEqual(all.notifications.map((row) => row.id))
    expect(new Set(collected).size).toBe(collected.length)
  })

  test("digest grouping filters by age, unread state, mode, and email", async () => {
    const { store } = fixture
    const memberRow = await notify(member.id, "member")
    const ownerRow = await notify(owner.id, "owner")
    const noEmailRow = await notify(noEmail.id, "missing")
    await store.setNotificationSettings(owner.id, "off")
    await store.setNotificationSettings(member.id, "digest")

    const cutoff = new Date(Date.now() + 60_000).toISOString()
    const groups = await store.listDigestGroups(cutoff)
    expect(groups).toHaveLength(1)
    expect(groups[0].userId).toBe(member.id)
    expect(groups[0].email).toBe(member.email)
    expect(groups[0].notifications.map((row) => row.id)).toEqual([memberRow.id])

    await store.markNotificationsEmailed([memberRow.id], cutoff)
    expect(await store.listDigestGroups(cutoff)).toEqual([])
    // Read rows leave the digest too.
    await store.markNotificationRead(ownerRow.id, owner.id)
    await store.markNotificationRead(noEmailRow.id, noEmail.id)
    expect(await store.listDigestGroups(cutoff)).toEqual([])

    const oldCutoff = new Date(Date.now() - 60_000).toISOString()
    expect(await store.listDigestGroups(oldCutoff)).toEqual([])
  })

  test("settings default to digest and purge removes only read rows", async () => {
    const { store } = fixture
    expect(await store.getNotificationSettings(member.id)).toEqual({
      userId: member.id,
      emailMode: "digest",
    })
    expect(await store.setNotificationSettings(member.id, "immediate")).toEqual(
      { userId: member.id, emailMode: "immediate" }
    )

    const first = await notify(member.id, "read")
    await notify(member.id, "unread")
    await store.markNotificationRead(first.id, member.id)
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(await store.purgeReadNotifications(future)).toBe(1)
    expect(await store.unreadNotificationCount(member.id)).toBe(1)
  })
})

describe("My Issues and project scoping", () => {
  test("listProjects scopes Viewers to granted projects", async () => {
    const { store, workspace, project } = await setup()
    const second = await store.createProject(workspace.id, {
      name: "Second",
      key: "SEC",
    })
    await store.addProjectViewer(project.id, viewer.id)

    expect(
      (await store.listProjects(workspace.id)).map((row) => row.id)
    ).toEqual([project.id, second.id])
    expect(
      (await store.listProjects(workspace.id, member.id)).map((row) => row.id)
    ).toEqual([project.id, second.id])
    expect(
      (await store.listProjects(workspace.id, viewer.id)).map((row) => row.id)
    ).toEqual([project.id])
  })

  test("listMembers includes emails from the user directory", async () => {
    const { store, workspace } = await setup()
    const rows = await store.listMembers(workspace.id)
    const byUser = new Map(rows.map((row) => [row.userId, row]))
    expect(byUser.get(owner.id)?.email).toBe(owner.email)
    expect(byUser.get(member.id)?.email).toBe(member.email)
  })

  test("invitations expire seven days after creation", async () => {
    const { store, workspace } = await setup()
    const invitation = await store.createInvitation({
      workspaceId: workspace.id,
      email: "new@example.com",
      role: "Member",
      invitedBy: owner.id,
    })
    const delta = new Date(invitation.expiresAt).getTime() - Date.now()
    expect(delta).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
    expect(delta).toBeLessThan(7.1 * 24 * 60 * 60 * 1000)
  })

  test("My Issues tabs scope, filter, and sort by updatedAt", async () => {
    const { store, workspace, project, status } = await setup()
    await store.addProjectViewer(project.id, viewer.id)
    // A sibling project in the same workspace is not granted to the Viewer.
    const sibling = await store.createProject(workspace.id, {
      name: "Sibling",
      key: "SIB",
    })
    await clearSeededTracker(store, sibling.id)
    const siblingStatus = await store.createStatus(sibling.id, {
      name: "Todo",
      category: "Unstarted",
    })
    const siblingIssue = await store.createIssue(
      sibling.id,
      { title: "Sibling", statusId: siblingStatus.id },
      ownerActor
    )
    await store.addWatcher(siblingIssue.id, viewer.id)
    const otherWorkspace = await store.createWorkspace(owner.id, "Other")
    const otherProject = await store.createProject(otherWorkspace.id, {
      name: "Other",
      key: "OTH",
    })
    await clearSeededTracker(store, otherProject.id)
    const otherStatus = await store.createStatus(otherProject.id, {
      name: "Todo",
      category: "Unstarted",
    })

    const assigned = await store.createIssue(
      project.id,
      { title: "Assigned", statusId: status.id, assigneeId: member.id },
      memberActor
    )
    const created = await store.createIssue(
      project.id,
      { title: "Created", statusId: status.id },
      memberActor
    )
    const watched = await store.createIssue(
      project.id,
      { title: "Watched", statusId: status.id },
      ownerActor
    )
    await store.addWatcher(watched.id, viewer.id)
    // Outside the member's workspaces: the row exists for the owner only.
    const elsewhere = await store.createIssue(
      otherProject.id,
      { title: "Elsewhere", statusId: otherStatus.id, assigneeId: owner.id },
      ownerActor
    )
    // Granted Viewer project rows still count for that Viewer.
    const granted = await store.createIssue(
      project.id,
      { title: "Granted", statusId: status.id },
      ownerActor
    )
    await store.addWatcher(granted.id, viewer.id)

    // Bump the created issue so updatedAt ordering is observable.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await store.updateIssue(created.id, { priority: "High" }, memberActor)

    const assignedRows = await store.listMyIssues(member.id, "assigned")
    expect(assignedRows.map((row) => row.id)).toEqual([assigned.id])

    const createdRows = await store.listMyIssues(member.id, "created")
    expect(createdRows.map((row) => row.id)).toEqual([created.id, assigned.id])

    const watchedRows = await store.listMyIssues(viewer.id, "watched")
    expect(new Set(watchedRows.map((row) => row.id))).toEqual(
      new Set([watched.id, granted.id])
    )
    expect(watchedRows.map((row) => row.id)).not.toContain(siblingIssue.id)
    for (let index = 1; index < watchedRows.length; index += 1) {
      expect(
        watchedRows[index - 1].updatedAt >= watchedRows[index].updatedAt
      ).toBe(true)
    }

    expect(
      (await store.listMyIssues(owner.id, "assigned")).map((row) => row.id)
    ).toEqual([elsewhere.id])
  })
})

const ownerActor: Actor = { type: "user", id: owner.id, name: "Owner" }
