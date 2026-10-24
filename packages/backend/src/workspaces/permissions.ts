import type { Issue, Membership, Project, WorkspaceStore } from "./store.js"

/**
 * One place for the collaboration permission rules, shared by the issue,
 * comment, notification, MCP, and invite boundaries. Read follows Issue read
 * (workspace membership or a Viewer grant on that project); write requires a
 * real workspace membership. Nothing here trusts a client-supplied project.
 */

export interface IssueAccess {
  issue: Issue
  project: Project
}

/** Workspace membership, or a Viewer grant for this specific project. */
export async function readableProject(
  store: WorkspaceStore,
  projectId: string,
  userId: string
): Promise<Project | null> {
  const project = await store.getProject(projectId)
  if (!project) return null
  if (await store.getMembership(project.workspaceId, userId)) return project
  if (await store.isProjectViewer(projectId, userId)) return project
  return null
}

/**
 * Boolean form of `readableProject` for callers that resolve many references
 * at once. Callers cache one answer per project.
 */
export function projectReadGate(
  store: WorkspaceStore
): (projectId: string, userId: string) => Promise<boolean> {
  return async (projectId, userId) =>
    (await readableProject(store, projectId, userId)) !== null
}

/** Owner/Admin/Member of the project's workspace. Viewer grants excluded. */
export async function writableProject(
  store: WorkspaceStore,
  projectId: string,
  userId: string
): Promise<Project | null> {
  const project = await store.getProject(projectId)
  if (!project) return null
  const membership = await store.getMembership(project.workspaceId, userId)
  return membership ? project : null
}

/** Owner/Admin of the project's workspace. */
export async function manageableProject(
  store: WorkspaceStore,
  projectId: string,
  userId: string
): Promise<Project | null> {
  const project = await store.getProject(projectId)
  if (!project) return null
  const membership = await store.getMembership(project.workspaceId, userId)
  if (!membership || membership.role === "Member") return null
  return project
}

/** Resolve an issue by ref and apply the read gate. */
export async function readableIssue(
  store: WorkspaceStore,
  ref: string,
  userId: string
): Promise<IssueAccess | null> {
  const issue = await store.getIssue(ref)
  if (!issue) return null
  const project = await readableProject(store, issue.projectId, userId)
  return project ? { issue, project } : null
}

/** Resolve an issue by ref and apply the write gate. */
export async function writableIssue(
  store: WorkspaceStore,
  ref: string,
  userId: string
): Promise<IssueAccess | null> {
  const issue = await store.getIssue(ref)
  if (!issue) return null
  const project = await writableProject(store, issue.projectId, userId)
  return project ? { issue, project } : null
}

export async function membershipOf(
  store: WorkspaceStore,
  workspaceId: string,
  userId: string
): Promise<Membership | null> {
  return store.getMembership(workspaceId, userId)
}
