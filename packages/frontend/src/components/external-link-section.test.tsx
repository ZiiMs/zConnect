import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ExternalLinkSection } from "./external-link-section.js"

function mockFetchSequence(payloads: unknown[]) {
  const queue = [...payloads]
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(queue.shift() ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("external link section", () => {
  test("shows badges plus timeline events for the issue", async () => {
    mockFetchSequence([
      [
        {
          id: "link-1",
          issueId: "issue-1",
          provider: "github",
          kind: "pr",
          url: "https://github.com/acme/web/pull/7",
          title: "Fix login",
          state: "merged",
        },
      ],
      [
        {
          id: "ev-1",
          issueId: "issue-1",
          kind: "link.merged",
          body: "PR #7 merged",
        },
      ],
    ])
    render(<ExternalLinkSection issueIdentifier="WEB-1" canWrite={false} />)

    expect(await screen.findByText("Merged")).toBeInTheDocument()
    expect(await screen.findByText("PR #7 merged")).toBeInTheDocument()
    expect(screen.queryByLabelText(/paste.*url/i)).not.toBeInTheDocument()
  })

  test("shows the empty state and paste form when writable", async () => {
    const user = userEvent.setup()
    mockFetchSequence([[], []])
    render(<ExternalLinkSection issueIdentifier="WEB-1" canWrite={true} />)

    expect(await screen.findByText(/no linked prs/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/paste.*url/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /add link/i }))
    expect(screen.getByLabelText(/paste.*url/i)).toBeInTheDocument()
  })
})
