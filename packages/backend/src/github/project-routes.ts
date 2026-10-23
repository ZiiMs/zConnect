import { Hono } from "hono"
import { z } from "zod"
import {
  manageableProject,
  readableProject,
} from "../workspaces/permissions.js"
import type { GetSession } from "../workspaces/session.js"
import type { Project, WorkspaceStore } from "../workspaces/store.js"
import {
  type GitHubConnectionStatus,
  type GitHubStore,
  MAX_ALLOWLIST,
  type ProjectRepository,
} from "./store.js"

export interface GitHubProjectDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
  getSession: GetSession
}

/** Repository row in Settings → Repositories. */
export interface ProjectRepositoryView extends ProjectRepository {
  unavailable: boolean
}

/** The workspace Connection shown beside the project's linked repositories. */
export interface ProjectConnectionView {
  status: GitHubConnectionStatus
  login: string
}

export interface ProjectRepositoriesResponse {
  items: ProjectRepositoryView[]
  connection: ProjectConnectionView | null
}

const projectRepositoriesBody = z.object({
  repositoryIds: z.array(z.string().trim().min(1)).max(500),
})

function toView(repository: ProjectRepository): ProjectRepositoryView {
  return { ...repository, unavailable: repository.syncError !== null }
}

function isInvalid(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "invalid"
  )
}

/**
 * Project-scoped repository links (#48). Every member (and a project Viewer)
 * reads the project's linked repositories and their sync state; only an
 * Owner/Admin of the workspace can replace the set, and only with
 * repositories already admitted to that workspace's allowlist.
 */
export function createGitHubProjectApp({
  workspaces,
  github,
  getSession,
}: GitHubProjectDeps) {
  const app = new Hono()

  async function response(
    project: Project
  ): Promise<ProjectRepositoriesResponse> {
    const [repositories, connection] = await Promise.all([
      github.listProjectRepositories(project.id),
      github.getConnection(project.workspaceId),
    ])
    return {
      items: repositories.map(toView),
      connection: connection
        ? { status: connection.status, login: connection.login }
        : null,
    }
  }

  app.get("/api/projects/:id/repositories", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const projectId = c.req.param("id")
    const project = await readableProject(
      workspaces,
      projectId,
      session.user.id
    )
    if (!project) {
      const exists = await workspaces.getProject(projectId)
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    return c.json(await response(project))
  })

  app.put("/api/projects/:id/repositories", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const projectId = c.req.param("id")
    // Owner/Admin only: a Viewer grant is read access, never manage access.
    const project = await manageableProject(
      workspaces,
      projectId,
      session.user.id
    )
    if (!project) {
      const exists = await workspaces.getProject(projectId)
      return c.json(
        { error: exists ? "Forbidden" : "Not found" },
        exists ? 403 : 404
      )
    }
    const parsed = projectRepositoriesBody.safeParse(
      await c.req.json().catch(() => null)
    )
    if (!parsed.success) {
      return c.json({ error: "Invalid repositories" }, 400)
    }
    const repositoryIds = [...new Set(parsed.data.repositoryIds)]
    if (repositoryIds.length > MAX_ALLOWLIST) {
      return c.json(
        { error: `At most ${MAX_ALLOWLIST} repositories can be linked` },
        400
      )
    }

    const connection = await github.getConnection(project.workspaceId)
    const allowed = new Set(
      (connection ? await github.listAllowlist(connection.id) : []).map(
        (repository) => repository.id
      )
    )
    for (const repositoryId of repositoryIds) {
      if (!allowed.has(repositoryId)) {
        return c.json({ error: "Unknown repository" }, 400)
      }
    }

    try {
      await github.replaceProjectRepositories(
        project.id,
        repositoryIds,
        session.user.id,
        new Date().toISOString()
      )
    } catch (error) {
      if (isInvalid(error)) {
        return c.json({ error: "Unknown repository" }, 400)
      }
      throw error
    }
    return c.json(await response(project))
  })

  return app
}
