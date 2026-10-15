/** Workspace roles per GLOSSARY.md Member vocabulary. */
export const WORKSPACE_ROLES = ["Owner", "Admin", "Member"] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export interface Workspace {
  id: string
  name: string
  createdBy: string
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole | "Viewer"
}

export interface Membership {
  workspaceId: string
  userId: string
  role: WorkspaceRole
}

export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: WorkspaceRole
  invitedBy: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  key: string
}

/**
 * Persistence boundary for workspace tenancy. The Hono routes depend only on
 * this interface: contract tests inject the memory store, production injects
 * the Drizzle store over Supabase Postgres.
 */
export interface WorkspaceStore {
  createWorkspace(ownerId: string, name: string): Promise<Workspace>
  listWorkspacesForUser(userId: string): Promise<WorkspaceWithRole[]>
  getMembership(workspaceId: string, userId: string): Promise<Membership | null>
  listMembers(workspaceId: string): Promise<Membership[]>
  createInvitation(input: {
    workspaceId: string
    email: string
    role: WorkspaceRole
    invitedBy: string
  }): Promise<Invitation>
  listInvitationsForEmail(email: string): Promise<Invitation[]>
  acceptInvitation(invitationId: string, userId: string): Promise<Membership>
  createProject(
    workspaceId: string,
    input: { name: string; key: string }
  ): Promise<Project>
  listProjects(workspaceId: string): Promise<Project[]>
  getProject(projectId: string): Promise<Project | null>
  addProjectViewer(projectId: string, userId: string): Promise<void>
  isProjectViewer(projectId: string, userId: string): Promise<boolean>
  hasProjectGrantInWorkspace(
    workspaceId: string,
    userId: string
  ): Promise<boolean>
}

export function createMemoryWorkspaceStore(): WorkspaceStore {
  const workspaces = new Map<string, Workspace>()
  const members = new Map<string, Membership>()
  const invitations = new Map<string, Invitation>()
  const projects = new Map<string, Project>()
  const projectViewers = new Set<string>()

  const memberKey = (workspaceId: string, userId: string) =>
    `${workspaceId}:${userId}`

  return {
    async createWorkspace(ownerId, name) {
      const workspace = { id: crypto.randomUUID(), name, createdBy: ownerId }
      workspaces.set(workspace.id, workspace)
      members.set(memberKey(workspace.id, ownerId), {
        workspaceId: workspace.id,
        userId: ownerId,
        role: "Owner",
      })
      return workspace
    },

    async listWorkspacesForUser(userId) {
      const visible: WorkspaceWithRole[] = []
      for (const workspace of workspaces.values()) {
        const membership = members.get(memberKey(workspace.id, userId))
        if (membership) {
          visible.push({ ...workspace, role: membership.role })
          continue
        }
        let viewer = false
        for (const project of projects.values()) {
          if (
            project.workspaceId === workspace.id &&
            projectViewers.has(`${project.id}:${userId}`)
          ) {
            viewer = true
            break
          }
        }
        if (viewer) visible.push({ ...workspace, role: "Viewer" })
      }
      return visible
    },

    async getMembership(workspaceId, userId) {
      return members.get(memberKey(workspaceId, userId)) ?? null
    },

    async listMembers(workspaceId) {
      return [...members.values()].filter((m) => m.workspaceId === workspaceId)
    },

    async createInvitation(input) {
      const email = input.email.toLowerCase()
      const existing = [...invitations.values()].find(
        (i) => i.workspaceId === input.workspaceId && i.email === email
      )
      if (existing) {
        const error = new Error("Invitation already exists")
        ;(error as { code?: string }).code = "conflict"
        throw error
      }
      const invitation: Invitation = {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        email,
        role: input.role,
        invitedBy: input.invitedBy,
      }
      invitations.set(invitation.id, invitation)
      return invitation
    },

    async listInvitationsForEmail(email) {
      const lower = email.toLowerCase()
      return [...invitations.values()].filter((i) => i.email === lower)
    },

    async acceptInvitation(invitationId, userId) {
      const invitation = invitations.get(invitationId)
      if (!invitation) {
        const error = new Error("Invitation not found")
        ;(error as { code?: string }).code = "not_found"
        throw error
      }
      const current = members.get(memberKey(invitation.workspaceId, userId))
      if (current) {
        invitations.delete(invitationId)
        return current
      }
      const membership: Membership = {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      }
      members.set(memberKey(invitation.workspaceId, userId), membership)
      invitations.delete(invitationId)
      return membership
    },

    async createProject(workspaceId, input) {
      const key = input.key.toUpperCase()
      const duplicate = [...projects.values()].some(
        (p) => p.workspaceId === workspaceId && p.key === key
      )
      if (duplicate) {
        const error = new Error("Project key already exists")
        ;(error as { code?: string }).code = "conflict"
        throw error
      }
      const project: Project = {
        id: crypto.randomUUID(),
        workspaceId,
        name: input.name,
        key,
      }
      projects.set(project.id, project)
      return project
    },

    async listProjects(workspaceId) {
      return [...projects.values()].filter((p) => p.workspaceId === workspaceId)
    },

    async getProject(projectId) {
      return projects.get(projectId) ?? null
    },

    async addProjectViewer(projectId, userId) {
      projectViewers.add(`${projectId}:${userId}`)
    },

    async isProjectViewer(projectId, userId) {
      return projectViewers.has(`${projectId}:${userId}`)
    },

    async hasProjectGrantInWorkspace(workspaceId, userId) {
      for (const project of projects.values()) {
        if (
          project.workspaceId === workspaceId &&
          projectViewers.has(`${project.id}:${userId}`)
        ) {
          return true
        }
      }
      return false
    },
  }
}
