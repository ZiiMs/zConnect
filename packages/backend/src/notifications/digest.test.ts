import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  spyOn,
  test,
} from "bun:test"
import { createMemoryMailer, type Mailer } from "../lib/mailer.js"
import {
  createMemoryWorkspaceStore,
  type Issue,
  type WorkspaceStore,
} from "../workspaces/store.js"
import { runDigestJob, slugifyWorkspace } from "./digest.js"

const member = { id: "user-member", email: "member@example.com" }
const owner = { id: "user-owner", email: "owner@example.com" }
const quiet = { id: "user-quiet", email: "quiet@example.com" }

const DAY_MS = 24 * 60 * 60 * 1000

interface Fixture {
  store: WorkspaceStore
  workspaceId: string
  issues: Issue[]
}

async function setup(): Promise<Fixture> {
  const store = createMemoryWorkspaceStore({
    users: {
      [member.id]: { name: "Ada", email: member.email },
      [owner.id]: { name: "Grace", email: owner.email },
      [quiet.id]: { name: "Quiet", email: quiet.email },
    },
  })
  const workspace = await store.createWorkspace(owner.id, "Acme Corp")
  await store.createProject(workspace.id, { name: "Web", key: "WEB" })
  // Every new project seeds WEB-1…WEB-6; two distinct issues are enough to
  // prove grouping.
  const issues: Issue[] = []
  for (const identifier of ["WEB-1", "WEB-2"]) {
    const issue = await store.getIssue(identifier)
    if (!issue) throw new Error(`seeded ${identifier} issue missing`)
    issues.push(issue)
  }
  return { store, workspaceId: workspace.id, issues }
}

function notify(
  fixture: Fixture,
  userId: string,
  issue: Issue,
  type: string,
  actorName = "Ada"
) {
  return fixture.store.createNotification({
    userId,
    issueId: issue.id,
    type,
    actorType: "user",
    actorId: "user-actor",
    payload: {
      issueIdentifier: issue.identifier,
      issueTitle: issue.title,
      workspaceId: fixture.workspaceId,
      actorName,
    },
  })
}

/** A clock far enough ahead that rows created "now" are outside the window. */
function eligibleClock(): Date {
  return new Date(Date.now() + 60 * 60 * 1000)
}

describe("runDigestJob", () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await setup()
  })

  afterEach(() => {
    setSystemTime()
  })

  test("sends one grouped email per user and dedupes the next run", async () => {
    const mailer = createMemoryMailer()
    const [first, second] = fixture.issues
    await notify(fixture, member.id, first, "comment.mention", "Ada")
    await notify(fixture, member.id, second, "issue.assigned", "Grace")

    const now = eligibleClock()
    const result = await runDigestJob({
      store: fixture.store,
      mailer,
      now,
      frontendUrl: "https://app.example.com/",
    })

    expect(result).toEqual({ users: 1, notifications: 2 })
    expect(mailer.sent).toHaveLength(1)
    const message = mailer.sent[0]
    expect(message.to).toBe(member.email)
    expect(message.subject).toBe("zConnect digest: 2 updates")
    expect(message.text).toContain(first.identifier)
    expect(message.text).toContain(first.title)
    expect(message.text).toContain(second.identifier)
    expect(message.text).toContain(second.title)
    expect(message.text).toContain("- Ada mentioned you")
    expect(message.text).toContain("- Grace assigned you")
    expect(message.text).toContain(
      `https://app.example.com/acme-corp/issue/${first.identifier}`
    )
    expect(message.text).toContain(
      `https://app.example.com/acme-corp/issue/${second.identifier}`
    )
    expect(message.text).toContain(
      "Manage notification settings or unsubscribe: https://app.example.com"
    )

    const all = await fixture.store.listNotifications(member.id, {
      filter: "all",
    })
    expect(all.notifications.every((row) => row.emailedAt !== null)).toBe(true)
    expect(all.notifications.map((row) => row.emailedAt)).toEqual([
      now.toISOString(),
      now.toISOString(),
    ])

    // Already-emailed rows never mail twice.
    const again = await runDigestJob({
      store: fixture.store,
      mailer,
      now,
      frontendUrl: "https://app.example.com",
    })
    expect(again).toEqual({ users: 0, notifications: 0 })
    expect(mailer.sent).toHaveLength(1)
  })

  test("an empty run sends nothing and returns zeros", async () => {
    const mailer = createMemoryMailer()
    const result = await runDigestJob({
      store: fixture.store,
      mailer,
      now: eligibleClock(),
    })
    expect(result).toEqual({ users: 0, notifications: 0 })
    expect(mailer.sent).toEqual([])
  })

  test("read rows and immediate/off owners are excluded", async () => {
    const mailer = createMemoryMailer()
    const [first] = fixture.issues
    const read = await notify(fixture, member.id, first, "comment.created")
    await fixture.store.markNotificationRead(read.id, member.id)
    await notify(fixture, owner.id, first, "comment.created")
    await fixture.store.setNotificationSettings(owner.id, "immediate")
    await notify(fixture, quiet.id, first, "comment.created")
    await fixture.store.setNotificationSettings(quiet.id, "off")

    const result = await runDigestJob({
      store: fixture.store,
      mailer,
      now: eligibleClock(),
    })

    expect(result).toEqual({ users: 0, notifications: 0 })
    expect(mailer.sent).toEqual([])
    for (const user of [member.id, owner.id, quiet.id]) {
      const rows = await fixture.store.listNotifications(user, {
        filter: "all",
      })
      expect(rows.notifications.every((row) => row.emailedAt === null)).toBe(
        true
      )
    }
  })

  test("rows created inside the 30-minute window are excluded", async () => {
    const mailer = createMemoryMailer()
    await notify(fixture, member.id, fixture.issues[0], "comment.created")

    // Real clock: the row is newer than `now - 30 minutes`, so it waits for a
    // later digest pass.
    const result = await runDigestJob({
      store: fixture.store,
      mailer,
      now: new Date(),
    })

    expect(result).toEqual({ users: 0, notifications: 0 })
    expect(mailer.sent).toEqual([])
  })

  test("a null mailer purges but never marks rows emailed", async () => {
    const [first, second] = fixture.issues
    await notify(fixture, member.id, first, "comment.mention")
    await notify(fixture, member.id, second, "comment.created")

    const result = await runDigestJob({
      store: fixture.store,
      mailer: null,
      now: eligibleClock(),
    })

    expect(result).toEqual({ users: 0, notifications: 0 })
    const all = await fixture.store.listNotifications(member.id, {
      filter: "all",
    })
    expect(all.notifications.every((row) => row.emailedAt === null)).toBe(true)
  })

  test("purges read notifications older than 90 days only", async () => {
    const [first] = fixture.issues
    setSystemTime(new Date(Date.now() - 100 * DAY_MS))
    const stale = await notify(fixture, member.id, first, "comment.created")
    await fixture.store.markNotificationRead(stale.id, member.id)

    setSystemTime()
    const recent = await notify(fixture, member.id, first, "comment.created")
    await fixture.store.markNotificationRead(recent.id, member.id)

    await runDigestJob({ store: fixture.store, mailer: null })

    const all = await fixture.store.listNotifications(member.id, {
      filter: "all",
    })
    expect(all.notifications.map((row) => row.id)).toEqual([recent.id])
  })

  test("one failed send does not abort the other users", async () => {
    const [first] = fixture.issues
    const failing = await notify(fixture, member.id, first, "comment.mention")
    const surviving = await notify(fixture, owner.id, first, "comment.mention")
    const sent: string[] = []
    const mailer: Mailer = {
      async send(message) {
        if (message.to === member.email) throw new Error("mailbox full")
        sent.push(message.to)
      },
    }
    const errorSpy = spyOn(console, "error").mockImplementation(() => {})

    try {
      const result = await runDigestJob({
        store: fixture.store,
        mailer,
        now: eligibleClock(),
      })
      expect(result).toEqual({ users: 1, notifications: 1 })
      expect(sent).toEqual([owner.email])
      const failedRows = await fixture.store.listNotifications(member.id, {
        filter: "all",
      })
      expect(failedRows.notifications[0].id).toBe(failing.id)
      expect(failedRows.notifications[0].emailedAt).toBeNull()
      const sentRows = await fixture.store.listNotifications(owner.id, {
        filter: "all",
      })
      expect(sentRows.notifications[0].id).toBe(surviving.id)
      expect(sentRows.notifications[0].emailedAt).not.toBeNull()
    } finally {
      errorSpy.mockRestore()
    }
  })

  test("unknown workspaces fall back to the frontend root", async () => {
    const mailer = createMemoryMailer()
    const [first] = fixture.issues
    await fixture.store.createNotification({
      userId: member.id,
      issueId: first.id,
      type: "comment.created",
      actorType: "user",
      actorId: "user-actor",
      payload: {
        issueIdentifier: first.identifier,
        issueTitle: first.title,
        workspaceId: "missing-workspace",
        actorName: "Ada",
      },
    })

    await runDigestJob({
      store: fixture.store,
      mailer,
      now: eligibleClock(),
      frontendUrl: "https://app.example.com/",
    })

    expect(mailer.sent[0].text).toContain(
      `https://app.example.com\n` // settings line only; no issue link
    )
    expect(mailer.sent[0].text).not.toContain("/issue/")
  })
})

describe("slugifyWorkspace", () => {
  test("matches the frontend slug rule and falls back", () => {
    expect(slugifyWorkspace("Acme Corp")).toBe("acme-corp")
    expect(slugifyWorkspace("  Web_Team! ")).toBe("web-team")
    expect(slugifyWorkspace("Crème Brûlée")).toBe("creme-brulee")
    expect(slugifyWorkspace("!!!")).toBe("workspace")
    expect(slugifyWorkspace("")).toBe("workspace")
  })
})
