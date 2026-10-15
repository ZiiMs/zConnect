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

export type Workspace = z.infer<typeof workspaceSchema>
export type Member = z.infer<typeof memberSchema>
export type Invitation = z.infer<typeof invitationSchema>
export type Project = z.infer<typeof projectSchema>

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
}
