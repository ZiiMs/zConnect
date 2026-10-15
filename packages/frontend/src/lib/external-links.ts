import { z } from "zod"

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ""

export const externalLinkKindSchema = z.enum(["pr", "branch", "commit"])

export const externalLinkStateSchema = z.enum(["open", "merged", "closed"])

export const externalLinkSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  provider: z.literal("github"),
  kind: externalLinkKindSchema,
  url: z.string(),
  title: z.string().nullable(),
  state: externalLinkStateSchema.nullable(),
})

export const timelineEventSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  kind: z.string(),
  body: z.string(),
})

export type ExternalLink = z.infer<typeof externalLinkSchema>
export type TimelineEvent = z.infer<typeof timelineEventSchema>

export class ExternalLinksApiError extends Error {
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
    throw new ExternalLinksApiError(res.status, message)
  }
  return schema.parse(json)
}

/** External Link client (T6): manual paste plus badge/timeline reads. */
export const externalLinksApi = {
  listExternalLinks(issueRef: string): Promise<ExternalLink[]> {
    return request(
      `/api/issues/${encodeURIComponent(issueRef)}/external-links`,
      z.array(externalLinkSchema)
    )
  },

  createExternalLink(issueRef: string, url: string): Promise<ExternalLink> {
    return request(
      `/api/issues/${encodeURIComponent(issueRef)}/external-links`,
      externalLinkSchema,
      { method: "POST", body: { url } }
    )
  },

  listTimelineEvents(issueRef: string): Promise<TimelineEvent[]> {
    return request(
      `/api/issues/${encodeURIComponent(issueRef)}/timeline`,
      z.array(timelineEventSchema)
    )
  },
}
