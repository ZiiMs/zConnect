import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { createIntegrationCipher } from "../lib/cipher.js"
import { createWorkspacesApp } from "../workspaces/routes.js"
import type { Session } from "../workspaces/session.js"
import {
  createMemoryWorkspaceStore,
  type Project,
  type WorkspaceStore,
} from "../workspaces/store.js"
import { createGitHubConnectionApp } from "./connection-routes.js"
import { createGitHubProjectApp } from "./project-routes.js"
import type { GitHubRemote } from "./provider.js"
import { createGitHubApp } from "./routes.js"
import {
  createMemoryGitHubStore,
  type GitHubRepository,
  type RemoteRepository,
} from "./store.js"
import type { GitHubAccountSource } from "./token-source.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [viewer.id]: viewer,
  [outsider.id]: outsider,
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

const KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")

const remoteRepositories: RemoteRepository[] = [
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

function fakeRemote(): GitHubRemote {
  return {
    async listRepositories(_token, query) {
      const lower = (query ?? "").toLowerCase()
      return remoteRepositories.filter((repository) =>
        repository.fullName.toLowerCase().includes(lower)
      )
    },
    async getViewerLogin() {
      return "octocat"
    },
  }
}

const accounts: GitHubAccountSource = {
  async getLinkedAccount() {
    return {
      accountId: "ba-account-1",
      accessToken: "token-1",
      scopes: ["repo"],
    }
  },
}

interface RepositoriesBody {
  items: Array<{
    id: string
    githubId: string
    fullName: string
    unavailable: boolean
    linkedAt: string
    linkedBy: string
    lastSyncedAt: string | null
    syncError: string | null
  }>
  connection: { status: string; login: string } | null
}

function setup() {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore({
    projectWorkspaceId: async (projectId) =>
      (await workspaces.getProject(projectId))?.workspaceId ?? null,
  })
  const app = new Hono()
  const getSession = async (req: Request) => {
    const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
    const user = match ? users[match[1]] : undefined
    return user ? { user } : null
  }
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
      accounts,
      cipher: createIntegrationCipher(KEY),
      remote: fakeRemote(),
    })
  )
  app.route("/", createGitHubProjectApp({ workspaces, github, getSession }))
  return { app, workspaces, github }
}

async function seed(app: Hono, workspaces: WorkspaceStore) {
  const workspace = await workspaces.createWorkspace(owner.id, "Acme")
  const web = await workspaces.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  const mobile = await workspaces.createProject(workspace.id, {
    name: "Mobile",
    key: "MOB",
  })
  await workspaces.addProjectViewer(web.id, viewer.id)

  await app.request(`/api/workspaces/${workspace.id}/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(owner.id) },
    body: JSON.stringify({ email: member.email, role: "Member" }),
  })
  const invites = await app.request("/api/invitations", {
    headers: auth(member.id),
  })
  const [{ id }] = (await invites.json()) as { id: string }[]
  await app.request(`/api/invitations/${id}/accept`, {
    method: "POST",
    headers: auth(member.id),
  })

  return { workspaceId: workspace.id, web, mobile }
}

async function connect(app: Hono, workspaceId: string, userId = owner.id) {
  const res = await app.request(
    `/api/workspaces/${workspaceId}/github-connection`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify({}),
    }
  )
  return res
}

async function setAllowlist(
  app: Hono,
  workspaceId: string,
  githubIds: string[],
  userId = owner.id
) {
  const res = await app.request(
    `/api/workspaces/${workspaceId}/github-connection/repositories`,
    {
      method: "PUT",
      headers: { "content-type": "application/json", ...auth(userId) },
      body: JSON.stringify({ githubIds }),
    }
  )
  return res
}

async function allowlist(
  github: ReturnType<typeof createMemoryGitHubStore>,
  workspaceId: string
): Promise<GitHubRepository[]> {
  const connection = await github.getConnection(workspaceId)
  if (!connection) throw new Error("connection missing in fixture")
  return github.listAllowlist(connection.id)
}

function byName(
  repositories: GitHubRepository[],
  fullName: string
): GitHubRepository {
  const found = repositories.find(
    (repository) => repository.fullName === fullName
  )
  if (!found) throw new Error(`repository ${fullName} missing in fixture`)
  return found
}

async function readRepositories(
  app: Hono,
  project: Project,
  userId = owner.id
) {
  const res = await app.request(`/api/projects/${project.id}/repositories`, {
    headers: auth(userId),
  })
  return { res, body: (await res.json()) as RepositoriesBody }
}

async function setProjectRepositories(
  app: Hono,
  project: Project,
  repositoryIds: string[],
  userId = owner.id
) {
  const res = await app.request(`/api/projects/${project.id}/repositories`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...auth(userId) },
    body: JSON.stringify({ repositoryIds }),
  })
  return { res, body: (await res.json()) as RepositoriesBody }
}

/** One workspace, two projects, a member, a Viewer grant, and two repos. */
async function ready() {
  const { app, workspaces, github } = setup()
  const { workspaceId, web, mobile } = await seed(app, workspaces)
  await connect(app, workspaceId)
  await setAllowlist(app, workspaceId, ["101", "102"])
  const repositories = await allowlist(github, workspaceId)
  return {
    app,
    workspaces,
    github,
    workspaceId,
    web,
    mobile,
    webRepo: byName(repositories, "acme/web"),
    apiRepo: byName(repositories, "acme/api"),
  }
}

describe("project repositories", () => {
  test("an admin links allowlisted repositories and everyone reads sync state", async () => {
    const { app, github, web, mobile, webRepo, apiRepo } = await ready()
    await github.updateRepository(apiRepo.id, {
      syncError: "Forbidden",
      lastSyncedAt: "2026-10-10T10:00:00.000Z",
    })

    const linked = await setProjectRepositories(app, web, [
      webRepo.id,
      apiRepo.id,
    ])
    expect(linked.res.status).toBe(200)
    expect(linked.body.items.map((item) => item.fullName)).toEqual([
      "acme/api",
      "acme/web",
    ])
    expect(linked.body.items[0]).toMatchObject({
      id: apiRepo.id,
      linkedBy: owner.id,
      unavailable: true,
      syncError: "Forbidden",
      lastSyncedAt: "2026-10-10T10:00:00.000Z",
    })
    expect(linked.body.items[1]).toMatchObject({
      id: webRepo.id,
      linkedBy: owner.id,
      unavailable: false,
    })
    expect(typeof linked.body.items[0].linkedAt).toBe("string")
    expect(linked.body.connection).toEqual({
      status: "active",
      login: "octocat",
    })

    // Members read the same links and their state.
    const read = await readRepositories(app, web, member.id)
    expect(read.res.status).toBe(200)
    expect(read.body).toEqual(linked.body)

    // Linking is project-scoped: the sibling project stays empty.
    const sibling = await readRepositories(app, mobile, member.id)
    expect(sibling.res.status).toBe(200)
    expect(sibling.body.items).toEqual([])
    expect(sibling.body.connection).toEqual({
      status: "active",
      login: "octocat",
    })
  })

  test("a project with no connection reads empty links and a null connection", async () => {
    const { app, workspaces } = setup()
    const workspace = await workspaces.createWorkspace(owner.id, "Acme")
    const project = await workspaces.createProject(workspace.id, {
      name: "Web",
      key: "WEB",
    })

    const read = await readRepositories(app, project)
    expect(read.res.status).toBe(200)
    expect(read.body).toEqual({ items: [], connection: null })
  })

  test("unlinking a repository removes it from that project only", async () => {
    const { app, github, web, mobile, webRepo, apiRepo, workspaceId } =
      await ready()
    await setProjectRepositories(app, web, [webRepo.id, apiRepo.id])
    await setProjectRepositories(app, mobile, [webRepo.id])

    const unlinked = await setProjectRepositories(app, web, [apiRepo.id])
    expect(unlinked.res.status).toBe(200)
    expect(unlinked.body.items.map((item) => item.fullName)).toEqual([
      "acme/api",
    ])

    const sibling = await readRepositories(app, mobile)
    expect(sibling.body.items.map((item) => item.fullName)).toEqual([
      "acme/web",
    ])

    // The workspace connection and allowlist are untouched.
    expect(await allowlist(github, workspaceId)).toHaveLength(2)
    expect((await github.listRepositoryProjectIds(webRepo.id)).sort()).toEqual([
      mobile.id,
    ])

    const cleared = await setProjectRepositories(app, mobile, [])
    expect(cleared.res.status).toBe(200)
    expect(cleared.body.items).toEqual([])
    expect(await github.listRepositoryProjectIds(webRepo.id)).toEqual([])
  })

  test("removing a repository from the allowlist drops its project links and keeps External Links", async () => {
    const { app, github, web, mobile, webRepo, apiRepo, workspaceId } =
      await ready()
    await setProjectRepositories(app, web, [webRepo.id, apiRepo.id])
    await setProjectRepositories(app, mobile, [webRepo.id])
    const externalLink = await app.request("/api/issues/WEB-1/external-links", {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(member.id) },
      body: JSON.stringify({ url: "https://github.com/acme/web/pull/7" }),
    })
    expect(externalLink.status).toBe(201)

    const removed = await setAllowlist(app, workspaceId, ["102"])
    expect(removed.status).toBe(200)
    const removedBody = (await removed.json()) as { removed: number }
    expect(removedBody.removed).toBe(1)

    // The dropped repository leaves every project.
    const webRead = await readRepositories(app, web)
    expect(webRead.body.items.map((item) => item.fullName)).toEqual([
      "acme/api",
    ])
    const mobileRead = await readRepositories(app, mobile)
    expect(mobileRead.body.items).toEqual([])
    expect(await github.listRepositoryProjectIds(webRepo.id)).toEqual([])
    expect(
      (await github.listLinkedRepositories()).map(
        (repository) => repository.fullName
      )
    ).toEqual(["acme/api"])

    // External Links on Issues survive the cascade with their data.
    const links = await app.request("/api/issues/WEB-1/external-links", {
      headers: auth(member.id),
    })
    expect(links.status).toBe(200)
    const linkBody = (await links.json()) as Array<{ url: string }>
    expect(linkBody.map((link) => link.url)).toEqual([
      "https://github.com/acme/web/pull/7",
    ])
  })

  test("disconnecting the workspace drops every project link", async () => {
    const { app, github, web, mobile, webRepo, apiRepo, workspaceId } =
      await ready()
    await setProjectRepositories(app, web, [webRepo.id])
    await setProjectRepositories(app, mobile, [apiRepo.id])

    const removed = await app.request(
      `/api/workspaces/${workspaceId}/github-connection`,
      { method: "DELETE", headers: auth(owner.id) }
    )
    expect(removed.status).toBe(200)

    expect((await readRepositories(app, web)).body).toEqual({
      items: [],
      connection: null,
    })
    expect((await readRepositories(app, mobile)).body).toEqual({
      items: [],
      connection: null,
    })
    expect(await github.listLinkedRepositories()).toEqual([])
  })

  test("members and viewers read links, but writes require an Owner or Admin", async () => {
    const { app, github, web, webRepo } = await ready()
    await setProjectRepositories(app, web, [webRepo.id])

    const memberRead = await readRepositories(app, web, member.id)
    expect(memberRead.res.status).toBe(200)
    expect(memberRead.body.items).toHaveLength(1)

    // A Viewer grant reads the project but is not a manage role.
    const viewerRead = await readRepositories(app, web, viewer.id)
    expect(viewerRead.res.status).toBe(200)
    expect(viewerRead.body.items.map((item) => item.fullName)).toEqual([
      "acme/web",
    ])

    const memberWrite = await setProjectRepositories(app, web, [], member.id)
    expect(memberWrite.res.status).toBe(403)

    const viewerWrite = await setProjectRepositories(app, web, [], viewer.id)
    expect(viewerWrite.res.status).toBe(403)

    // Denied writes never touched the stored set.
    expect(await github.listProjectRepositories(web.id)).toHaveLength(1)

    const outsiderRead = await readRepositories(app, web, outsider.id)
    expect(outsiderRead.res.status).toBe(403)

    const anonymous = await app.request(`/api/projects/${web.id}/repositories`)
    expect(anonymous.status).toBe(401)
  })

  test("rejects unknown, foreign, oversized, and malformed repository sets", async () => {
    const { app, workspaces, github, web, webRepo } = await ready()
    const otherWorkspace = await workspaces.createWorkspace(owner.id, "Beta")
    await connect(app, otherWorkspace.id)
    await setAllowlist(app, otherWorkspace.id, ["103"])
    const foreign = byName(
      await allowlist(github, otherWorkspace.id),
      "acme/legacy"
    )

    const foreignWrite = await setProjectRepositories(app, web, [foreign.id])
    expect(foreignWrite.res.status).toBe(400)

    // A foreign id next to a valid one still fails the whole request.
    const mixedWrite = await setProjectRepositories(app, web, [
      webRepo.id,
      foreign.id,
    ])
    expect(mixedWrite.res.status).toBe(400)
    expect(await github.listProjectRepositories(web.id)).toEqual([])

    const unknownWrite = await setProjectRepositories(app, web, [
      "00000000-0000-4000-8000-000000000000",
    ])
    expect(unknownWrite.res.status).toBe(400)

    const tooMany = await setProjectRepositories(
      app,
      web,
      Array.from(
        { length: 51 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
      )
    )
    expect(tooMany.res.status).toBe(400)

    const malformed = await app.request(
      `/api/projects/${web.id}/repositories`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ repositoryIds: webRepo.id }),
      }
    )
    expect(malformed.status).toBe(400)

    // Unknown project ids are 404 for reads and writes.
    const missingRead = await app.request(
      "/api/projects/00000000-0000-4000-8000-000000000000/repositories",
      { headers: auth(owner.id) }
    )
    expect(missingRead.status).toBe(404)
    const missingWrite = await app.request(
      "/api/projects/00000000-0000-4000-8000-000000000000/repositories",
      {
        method: "PUT",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ repositoryIds: [] }),
      }
    )
    expect(missingWrite.status).toBe(404)
  })

  test("replacing with the same set is idempotent and keeps linkedAt", async () => {
    const { app, github, web, webRepo, apiRepo } = await ready()

    const first = await setProjectRepositories(app, web, [
      webRepo.id,
      apiRepo.id,
      webRepo.id,
    ])
    expect(first.res.status).toBe(200)
    expect(first.body.items).toHaveLength(2)
    const linkedAt = new Map(
      first.body.items.map((item) => [item.id, item.linkedAt])
    )

    const again = await setProjectRepositories(app, web, [
      webRepo.id,
      apiRepo.id,
    ])
    expect(again.res.status).toBe(200)
    for (const item of again.body.items) {
      expect(linkedAt.get(item.id)).toBe(item.linkedAt)
      expect(item.linkedBy).toBe(owner.id)
    }
    expect(await github.listRepositoryProjectIds(webRepo.id)).toEqual([web.id])
    expect(await github.listRepositoryProjectIds(apiRepo.id)).toEqual([web.id])
  })
})
