import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { IssueMarkdown } from "./issue-markdown.js"

describe("issue markdown read view", () => {
  test("GFM constructs render formatted", () => {
    render(
      <IssueMarkdown
        markdown={"# Title\n\n- [ ] task\n- [x] done\n\n**bold** and `code`"}
      />
    )
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument()
    expect(screen.getByText("bold")).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThanOrEqual(2)
  })

  test("plain-text bodies render unchanged with single newlines", () => {
    render(<IssueMarkdown markdown={"line one\nline two"} />)
    const view = screen.getByTestId("issue-markdown")
    expect(view.textContent).toContain("line one")
    expect(view.textContent).toContain("line two")
    // remark-breaks keeps the line break as <br>, not joined into one line.
    expect(view.querySelector("br")).not.toBeNull()
  })

  test("raw HTML does not render as live content", () => {
    render(
      <IssueMarkdown
        markdown={
          '<img src="x" onerror="alert(1)">hello<script>alert(1)</script>'
        }
      />
    )
    const view = screen.getByTestId("issue-markdown")
    expect(view.querySelector("img")).toBeNull()
    expect(view.querySelector("script")).toBeNull()
    expect(view.textContent).toContain("hello")
  })

  test("javascript: URLs are dead", () => {
    render(<IssueMarkdown markdown={"[click](javascript:alert(1))"} />)
    const view = screen.getByTestId("issue-markdown")
    expect(view.textContent).toContain("click")
    const anchor = view.querySelector("a")
    // Sanitizer strips the dangerous href (or leaves a safe one); either way
    // no javascript: URL survives as live content.
    expect(anchor?.getAttribute("href") ?? "").not.toContain("javascript:")
  })
})
