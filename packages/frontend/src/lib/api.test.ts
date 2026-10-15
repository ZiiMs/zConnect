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
