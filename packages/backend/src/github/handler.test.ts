import { beforeEach, describe, expect, test } from "bun:test"
import {
  createMemoryWorkspaceStore,
  type WorkspaceStore,
} from "../workspaces/store.js"
import { handlePullRequestEvent, type PullRequestEvent } from "./handler.js"
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
  let projectId: string
  let statusId: string
  let issueId: string

  beforeEach(async () => {
    workspaces = createMemoryWorkspaceStore()
    github = createMemoryGitHubStore()
    const workspace = await workspaces.createWorkspace(owner.id, "Acme")
    workspaceId = workspace.id
    const project = await workspaces.createProject(workspaceId, {
      name: "Web",
      key: "WEB",
    })
    projectId = project.id
    const status = await workspaces.createStatus(projectId, {
      name: "Backlog",
      category: "Todo",
    })
    statusId = status.id
    const issue = await workspaces.createIssue(projectId, {
      title: "Fix login",
      statusId,
    })
    issueId = issue.id
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
})
