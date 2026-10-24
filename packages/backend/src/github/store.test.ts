import { describe, expect, test } from "bun:test"
import { createMemoryGitHubStore, type RemoteRepository } from "./store.js"

const at = "2026-10-01T10:00:00.000Z"

function remoteRepository(
  fullName: string,
  githubId = "101"
): RemoteRepository {
  const [owner = "", name = ""] = fullName.split("/")
  return {
    githubId,
    fullName,
    owner,
    name,
    private: false,
    archived: false,
    issuesEnabled: true,
    defaultBranch: "main",
    pushedAt: null,
  }
}

describe("repository resolution", () => {
  test("resolves an allowlisted repository to its connection, case-insensitively", async () => {
    const store = createMemoryGitHubStore()
    const connection = await store.upsertConnection({
      workspaceId: "ws-1",
      connectorUserId: "user-1",
      connectorAccountId: "account-1",
      login: "octocat",
      scopes: ["repo"],
      encryptedAccessToken: "v1.test",
      at,
    })
    await store.replaceAllowlist(
      connection.id,
      [remoteRepository("Acme/Web")],
      at
    )

    const found = await store.findRepositoryByRemoteFullName("acme/web")
    expect(found?.connection.workspaceId).toBe("ws-1")
    expect(found?.repository.fullName).toBe("Acme/Web")
    expect(found?.connection).not.toHaveProperty("encryptedAccessToken")
    expect(await store.findRepositoryByRemoteFullName("acme/other")).toBeNull()
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

  test("finds links by URL, reads one, and deletes it idempotently", async () => {
    const store = createMemoryGitHubStore()
    const link = await store.createExternalLink("issue-1", {
      provider: "github",
      kind: "issue",
      url: "https://github.com/acme/web/issues/42",
      title: "Parser crash",
      state: "open",
    })

    expect(await store.findExternalLinksByUrl(link.url)).toEqual([link])
    expect(await store.findExternalLinksByUrl(`${link.url}/nope`)).toEqual([])
    expect(await store.getExternalLink(link.id)).toEqual(link)
    expect(await store.getExternalLink("missing")).toBeNull()

    expect(await store.deleteExternalLink(link.id)).toBe(true)
    expect(await store.getExternalLink(link.id)).toBeNull()
    expect(await store.deleteExternalLink(link.id)).toBe(false)
  })

  test("delivery ids are processed once (webhook redelivery)", async () => {
    const store = createMemoryGitHubStore()
    expect(await store.hasProcessedDelivery("d-1")).toBe(false)
    await store.markDeliveryProcessed("d-1")
    expect(await store.hasProcessedDelivery("d-1")).toBe(true)
  })
})
