import { afterEach, describe, expect, test, vi } from "vitest"
import { externalLinksApi } from "./external-links.js"

function mockFetchOnce(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("external links api client", () => {
  test("listExternalLinks hits the issue links endpoint", async () => {
    const fetchMock = mockFetchOnce([])
    const result = await externalLinksApi.listExternalLinks("WEB-1")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/issues/WEB-1/external-links")
    expect(result).toEqual([])
  })

  test("createExternalLink posts the pasted URL", async () => {
    const fetchMock = mockFetchOnce({
      id: "link-1",
      issueId: "issue-1",
      provider: "github",
      kind: "pr",
      url: "https://github.com/acme/web/pull/7",
      title: null,
      state: null,
    })
    const result = await externalLinksApi.createExternalLink(
      "WEB-1",
      "https://github.com/acme/web/pull/7"
    )
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(options.method).toBe("POST")
    expect(options.body).toBe(
      JSON.stringify({ url: "https://github.com/acme/web/pull/7" })
    )
    expect(result.kind).toBe("pr")
  })
})
