import { z } from "zod"

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ""

export const workspaceRoleSchema = z.enum(["Owner", "Admin", "Member"])

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.union([workspaceRoleSchema, z.literal("Viewer")]),
})

export const memberSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  role: workspaceRoleSchema,
})

export const invitationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string(),
  role: workspaceRoleSchema,
})

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  key: z.string(),
})

export const statusCategorySchema = z.enum(["Todo", "In Progress", "Done"])

export const statusSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  category: statusCategorySchema,
  position: z.number(),
})

export type Workspace = z.infer<typeof workspaceSchema>
export type Member = z.infer<typeof memberSchema>
export type Invitation = z.infer<typeof invitationSchema>
export type Project = z.infer<typeof projectSchema>
export type StatusCategory = z.infer<typeof statusCategorySchema>
export type Status = z.infer<typeof statusSchema>

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : res.statusText
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return schema.parse(undefined)
  return schema.parse(json)
}

export const api = {
  listWorkspaces(): Promise<Workspace[]> {
    return request("/api/workspaces", z.array(workspaceSchema))
  },

  createWorkspace(name: string): Promise<Workspace> {
    return request("/api/workspaces", workspaceSchema, {
      method: "POST",
      body: { name },
    })
  },

  listMembers(workspaceId: string): Promise<Member[]> {
    return request(
      `/api/workspaces/${workspaceId}/members`,
      z.array(memberSchema)
    )
  },

  inviteMember(
    workspaceId: string,
    input: { email: string; role: z.infer<typeof workspaceRoleSchema> }
  ): Promise<Invitation> {
    return request(`/api/workspaces/${workspaceId}/invites`, invitationSchema, {
      method: "POST",
      body: input,
    })
  },

  listProjects(workspaceId: string): Promise<Project[]> {
    return request(
      `/api/workspaces/${workspaceId}/projects`,
      z.array(projectSchema)
    )
  },

  createProject(
    workspaceId: string,
    input: { name: string; key: string }
  ): Promise<Project> {
    return request(`/api/workspaces/${workspaceId}/projects`, projectSchema, {
      method: "POST",
      body: input,
    })
  },

  getProject(projectId: string): Promise<Project> {
    return request(`/api/projects/${projectId}`, projectSchema)
  },

  updateProject(
    projectId: string,
    input: { name?: string; key?: string }
  ): Promise<Project> {
    return request(`/api/projects/${projectId}`, projectSchema, {
      method: "PATCH",
      body: input,
    })
  },

  listStatuses(projectId: string): Promise<Status[]> {
    return request(`/api/projects/${projectId}/statuses`, z.array(statusSchema))
  },

  createStatus(
    projectId: string,
    input: { name: string; category: StatusCategory }
  ): Promise<Status> {
    return request(`/api/projects/${projectId}/statuses`, statusSchema, {
      method: "POST",
      body: input,
    })
  },

  updateStatus(
    projectId: string,
    statusId: string,
    input: { name?: string; category?: StatusCategory; position?: number }
  ): Promise<Status> {
    return request(
      `/api/projects/${projectId}/statuses/${statusId}`,
      statusSchema,
      { method: "PATCH", body: input }
    )
  },

  deleteStatus(projectId: string, statusId: string): Promise<void> {
    return request(
      `/api/projects/${projectId}/statuses/${statusId}`,
      z.void(),
      { method: "DELETE" }
    )
  },
}
