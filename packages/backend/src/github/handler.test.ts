import { beforeEach, describe, expect, test } from "bun:test"
import {
  createMemoryWorkspaceStore,
  type WorkspaceStore,
} from "../workspaces/store.js"
import {
  handlePullRequestEvent,
  handlePushEvent,
  type PullRequestEvent,
} from "./handler.js"
import { createMemoryGitHubStore, type GitHubStore } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }

function openedEvent(overrides?: Partial<PullRequestEvent>): PullRequestEvent {
  return {
    deliveryId: "delivery-1",
    action: "opened",
    repoFullName: "acme/web",
    branch: "WEB-1-fix-login",
    body: "Fixes WEB-1",
    url: "https://github.com/acme/web/pull/7",
    title: "Fix login",
    number: 7,
    merged: false,
    ...overrides,
  }
}

describe("pull request webhook handler", () => {
  let workspaces: WorkspaceStore
  let github: GitHubStore
  let workspaceId: string
  let statusId: string
  let issueId: string

  beforeEach(async () => {
    workspaces = createMemoryWorkspaceStore()
    github = createMemoryGitHubStore()
    const workspace = await workspaces.createWorkspace(owner.id, "Acme")
    workspaceId = workspace.id
    await workspaces.createProject(workspaceId, {
      name: "Web",
      key: "WEB",
    })
    // T2: every new project arrives with the seeded roster and six tutorial
    // issues, so this fixture links against the seeded first issue (WEB-1).
    const issue = await workspaces.getIssue("WEB-1")
    if (!issue) throw new Error("seeded WEB-1 issue missing")
    issueId = issue.id
    statusId = issue.statusId
    await github.createInstall(workspaceId, ["acme/web"])
  })

  test("opened PR auto-creates one External Link plus a timeline event", async () => {
    const result = await handlePullRequestEvent(
      { workspaces, github },
      openedEvent()
    )
    expect(result.linked).toEqual(["WEB-1"])
    const links = await github.listExternalLinks(issueId)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/7",
      title: "Fix login",
      state: "open",
    })
    const events = await github.listTimelineEvents(issueId)
    expect(events.map((e) => e.kind)).toEqual(["link.opened"])
  })

  test("redelivery of the same event is idempotent", async () => {
    await handlePullRequestEvent({ workspaces, github }, openedEvent())
    const result = await handlePullRequestEvent(
      { workspaces, github },
      openedEvent()
    )
    expect(result.skipped).toBe(true)
    expect(await github.listExternalLinks(issueId)).toHaveLength(1)
    expect(await github.listTimelineEvents(issueId)).toHaveLength(1)
  })

  test("synchronize refreshes the cached badge without duplicating", async () => {
    await handlePullRequestEvent({ workspaces, github }, openedEvent())
    await handlePullRequestEvent(
      { workspaces, github },
      openedEvent({
        deliveryId: "delivery-2",
        action: "synchronize",
        title: "Fix login (v2)",
      })
    )
    const links = await github.listExternalLinks(issueId)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ state: "open", title: "Fix login (v2)" })
  })

  test("merge sets the merged badge and leaves Status untouched", async () => {
    await handlePullRequestEvent({ workspaces, github }, openedEvent())
    await handlePullRequestEvent(
      { workspaces, github },
      openedEvent({ deliveryId: "delivery-3", action: "closed", merged: true })
    )
    const links = await github.listExternalLinks(issueId)
    expect(links[0].state).toBe("merged")
    const events = await github.listTimelineEvents(issueId)
    expect(events.map((e) => e.kind)).toEqual(["link.opened", "link.merged"])
    const issue = await workspaces.getIssue("WEB-1")
    expect(issue?.statusId).toBe(statusId)
  })

  test("closed without merge sets the closed badge", async () => {
    await handlePullRequestEvent({ workspaces, github }, openedEvent())
    await handlePullRequestEvent(
      { workspaces, github },
      openedEvent({ deliveryId: "delivery-4", action: "closed", merged: false })
    )
    expect((await github.listExternalLinks(issueId))[0].state).toBe("closed")
  })

  test("repos without an install and unknown identifiers link nothing", async () => {
    const foreign = await handlePullRequestEvent(
      { workspaces, github },
      openedEvent({ deliveryId: "delivery-5", repoFullName: "acme/other" })
    )
    expect(foreign.linked).toEqual([])
    const unknown = await handlePullRequestEvent(
      { workspaces, github },
      openedEvent({ deliveryId: "delivery-6", branch: "nope", body: "ZZZ-999" })
    )
    expect(unknown.linked).toEqual([])
    expect(await github.listExternalLinks(issueId)).toHaveLength(0)
  })

  test("PR title refs auto-link even when branch and body lack them", async () => {
    const result = await handlePullRequestEvent(
      { workspaces, github },
      openedEvent({
        branch: "fix-login",
        title: "Fix login WEB-1",
        body: "No refs here",
      })
    )
    expect(result.linked).toEqual(["WEB-1"])
    const links = await github.listExternalLinks(issueId)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/7",
    })
  })

  test("push commits with KEY-N create kind=commit links plus timeline events", async () => {
    const result = await handlePushEvent(
      { workspaces, github },
      {
        deliveryId: "push-1",
        repoFullName: "acme/web",
        commits: [
          {
            sha: "abc123def456",
            message: "Fix WEB-1 login redirect",
            url: "https://github.com/acme/web/commit/abc123def456",
          },
        ],
      }
    )
    expect(result).toEqual({ skipped: false, linked: ["WEB-1"] })
    const links = await github.listExternalLinks(issueId)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      provider: "github",
      kind: "commit",
      url: "https://github.com/acme/web/commit/abc123def456",
    })
    const events = await github.listTimelineEvents(issueId)
    expect(events.map((e) => e.kind)).toEqual(["link.opened"])
  })

  test("push redelivery is idempotent and unknown repos link nothing", async () => {
    const event = {
      deliveryId: "push-2",
      repoFullName: "acme/web",
      commits: [
        {
          sha: "abc123def456",
          message: "Fix WEB-1 login redirect",
          url: "https://github.com/acme/web/commit/abc123def456",
        },
      ],
    }
    await handlePushEvent({ workspaces, github }, event)
    const redelivery = await handlePushEvent({ workspaces, github }, event)
    expect(redelivery.skipped).toBe(true)
    expect(await github.listExternalLinks(issueId)).toHaveLength(1)
    expect(await github.listTimelineEvents(issueId)).toHaveLength(1)

    const foreign = await handlePushEvent(
      { workspaces, github },
      { ...event, deliveryId: "push-3", repoFullName: "acme/other" }
    )
    expect(foreign.linked).toEqual([])
    const unknown = await handlePushEvent(
      { workspaces, github },
      {
        deliveryId: "push-4",
        repoFullName: "acme/web",
        commits: [
          {
            sha: "deadbeef",
            message: "Unrelated change",
            url: "https://github.com/acme/web/commit/deadbeef",
          },
        ],
      }
    )
    expect(unknown.linked).toEqual([])
  })
})
