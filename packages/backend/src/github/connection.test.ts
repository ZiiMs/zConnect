import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import {
  createIntegrationCipher,
  type IntegrationCipher,
} from "../lib/cipher.js"
import { createWorkspacesApp } from "../workspaces/routes.js"
import type { Session } from "../workspaces/session.js"
import {
  createMemoryWorkspaceStore,
  type WorkspaceStore,
} from "../workspaces/store.js"
import { createGitHubConnectionApp } from "./connection-routes.js"
import type { GitHubRemote } from "./provider.js"
import { createGitHubApp } from "./routes.js"
import { createMemoryGitHubStore, type RemoteRepository } from "./store.js"
import type { GitHubAccountSource } from "./token-source.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [outsider.id]: outsider,
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

const KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")

export const remoteRepositories: RemoteRepository[] = [
  {
    githubId: "101",
    fullName: "acme/web",
    owner: "acme",
    name: "web",
    private: false,
    archived: false,
    issuesEnabled: true,
    defaultBranch: "main",
    pushedAt: "2026-10-01T10:00:00.000Z",
  },
  {
    githubId: "102",
    fullName: "acme/api",
    owner: "acme",
    name: "api",
    private: true,
    archived: false,
    issuesEnabled: true,
    defaultBranch: "main",
    pushedAt: "2026-10-02T10:00:00.000Z",
  },
  {
    githubId: "103",
    fullName: "acme/legacy",
    owner: "acme",
    name: "legacy",
    private: false,
    archived: true,
    issuesEnabled: false,
    defaultBranch: "master",
    pushedAt: null,
  },
]

function fakeRemote(): GitHubRemote & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async listRepositories(_token, query) {
      calls.push(`list:${query ?? ""}`)
      const lower = (query ?? "").toLowerCase()
      return remoteRepositories.filter((repo) =>
        repo.fullName.toLowerCase().includes(lower)
      )
    },
    async getViewerLogin(token) {
      calls.push(`login:${token}`)
      return token === "token-2" ? "hubot" : "octocat"
    },
  }
}

function fixedAccounts(): {
  source: GitHubAccountSource
  set: (account: { accountId: string; accessToken: string } | null) => void
} {
  let account: { accountId: string; accessToken: string } | null = {
    accountId: "ba-account-1",
    accessToken: "token-1",
  }
  return {
    source: {
      async getLinkedAccount() {
        return account ? { ...account, scopes: ["repo"] } : null
      },
    },
    set: (next) => {
      account = next
    },
  }
}

function setup(
  options: {
    cipher?: IntegrationCipher | null
    accounts?: ReturnType<typeof fixedAccounts>
  } = {}
) {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore()
  const app = new Hono()
  const getSession = async (req: Request) => {
    const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
    const user = match ? users[match[1]] : undefined
    return user ? { user } : null
  }
  const accounts = options.accounts ?? fixedAccounts()
  const remote = fakeRemote()
  const cipher =
    options.cipher === undefined ? createIntegrationCipher(KEY) : options.cipher
  app.route("/", createWorkspacesApp({ store: workspaces, getSession }))
  app.route(
    "/",
    createGitHubApp({
      workspaces,
      github,
      getSession,
      enqueue: async () => {},
    })
  )
  app.route(
    "/",
    createGitHubConnectionApp({
      workspaces,
      github,
      getSession,
      accounts: accounts.source,
      cipher,
      remote,
    })
  )
  return { app, workspaces, github, accounts, remote, cipher }
}

async function seed(app: Hono, workspaces: WorkspaceStore) {
  const workspace = await workspaces.createWorkspace(owner.id, "Acme")
  await workspaces.createProject(workspace.id, { name: "Web", key: "WEB" })
  const issue = await workspaces.getIssue("WEB-1")
  if (!issue) throw new Error("seeded WEB-1 issue missing")
  await app.request(`/api/workspaces/${workspace.id}/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(owner.id) },
    body: JSON.stringify({ email: member.email, role: "Member" }),
  })
  const mine = await app.request("/api/invitations", {
    headers: auth(member.id),
  })
  const [{ id }] = (await mine.json()) as { id: string }[]
  await app.request(`/api/invitations/${id}/accept`, {
    method: "POST",
    headers: auth(member.id),
  })
  return { workspaceId: workspace.id, issue }
}

async function connect(app: Hono, workspaceId: string) {
  const res = await app.request(
    `/api/workspaces/${workspaceId}/github-connection`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({}),
    }
  )
  return { res, body: (await res.json()) as Record<string, unknown> }
}

async function setAllowlist(
  app: Hono,
  workspaceId: string,
  githubIds: string[]
) {
  const res = await app.request(
    `/api/workspaces/${workspaceId}/github-connection/repositories`,
    {
      method: "PUT",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ githubIds }),
    }
  )
  return { res, body: (await res.json()) as Record<string, unknown> }
}

describe("github connection", () => {
  test("owner connects, then reads the safe connection view", async () => {
    const { app, workspaces, github, cipher } = setup()
    const { workspaceId } = await seed(app, workspaces)
    const { res, body } = await connect(app, workspaceId)

    expect(res.status).toBe(201)
    expect(body.connection).toMatchObject({
      workspaceId,
      connectorUserId: owner.id,
      connectorAccountId: "ba-account-1",
      login: "octocat",
      scopes: ["repo"],
      status: "active",
      connectorName: null,
      repositoryCount: 0,
      lastSyncedAt: null,
    })
    expect(body.repositories).toEqual([])
    // The response never carries token material.
    expect(JSON.stringify(body)).not.toContain("token-1")
    expect(JSON.stringify(body)).not.toContain("encryptedAccessToken")

    const stored = await github.getConnection(workspaceId)
    expect(stored?.encryptedAccessToken).not.toContain("token-1")
    expect(cipher?.decrypt(stored?.encryptedAccessToken ?? "")).toBe("token-1")

    const read = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { headers: auth(member.id) }
    )
    expect(read.status).toBe(200)
    const readBody = (await read.json()) as {
      connection: Record<string, unknown>
      repositories: unknown[]
    }
    expect(readBody.connection).toMatchObject({
      login: "octocat",
      status: "active",
      repositoryCount: 0,
    })
    expect(readBody.repositories).toEqual([])
    expect(JSON.stringify(readBody)).not.toContain("token-1")
    expect(JSON.stringify(readBody)).not.toContain("encryptedAccessToken")
  })

  test("members read status but cannot connect, change the allowlist, or disconnect", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    await connect(app, workspaceId)
    const base = `/api/workspaces/${workspaceId}/github-connection`

    const read = await app.request(base, { headers: auth(member.id) })
    expect(read.status).toBe(200)
    expect((await read.json()) as { connection: unknown }).toMatchObject({
      connection: { status: "active", login: "octocat" },
    })

    const post = await app.request(base, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({}),
    })
    expect(post.status).toBe(403)

    const put = await app.request(`${base}/repositories`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ githubIds: ["101"] }),
    })
    expect(put.status).toBe(403)

    const search = await app.request(`${base}/repositories`, {
      headers: auth(member.id),
    })
    expect(search.status).toBe(403)

    const del = await app.request(base, {
      method: "DELETE",
      headers: auth(member.id),
    })
    expect(del.status).toBe(403)

    // A Viewer grant is project-scoped; it never grants connection reads.
    const outsiderRead = await app.request(base, {
      headers: auth(outsider.id),
    })
    expect(outsiderRead.status).toBe(403)

    const anonymous = await app.request(base)
    expect(anonymous.status).toBe(401)
  })
})

describe("github repository allowlist", () => {
  test("search marks private/archived repositories and the current selection", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    await connect(app, workspaceId)
    await setAllowlist(app, workspaceId, ["101"])

    const search = await app.request(
      `/api/workspaces/${workspaceId}/github-connection/repositories?query=acme`,
      { headers: auth(owner.id) }
    )
    expect(search.status).toBe(200)
    const body = (await search.json()) as {
      items: Array<{
        githubId: string
        fullName: string
        private: boolean
        archived: boolean
        selected: boolean
      }>
    }
    expect(body.items.map((item) => item.fullName)).toEqual([
      "acme/api",
      "acme/legacy",
      "acme/web",
    ])
    expect(body.items.find((item) => item.githubId === "101")).toMatchObject({
      selected: true,
      private: false,
      archived: false,
    })
    expect(body.items.find((item) => item.githubId === "102")).toMatchObject({
      selected: false,
      private: true,
    })
    expect(body.items.find((item) => item.githubId === "103")).toMatchObject({
      selected: false,
      archived: true,
    })
    expect(JSON.stringify(body)).not.toContain("token-1")
    expect(JSON.stringify(body)).not.toContain("encryptedAccessToken")

    const filtered = await app.request(
      `/api/workspaces/${workspaceId}/github-connection/repositories?query=web`,
      { headers: auth(owner.id) }
    )
    const filteredBody = (await filtered.json()) as {
      items: Array<{ githubId: string }>
    }
    expect(filteredBody.items.map((item) => item.githubId)).toEqual(["101"])
  })

  test("saving replaces the allowlist and cascades removals", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    await connect(app, workspaceId)

    const first = await setAllowlist(app, workspaceId, ["101", "102"])
    expect(first.res.status).toBe(200)
    expect(first.body.removed).toBe(0)
    const firstRepositories = first.body.repositories as Array<{
      githubId: string
      selectedAt: string
      fullName: string
    }>
    expect(firstRepositories.map((repository) => repository.githubId)).toEqual([
      "101",
      "102",
    ])
    expect(JSON.stringify(first.body)).not.toContain("token-1")
    expect(JSON.stringify(first.body)).not.toContain("encryptedAccessToken")
    const selectedAt = firstRepositories[0].selectedAt

    // Saving the same set is idempotent: no new ids, no removed rows.
    const again = await setAllowlist(app, workspaceId, ["101", "102"])
    expect(again.body.removed).toBe(0)
    const againRepositories = again.body.repositories as Array<{
      githubId: string
      selectedAt: string
    }>
    expect(againRepositories[0].selectedAt).toBe(selectedAt)

    // Dropping a repository removes it from the connection.
    const dropped = await setAllowlist(app, workspaceId, ["102"])
    expect(dropped.res.status).toBe(200)
    expect(dropped.body.removed).toBe(1)
    expect(
      (dropped.body.repositories as Array<{ githubId: string }>).map(
        (repository) => repository.githubId
      )
    ).toEqual(["102"])

    const read = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { headers: auth(owner.id) }
    )
    const readBody = (await read.json()) as {
      connection: { repositoryCount: number }
      repositories: Array<{ githubId: string }>
    }
    expect(readBody.connection.repositoryCount).toBe(1)
    expect(
      readBody.repositories.map((repository) => repository.githubId)
    ).toEqual(["102"])

    // Removing every repository leaves an empty, still-active connection.
    const cleared = await setAllowlist(app, workspaceId, [])
    expect(cleared.res.status).toBe(200)
    expect(cleared.body.removed).toBe(1)
    expect(cleared.body.repositories).toEqual([])
  })

  test("rejects unknown ids, too many ids, and malformed bodies", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    await connect(app, workspaceId)
    const path = `/api/workspaces/${workspaceId}/github-connection/repositories`

    const unknown = await setAllowlist(app, workspaceId, ["999"])
    expect(unknown.res.status).toBe(400)

    const tooMany = await setAllowlist(
      app,
      workspaceId,
      Array.from({ length: 51 }, (_, index) => String(1000 + index))
    )
    expect(tooMany.res.status).toBe(400)

    const malformed = await app.request(path, {
      method: "PUT",
      headers: { "content-type": "application/json", ...auth(owner.id) },
      body: JSON.stringify({ githubIds: "101" }),
    })
    expect(malformed.status).toBe(400)

    // Duplicates collapse to one selection.
    const deduped = await setAllowlist(app, workspaceId, ["101", "101"])
    expect(deduped.res.status).toBe(200)
    expect(deduped.body.repositories).toHaveLength(1)
  })

  test("repositories require a connection", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    const path = `/api/workspaces/${workspaceId}/github-connection/repositories`
    expect((await app.request(path, { headers: auth(owner.id) })).status).toBe(
      409
    )
    expect((await setAllowlist(app, workspaceId, ["101"])).res.status).toBe(409)
  })
})

describe("github connection lifecycle", () => {
  test("reconnecting replaces the credential and clears reconnect_required", async () => {
    const { app, workspaces, github, accounts, cipher } = setup()
    const { workspaceId } = await seed(app, workspaces)
    const first = await connect(app, workspaceId)
    const firstConnection = first.body.connection as {
      id: string
      createdAt: string
    }
    await setAllowlist(app, workspaceId, ["101", "102"])
    await github.setConnectionStatus(workspaceId, "reconnect_required")

    const beforeRead = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { headers: auth(owner.id) }
    )
    expect((await beforeRead.json()) as unknown).toMatchObject({
      connection: { status: "reconnect_required", login: "octocat" },
    })

    accounts.set({ accountId: "ba-account-2", accessToken: "token-2" })
    const second = await connect(app, workspaceId)
    expect(second.res.status).toBe(201)
    expect(second.body.connection).toMatchObject({
      id: firstConnection.id,
      createdAt: firstConnection.createdAt,
      connectorAccountId: "ba-account-2",
      login: "hubot",
      status: "active",
      repositoryCount: 2,
    })
    expect((second.body.repositories as Array<unknown>).length).toBe(2)
    expect(JSON.stringify(second.body)).not.toContain("token-2")
    expect(JSON.stringify(second.body)).not.toContain("encryptedAccessToken")

    const stored = await github.getConnection(workspaceId)
    expect(cipher?.decrypt(stored?.encryptedAccessToken ?? "")).toBe("token-2")
    expect(stored?.status).toBe("active")
  })

  test("connecting without a linked GitHub account is a 400", async () => {
    const { app, workspaces, accounts } = setup()
    const { workspaceId } = await seed(app, workspaces)
    accounts.set(null)
    const { res, body } = await connect(app, workspaceId)
    expect(res.status).toBe(400)
    expect(body.error).toBe("GitHub account not linked")
  })

  test("connecting is unavailable without the integration key", async () => {
    const { app, workspaces } = setup({ cipher: null })
    const { workspaceId } = await seed(app, workspaces)
    const { res, body } = await connect(app, workspaceId)
    expect(res.status).toBe(503)
    expect(body.error).toBe("GitHub connection is not configured")

    const read = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { headers: auth(owner.id) }
    )
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual({ connection: null, repositories: [] })

    // Nothing was stored without a cipher.
    const search = await app.request(
      `/api/workspaces/${workspaceId}/github-connection/repositories`,
      { headers: auth(owner.id) }
    )
    expect(search.status).toBe(503)
  })

  test("disconnect drops repositories but keeps External Links", async () => {
    const { app, workspaces, github } = setup()
    const { workspaceId, issue } = await seed(app, workspaces)
    await connect(app, workspaceId)
    await setAllowlist(app, workspaceId, ["101"])
    const linked = await app.request(
      `/api/issues/${issue.identifier}/external-links`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ url: "https://github.com/acme/web/pull/7" }),
      }
    )
    expect(linked.status).toBe(201)

    const removed = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ disconnected: true })

    expect(await github.getConnection(workspaceId)).toBeNull()
    expect(await github.findRepositoryByRemoteFullName("acme/web")).toBeNull()

    const read = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { headers: auth(member.id) }
    )
    expect(await read.json()).toEqual({ connection: null, repositories: [] })

    const links = await app.request(
      `/api/issues/${issue.identifier}/external-links`,
      { headers: auth(member.id) }
    )
    expect(links.status).toBe(200)
    const linkBody = (await links.json()) as Array<{ url: string }>
    expect(linkBody).toHaveLength(1)
    expect(linkBody[0].url).toBe("https://github.com/acme/web/pull/7")

    // Disconnect is idempotent.
    const again = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(again.status).toBe(200)
  })
})
