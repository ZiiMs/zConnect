import { describe, expect, test } from "bun:test"
import { createMemoryGitHubStore } from "./store.js"

describe("github installs", () => {
  test("creates and lists installs scoped to a workspace", async () => {
    const store = createMemoryGitHubStore()
    const install = await store.createInstall("ws-1", ["acme/web"])
    expect(install.workspaceId).toBe("ws-1")
    expect(install.repos).toEqual(["acme/web"])
    expect(await store.listInstalls("ws-1")).toHaveLength(1)
    expect(await store.listInstalls("ws-other")).toHaveLength(0)
  })

  test("finds the install covering a webhook repo", async () => {
    const store = createMemoryGitHubStore()
    await store.createInstall("ws-1", ["acme/web"])
    expect((await store.findInstallByRepo("acme/web"))?.workspaceId).toBe(
      "ws-1"
    )
    expect(await store.findInstallByRepo("acme/other")).toBeNull()
  })
})

describe("external links", () => {
  test("creates a link and dedupes by issue plus URL", async () => {
    const store = createMemoryGitHubStore()
    const first = await store.createExternalLink("issue-1", {
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/7",
      title: "Fix login",
      state: "open",
    })
    const second = await store.createExternalLink("issue-1", {
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/7",
      title: "Fix login",
      state: "open",
    })
    expect(second.id).toBe(first.id)
    expect(await store.listExternalLinks("issue-1")).toHaveLength(1)
  })

  test("state updates refresh the cached badge without touching the issue", async () => {
    const store = createMemoryGitHubStore()
    const link = await store.createExternalLink("issue-1", {
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/7",
      title: "Fix login",
      state: "open",
    })
    const updated = await store.updateExternalLink(link.id, {
      state: "merged",
      title: "Fix login",
    })
    expect(updated.state).toBe("merged")
  })

  test("timeline events append in order per issue", async () => {
    const store = createMemoryGitHubStore()
    await store.appendTimelineEvent("issue-1", "link.opened", "PR #7 opened")
    await store.appendTimelineEvent("issue-1", "link.merged", "PR #7 merged")
    const events = await store.listTimelineEvents("issue-1")
    expect(events.map((e) => e.kind)).toEqual(["link.opened", "link.merged"])
    expect(await store.listTimelineEvents("issue-other")).toHaveLength(0)
  })

  test("delivery ids are processed once (webhook redelivery)", async () => {
    const store = createMemoryGitHubStore()
    expect(await store.hasProcessedDelivery("d-1")).toBe(false)
    await store.markDeliveryProcessed("d-1")
    expect(await store.hasProcessedDelivery("d-1")).toBe(true)
  })
})
