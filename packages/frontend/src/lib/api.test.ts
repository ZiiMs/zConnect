import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError, api } from "./api.js"

function mockFetchOnce(payload: unknown, init?: { status?: number }) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json" },
    })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("workspace api client", () => {
  test("listWorkspaces sends credentials and parses workspaces", async () => {
    const fetchMock = mockFetchOnce([
      { id: "ws-1", name: "Acme", role: "Owner" },
    ])

    const result = await api.listWorkspaces()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces")
    expect(options.credentials).toBe("include")
    expect(result).toEqual([{ id: "ws-1", name: "Acme", role: "Owner" }])
  })

  test("createWorkspace posts the name as JSON", async () => {
    const fetchMock = mockFetchOnce({
      id: "ws-1",
      name: "Acme",
      role: "Owner",
    })

    await api.createWorkspace("Acme")

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(options.method).toBe("POST")
    expect(options.body).toBe(JSON.stringify({ name: "Acme" }))
  })

  test("inviteMember posts email and role", async () => {
    const fetchMock = mockFetchOnce({
      id: "inv-1",
      workspaceId: "ws-1",
      email: "member@example.com",
      role: "Member",
    })

    await api.inviteMember("ws-1", {
      email: "member@example.com",
      role: "Member",
    })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/invites")
    expect(JSON.parse(options.body as string)).toEqual({
      email: "member@example.com",
      role: "Member",
    })
  })

  test("non-2xx responses throw ApiError with status", async () => {
    mockFetchOnce({ error: "Forbidden" }, { status: 403 })

    const failure = await api
      .inviteMember("ws-1", { email: "x@y.z", role: "Member" })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(403)
  })

  test("malformed workspace payloads throw", async () => {
    mockFetchOnce([{ id: 42, name: "Acme" }])

    await expect(api.listWorkspaces()).rejects.toThrow()
  })
})

describe("project api client", () => {
  test("createProject posts name and key", async () => {
    const fetchMock = mockFetchOnce({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
    })

    await api.createProject("ws-1", { name: "Web", key: "WEB" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/workspaces/ws-1/projects")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Web",
      key: "WEB",
    })
  })

  test("updateProject patches name and key", async () => {
    const fetchMock = mockFetchOnce({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Website",
      key: "SITE",
    })

    await api.updateProject("pr-1", { name: "Website", key: "SITE" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1")
    expect(options.method).toBe("PATCH")
  })

  test("listStatuses parses ordered statuses", async () => {
    mockFetchOnce([
      {
        id: "st-1",
        projectId: "pr-1",
        name: "Backlog",
        category: "Todo",
        position: 0,
      },
      {
        id: "st-2",
        projectId: "pr-1",
        name: "Shipped",
        category: "Done",
        position: 1,
      },
    ])

    const result = await api.listStatuses("pr-1")

    expect(result).toEqual([
      {
        id: "st-1",
        projectId: "pr-1",
        name: "Backlog",
        category: "Todo",
        position: 0,
      },
      {
        id: "st-2",
        projectId: "pr-1",
        name: "Shipped",
        category: "Done",
        position: 1,
      },
    ])
  })

  test("createStatus posts name and category", async () => {
    const fetchMock = mockFetchOnce({
      id: "st-1",
      projectId: "pr-1",
      name: "Backlog",
      category: "Todo",
      position: 0,
    })

    await api.createStatus("pr-1", { name: "Backlog", category: "Todo" })

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/statuses")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Backlog",
      category: "Todo",
    })
  })

  test("deleteStatus sends DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await api.deleteStatus("pr-1", "st-1")

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/projects/pr-1/statuses/st-1")
    expect(options.method).toBe("DELETE")
  })

  test("blocked deletes throw ApiError with status", async () => {
    mockFetchOnce(
      { error: "Cannot delete a status that holds issues" },
      { status: 409 }
    )

    const failure = await api
      .deleteStatus("pr-1", "st-1")
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as Error).message).toMatch(/holds issues/i)
  })
})
