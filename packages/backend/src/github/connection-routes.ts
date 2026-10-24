import { type Context, Hono } from "hono"
import { z } from "zod"
import type { IntegrationCipher } from "../lib/cipher.js"
import type { GetSession } from "../workspaces/session.js"
import type { WorkspaceStore } from "../workspaces/store.js"
import { type GitHubRemote, GitProviderError } from "./provider.js"
import {
  type GitHubConnection,
  type GitHubConnectionSecret,
  type GitHubRepository,
  type GitHubStore,
  MAX_ALLOWLIST,
  type RemoteRepository,
} from "./store.js"
import type { GitHubAccountSource } from "./token-source.js"

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
 * Outcome of decrypting the stored token and listing GitHub's repositories.
 * A 401 is distinct from the other failures because it pauses the Connection;
 * everything else leaves the stored status alone.
 */
type RepositoryListing =
  | { ok: true; accessToken: string; repositories: RemoteRepository[] }
  | { ok: false; failure: "decrypt_failed" | "unauthorized" | "unavailable" }

function listingFailure(
  c: Context,
  failure: "decrypt_failed" | "unauthorized" | "unavailable"
) {
  if (failure === "unauthorized") {
    return c.json(
      {
        error: "GitHub connection needs to be reconnected",
        status: "reconnect_required",
      },
      409
    )
  }
  if (failure === "decrypt_failed") {
    return c.json({ error: "GitHub connection needs to be reconnected" }, 502)
  }
  return c.json({ error: "GitHub repositories are unavailable" }, 502)
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

  /**
   * Shared by the repository search and the allowlist save. GitHub answers a
   * 401 by pausing the Connection; other provider failures keep the status.
   */
  async function decryptAndListRepositories(
    connection: GitHubConnectionSecret,
    query?: string
  ): Promise<RepositoryListing> {
    if (!cipher) return { ok: false, failure: "unavailable" }
    let accessToken: string
    try {
      accessToken = cipher.decrypt(connection.encryptedAccessToken)
    } catch {
      return { ok: false, failure: "decrypt_failed" }
    }
    try {
      return {
        ok: true,
        accessToken,
        repositories: await remote.listRepositories(accessToken, query),
      }
    } catch (error) {
      if (error instanceof GitProviderError && error.code === "unauthorized") {
        await github.setConnectionStatus(
          connection.workspaceId,
          "reconnect_required"
        )
        return { ok: false, failure: "unauthorized" }
      }
      return { ok: false, failure: "unavailable" }
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
    const query = (c.req.query("query") ?? "").trim()
    const listing = await decryptAndListRepositories(state.connection, query)
    if (!listing.ok) return listingFailure(c, listing.failure)
    const lower = query.toLowerCase()
    const selected = new Set(
      state.repositories.map((repository) => repository.githubId)
    )
    return c.json({
      items: listing.repositories
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
    const listing = await decryptAndListRepositories(state.connection)
    if (!listing.ok) return listingFailure(c, listing.failure)
    const byGithubId = new Map(
      listing.repositories.map((repository) => [
        repository.githubId,
        repository,
      ])
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
