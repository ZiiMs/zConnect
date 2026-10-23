/**
 * GitHub View HTTP boundary (#49): the Pull Request list and the manual
 * refresh. Every route is project read, so a Viewer grant can read the view.
 * The provider token never appears here.
 */
import { type Context, Hono } from "hono"
import { readableProject } from "../workspaces/permissions.js"
import type { GetSession } from "../workspaces/session.js"
import type { Project, WorkspaceStore } from "../workspaces/store.js"
import {
  DEFAULT_GITHUB_ITEM_LIMIT,
  type GitHubConnectionStatus,
  type GitHubIssueSnapshot,
  type GitHubItemFilters,
  type GitHubLabel,
  type GitHubStore,
  type LinkedIssueRef,
  MAX_GITHUB_ITEM_LIMIT,
  type PullRequestSnapshot,
} from "./store.js"

const STATES = ["open", "merged", "closed", "all"] as const
const ISSUE_STATES = ["open", "closed", "all"] as const

export type GitHubItemState = (typeof STATES)[number]
export type GitHubIssueFilterState = (typeof ISSUE_STATES)[number]

export interface PullRequestRow extends PullRequestSnapshot {
  /** Repository full name (`owner/name`). */
  repository: string
  linkedIssues: LinkedIssueRef[]
}

export interface GitHubIssueRow extends GitHubIssueSnapshot {
  /** Repository full name (`owner/name`). */
  repository: string
  linkedIssues: LinkedIssueRef[]
}

export interface GitHubViewConnection {
  status: GitHubConnectionStatus
  login: string
}

export interface GitHubViewRepository {
  id: string
  fullName: string
  issuesEnabled: boolean
  unavailable: boolean
}

export interface GitHubViewFilters {
  authors: string[]
  labels: GitHubLabel[]
}

export interface PullRequestListResponse {
  items: PullRequestRow[]
  nextCursor: string | null
  lastSyncedAt: string | null
  connection: GitHubViewConnection | null
  repositories: GitHubViewRepository[]
  filters: GitHubViewFilters
}

export interface GitHubIssueListResponse {
  items: GitHubIssueRow[]
  nextCursor: string | null
  lastSyncedAt: string | null
  connection: GitHubViewConnection | null
  repositories: GitHubViewRepository[]
  filters: GitHubViewFilters
}

export interface RefreshResponse {
  accepted: true
  enqueued: number
  lastSyncedAt: string | null
}

/** `GET /github/status`: the list envelope without items or filters. */
export interface GitHubStatusResponse {
  connection: GitHubViewConnection | null
  repositories: GitHubViewRepository[]
  lastSyncedAt: string | null
}

export interface GitHubViewDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
  getSession: GetSession
  /** Enqueues one sync job per linked repository (BullMQ in production). */
  enqueueSync: (repositoryId: string) => Promise<void>
  /** Injected clock for staleness and the refresh throttle; tests fake it. */
  now?: () => Date
}

/** A snapshot older than this is refreshed when the view opens. */
const SNAPSHOT_STALE_MS = 5 * 60 * 1000
/** A manual refresh is accepted at most once per this window per workspace. */
const MANUAL_REFRESH_WINDOW_MS = 60 * 1000

function newestLastSyncedAt(rows: Array<{ lastSyncedAt: string | null }>) {
  let newest: string | null = null
  for (const row of rows) {
    if (row.lastSyncedAt && (!newest || row.lastSyncedAt > newest)) {
      newest = row.lastSyncedAt
    }
  }
  return newest
}

function parseState(raw: string | undefined): GitHubItemState | null {
  const value = (raw ?? "open").toLowerCase()
  return (STATES as readonly string[]).includes(value)
    ? (value as GitHubItemState)
    : null
}

function parseIssueState(
  raw: string | undefined
): GitHubIssueFilterState | null {
  const value = (raw ?? "open").toLowerCase()
  return (ISSUE_STATES as readonly string[]).includes(value)
    ? (value as GitHubIssueFilterState)
    : null
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_GITHUB_ITEM_LIMIT
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > MAX_GITHUB_ITEM_LIMIT) {
    return null
  }
  return value
}

/**
 * Every distinct author login in the project's snapshot for this kind,
 * regardless of the current filter. Pages through the list because the
 * contract exposes no dedicated authors query.
 */
async function collectAuthors(
  github: GitHubStore,
  projectId: string
): Promise<string[]> {
  const byLower = new Map<string, string>()
  let cursor: string | null = null
  do {
    const page = await github.listPullRequestsForProject(projectId, {
      state: "all",
      limit: MAX_GITHUB_ITEM_LIMIT,
      cursor,
    })
    for (const item of page.items) {
      const lower = item.authorLogin.toLowerCase()
      if (!byLower.has(lower)) byLower.set(lower, item.authorLogin)
    }
    cursor = page.nextCursor
  } while (cursor)
  return [...byLower.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Author and label options for the Issues tab, taken from the project's whole
 * snapshot across every state so the pickers do not shrink as filters apply.
 */
async function collectIssueFacets(
  github: GitHubStore,
  projectId: string
): Promise<GitHubViewFilters> {
  const byAuthor = new Map<string, string>()
  const byLabel = new Map<string, GitHubLabel>()
  let cursor: string | null = null
  do {
    const page = await github.listGitHubIssuesForProject(projectId, {
      state: "all",
      limit: MAX_GITHUB_ITEM_LIMIT,
      cursor,
    })
    for (const item of page.items) {
      const author = item.authorLogin.toLowerCase()
      if (!byAuthor.has(author)) byAuthor.set(author, item.authorLogin)
      for (const label of item.labels) {
        const key = label.name.toLowerCase()
        if (!byLabel.has(key)) byLabel.set(key, { ...label })
      }
    }
    cursor = page.nextCursor
  } while (cursor)
  return {
    authors: [...byAuthor.values()].sort((a, b) => a.localeCompare(b)),
    labels: [...byLabel.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export function createGitHubViewApp({
  workspaces,
  github,
  getSession,
  enqueueSync,
  now = () => new Date(),
}: GitHubViewDeps) {
  const app = new Hono()

  async function projectForRead(
    c: Context,
    projectId: string
  ): Promise<Project | Response> {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const project = await readableProject(
      workspaces,
      projectId,
      session.user.id
    )
    if (project) return project
    const exists = await workspaces.getProject(projectId)
    return c.json(
      { error: exists ? "Forbidden" : "Not found" },
      exists ? 403 : 404
    )
  }

  function isResponse(value: Project | Response): value is Response {
    return value instanceof Response
  }

  app.get("/api/projects/:id/github/pull-requests", async (c) => {
    const projectId = c.req.param("id")
    const project = await projectForRead(c, projectId)
    if (isResponse(project)) return project

    const state = parseState(c.req.query("state"))
    if (!state) return c.json({ error: "Invalid state" }, 400)
    const limit = parseLimit(c.req.query("limit"))
    if (limit === null) return c.json({ error: "Invalid limit" }, 400)

    const filters: GitHubItemFilters = {
      state,
      author: (c.req.query("author") ?? "").trim() || null,
      query: (c.req.query("q") ?? "").trim() || null,
      limit,
      cursor: c.req.query("cursor") ?? null,
    }

    const repositories = await github.listProjectRepositories(project.id)
    const [page, connection, authors] = await Promise.all([
      github.listPullRequestsForProject(project.id, filters),
      github.getConnection(project.workspaceId),
      collectAuthors(github, project.id),
    ])
    const repositoryNames = new Map(
      repositories.map((repository) => [repository.id, repository.fullName])
    )
    const linkedIssues = await github.listLinkedIssueRefs(
      page.items.map((item) => item.url)
    )
    const items: PullRequestRow[] = page.items.map((item) => ({
      ...item,
      repository: repositoryNames.get(item.repositoryId) ?? "",
      linkedIssues: linkedIssues[item.url] ?? [],
    }))

    const body: PullRequestListResponse = {
      items,
      nextCursor: page.nextCursor,
      lastSyncedAt: newestLastSyncedAt(repositories),
      connection: connection
        ? { status: connection.status, login: connection.login }
        : null,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        fullName: repository.fullName,
        issuesEnabled: repository.issuesEnabled,
        unavailable: repository.syncError !== null,
      })),
      filters: { authors, labels: [] },
    }
    return c.json(body)
  })

  app.get("/api/projects/:id/github/issues", async (c) => {
    const projectId = c.req.param("id")
    const project = await projectForRead(c, projectId)
    if (isResponse(project)) return project

    const state = parseIssueState(c.req.query("state"))
    if (!state) return c.json({ error: "Invalid state" }, 400)
    const limit = parseLimit(c.req.query("limit"))
    if (limit === null) return c.json({ error: "Invalid limit" }, 400)

    const filters: GitHubItemFilters = {
      state,
      author: (c.req.query("author") ?? "").trim() || null,
      label: (c.req.query("label") ?? "").trim() || null,
      query: (c.req.query("q") ?? "").trim() || null,
      limit,
      cursor: c.req.query("cursor") ?? null,
    }

    const repositories = await github.listProjectRepositories(project.id)
    const [page, connection, facets] = await Promise.all([
      github.listGitHubIssuesForProject(project.id, filters),
      github.getConnection(project.workspaceId),
      collectIssueFacets(github, project.id),
    ])
    const repositoryNames = new Map(
      repositories.map((repository) => [repository.id, repository.fullName])
    )
    const linkedIssues = await github.listLinkedIssueRefs(
      page.items.map((item) => item.url)
    )
    const items: GitHubIssueRow[] = page.items.map((item) => ({
      ...item,
      repository: repositoryNames.get(item.repositoryId) ?? "",
      linkedIssues: linkedIssues[item.url] ?? [],
    }))

    const body: GitHubIssueListResponse = {
      items,
      nextCursor: page.nextCursor,
      lastSyncedAt: newestLastSyncedAt(repositories),
      connection: connection
        ? { status: connection.status, login: connection.login }
        : null,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        fullName: repository.fullName,
        issuesEnabled: repository.issuesEnabled,
        unavailable: repository.syncError !== null,
      })),
      filters: facets,
    }
    return c.json(body)
  })

  // #51: enqueue only linked repositories whose snapshot is stale, and answer
  // 429 while the per-workspace manual-refresh window is open. The cached
  // snapshot is served untouched either way.
  app.post("/api/projects/:id/github/refresh", async (c) => {
    const projectId = c.req.param("id")
    const project = await projectForRead(c, projectId)
    if (isResponse(project)) return project

    const connection = await github.getConnection(project.workspaceId)
    if (!connection) {
      return c.json({ error: "GitHub is not connected" }, 409)
    }

    const at = now()
    if (connection.lastManualRefreshAt) {
      const elapsed =
        at.getTime() - new Date(connection.lastManualRefreshAt).getTime()
      const retryAfter = Math.ceil((MANUAL_REFRESH_WINDOW_MS - elapsed) / 1000)
      if (retryAfter > 0) {
        c.header("Retry-After", String(retryAfter))
        return c.json({ error: "Refresh throttled", retryAfter }, 429)
      }
    }

    const repositories = await github.listProjectRepositories(project.id)
    const cutoff = at.getTime() - SNAPSHOT_STALE_MS
    const stale = repositories.filter(
      (repository) =>
        repository.lastSyncedAt === null ||
        new Date(repository.lastSyncedAt).getTime() < cutoff
    )
    for (const repository of stale) {
      await enqueueSync(repository.id)
    }
    await github.touchConnectionManualRefresh(
      project.workspaceId,
      at.toISOString()
    )
    const body: RefreshResponse = {
      accepted: true,
      enqueued: stale.length,
      lastSyncedAt: newestLastSyncedAt(repositories),
    }
    return c.json(body, 202)
  })

  app.get("/api/projects/:id/github/status", async (c) => {
    const projectId = c.req.param("id")
    const project = await projectForRead(c, projectId)
    if (isResponse(project)) return project

    const repositories = await github.listProjectRepositories(project.id)
    const connection = await github.getConnection(project.workspaceId)
    const body: GitHubStatusResponse = {
      connection: connection
        ? { status: connection.status, login: connection.login }
        : null,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        fullName: repository.fullName,
        issuesEnabled: repository.issuesEnabled,
        unavailable: repository.syncError !== null,
      })),
      lastSyncedAt: newestLastSyncedAt(repositories),
    }
    return c.json(body)
  })

  return app
}
