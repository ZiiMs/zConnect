import { Hono } from "hono"
import { z } from "zod"
import type { IntegrationCipher } from "../lib/cipher.js"
import type { GetSession } from "../workspaces/session.js"
import type { WorkspaceStore } from "../workspaces/store.js"
import {
  type GitHubConnection,
  type GitHubConnectionSecret,
  type GitHubRepository,
  type GitHubStore,
  MAX_ALLOWLIST,
  type RemoteRepository,
} from "./store.js"
import type { GitHubAccountSource } from "./token-source.js"

/**
 * Remote repository access the Connection routes need before the full
 * GitProvider seam exists (#49): list repositories reachable by the token
 * and resolve the connector's login for display.
 */
export interface GitHubRemote {
  listRepositories(
    accessToken: string,
    query?: string
  ): Promise<RemoteRepository[]>
  getViewerLogin(accessToken: string): Promise<string>
}

export interface GitHubConnectionDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
  getSession: GetSession
  accounts: GitHubAccountSource
  /** Null when INTEGRATION_ENCRYPTION_KEY is unset: connect answers 503. */
  cipher: IntegrationCipher | null
  remote: GitHubRemote
}

/** Safe connection view: the encrypted token is never serialized. */
export interface GitHubConnectionView extends GitHubConnection {
  connectorName: string | null
  repositoryCount: number
}

export interface GitHubRepositoryView extends GitHubRepository {
  unavailable: boolean
}

const allowlistBody = z.object({
  githubIds: z.array(z.string().trim().min(1)).max(500),
})

function toConnectionView(
  connection: GitHubConnectionSecret,
  connectorName: string | null,
  repositoryCount: number
): GitHubConnectionView {
  const { encryptedAccessToken: _token, ...safe } = connection
  return {
    ...safe,
    scopes: [...safe.scopes],
    connectorName,
    repositoryCount,
  }
}

function toRepositoryView(repository: GitHubRepository): GitHubRepositoryView {
  return { ...repository, unavailable: repository.syncError !== null }
}

/**
 * GitHub Connection HTTP boundary (#47). Read is workspace membership;
 * connect, reconnect, disconnect and the allowlist are Owner/Admin only.
 * Mounted additively next to the existing GitHub webhook app.
 */
export function createGitHubConnectionApp({
  workspaces,
  github,
  getSession,
  accounts,
  cipher,
  remote,
}: GitHubConnectionDeps) {
  const app = new Hono()

  async function membership(workspaceId: string, userId: string) {
    return workspaces.getMembership(workspaceId, userId)
  }

  async function adminMembership(workspaceId: string, userId: string) {
    const found = await membership(workspaceId, userId)
    return found && found.role !== "Member" ? found : null
  }

  async function view(
    connection: GitHubConnectionSecret,
    repositories: GitHubRepository[]
  ): Promise<GitHubConnectionView> {
    const members = await workspaces.listMembers(connection.workspaceId)
    const connectorName =
      members.find((item) => item.userId === connection.connectorUserId)
        ?.name ?? null
    return toConnectionView(connection, connectorName, repositories.length)
  }

  async function connectionState(workspaceId: string) {
    const connection = await github.getConnection(workspaceId)
    if (!connection) return null
    return {
      connection,
      repositories: await github.listAllowlist(connection.id),
    }
  }

  app.get("/api/workspaces/:id/github-connection", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    if (!(await membership(workspaceId, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const state = await connectionState(workspaceId)
    if (!state) return c.json({ connection: null, repositories: [] })
    return c.json({
      connection: await view(state.connection, state.repositories),
      repositories: state.repositories.map(toRepositoryView),
    })
  })

  app.post("/api/workspaces/:id/github-connection", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    if (!(await adminMembership(workspaceId, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    if (!cipher) {
      return c.json({ error: "GitHub connection is not configured" }, 503)
    }
    // The finalize body is either absent or `{}`; nothing is trusted from it.
    await c.req.json().catch(() => ({}))
    const account = await accounts.getLinkedAccount(session.user.id)
    if (!account) return c.json({ error: "GitHub account not linked" }, 400)
    let login: string
    try {
      login = await remote.getViewerLogin(account.accessToken)
    } catch {
      return c.json({ error: "GitHub account not linked" }, 400)
    }
    const at = new Date().toISOString()
    const connection = await github.upsertConnection({
      workspaceId,
      connectorUserId: session.user.id,
      connectorAccountId: account.accountId,
      login,
      scopes: [...account.scopes],
      encryptedAccessToken: cipher.encrypt(account.accessToken),
      at,
    })
    const repositories = await github.listAllowlist(connection.id)
    return c.json(
      {
        connection: await view(connection, repositories),
        repositories: repositories.map(toRepositoryView),
      },
      201
    )
  })

  app.delete("/api/workspaces/:id/github-connection", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    if (!(await adminMembership(workspaceId, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    // Cascades repositories, project links and cached items; External Links
    // on Issues are untouched.
    await github.deleteConnection(workspaceId)
    return c.json({ disconnected: true })
  })

  app.get("/api/workspaces/:id/github-connection/repositories", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    if (!(await adminMembership(workspaceId, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    if (!cipher) {
      return c.json({ error: "GitHub connection is not configured" }, 503)
    }
    const state = await connectionState(workspaceId)
    if (!state) return c.json({ error: "GitHub is not connected" }, 409)
    let accessToken: string
    try {
      accessToken = cipher.decrypt(state.connection.encryptedAccessToken)
    } catch {
      return c.json({ error: "GitHub connection needs to be reconnected" }, 502)
    }
    const query = (c.req.query("query") ?? "").trim()
    let items: RemoteRepository[]
    try {
      items = await remote.listRepositories(accessToken, query)
    } catch {
      return c.json({ error: "GitHub repositories are unavailable" }, 502)
    }
    const lower = query.toLowerCase()
    const selected = new Set(
      state.repositories.map((repository) => repository.githubId)
    )
    return c.json({
      items: items
        .filter((item) => item.fullName.toLowerCase().includes(lower))
        .sort((a, b) =>
          a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
        )
        .map((item) => ({ ...item, selected: selected.has(item.githubId) })),
    })
  })

  app.put("/api/workspaces/:id/github-connection/repositories", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    if (!(await adminMembership(workspaceId, session.user.id))) {
      return c.json({ error: "Forbidden" }, 403)
    }
    if (!cipher) {
      return c.json({ error: "GitHub connection is not configured" }, 503)
    }
    const state = await connectionState(workspaceId)
    if (!state) return c.json({ error: "GitHub is not connected" }, 409)
    const parsed = allowlistBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "Invalid repositories" }, 400)
    const githubIds = [...new Set(parsed.data.githubIds)]
    if (githubIds.length > MAX_ALLOWLIST) {
      return c.json(
        { error: `At most ${MAX_ALLOWLIST} repositories can be selected` },
        400
      )
    }
    let accessToken: string
    try {
      accessToken = cipher.decrypt(state.connection.encryptedAccessToken)
    } catch {
      return c.json({ error: "GitHub connection needs to be reconnected" }, 502)
    }
    let remoteRepositories: RemoteRepository[]
    try {
      remoteRepositories = await remote.listRepositories(accessToken)
    } catch {
      return c.json({ error: "GitHub repositories are unavailable" }, 502)
    }
    const byGithubId = new Map(
      remoteRepositories.map((repository) => [repository.githubId, repository])
    )
    const selected: RemoteRepository[] = []
    for (const githubId of githubIds) {
      const repository = byGithubId.get(githubId)
      if (!repository) return c.json({ error: "Unknown repository" }, 400)
      selected.push(repository)
    }
    const replaced = await github.replaceAllowlist(
      state.connection.id,
      selected,
      new Date().toISOString()
    )
    return c.json({
      repositories: replaced.repositories.map(toRepositoryView),
      removed: replaced.removedRepositoryIds.length,
    })
  })

  return app
}
