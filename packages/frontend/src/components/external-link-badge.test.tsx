import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import type { ExternalLink } from "@/lib/external-links"
import { ExternalLinkBadge } from "./external-link-badge.js"

function link(state: ExternalLink["state"]): ExternalLink {
  return {
    id: "link-1",
    issueId: "issue-1",
    provider: "github",
    kind: "pr",
    url: "https://github.com/acme/web/pull/7",
    title: "Fix login",
    state,
  }
}

describe("external link badge", () => {
  test.each([
    ["open", "Open"],
    ["merged", "Merged"],
    ["closed", "Closed"],
  ] as const)("shows the %s PR state", (state, label) => {
    render(<ExternalLinkBadge link={link(state)} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  test("shows a neutral label before any webhook state arrives", () => {
    render(<ExternalLinkBadge link={link(null)} />)
    expect(screen.getByText("Linked")).toBeInTheDocument()
  })

  test("links out to the PR", () => {
    render(<ExternalLinkBadge link={link("open")} />)
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/acme/web/pull/7"
    )
  })
})
