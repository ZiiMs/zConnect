import { describe, expect, test } from "bun:test"
import { extractIssueRefs, parseExternalUrl } from "./parse.js"

describe("extractIssueRefs", () => {
  test("finds KEY-N identifiers in branch names and PR bodies", () => {
    expect(extractIssueRefs("web-123-fix-login")).toEqual(["WEB-123"])
    expect(
      extractIssueRefs("Fixes WEB-1 and WEB-2, follow-up to WEB-1")
    ).toEqual(["WEB-1", "WEB-2"])
  })

  test("ignores non-identifiers and normalizes case", () => {
    expect(extractIssueRefs("no refs here")).toEqual([])
    expect(
      extractIssueRefs("A-1 too short, TOOLONGKEY123456789-1 too long")
    ).toEqual([])
    expect(extractIssueRefs("api-42")).toEqual(["API-42"])
  })
})

describe("parseExternalUrl", () => {
  test("classifies PR, issue, commit, and branch URLs", () => {
    expect(
      parseExternalUrl("https://github.com/acme/web/pull/7")
    ).toMatchObject({
      provider: "github",
      kind: "pr",
      owner: "acme",
      repo: "web",
      ref: "7",
    })
    expect(
      parseExternalUrl("https://github.com/acme/web/issues/42")
    ).toMatchObject({
      provider: "github",
      kind: "issue",
      owner: "acme",
      repo: "web",
      ref: "42",
    })
    expect(
      parseExternalUrl("https://github.com/acme/web/commit/abc1234")
    ).toMatchObject({ provider: "github", kind: "commit" })
    expect(
      parseExternalUrl("https://github.com/acme/web/tree/WEB-123-login")
    ).toMatchObject({ provider: "github", kind: "branch" })
  })

  test("rejects non-GitHub or unrecognized URLs", () => {
    expect(parseExternalUrl("https://example.com/acme/web/pull/7")).toBeNull()
    expect(parseExternalUrl("not a url")).toBeNull()
    expect(parseExternalUrl("https://github.com/acme")).toBeNull()
  })
})
