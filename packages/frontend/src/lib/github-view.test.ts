import { describe, expect, test } from "vitest"
import { buildGitHubSearch, parseGitHubFilters } from "./github-view.js"

describe("github view filters", () => {
  test("defaults to open with no other filters", () => {
    expect(parseGitHubFilters("")).toEqual({
      state: "open",
      author: "",
      label: "",
      q: "",
    })
    expect(parseGitHubFilters("?")).toEqual({
      state: "open",
      author: "",
      label: "",
      q: "",
    })
  })

  test("parses state, author, label, and text", () => {
    expect(
      parseGitHubFilters(
        "?state=MERGED&author=octocat&label=bug&q=login+redirect"
      )
    ).toEqual({
      state: "merged",
      author: "octocat",
      label: "bug",
      q: "login redirect",
    })
  })

  test("unknown states fall back to open and blanks are trimmed", () => {
    expect(parseGitHubFilters("?state=nope&author=%20%20&q=%20")).toEqual({
      state: "open",
      author: "",
      label: "",
      q: "",
    })
    expect(parseGitHubFilters("?state=ALL").state).toBe("all")
    expect(parseGitHubFilters("?state=closed").state).toBe("closed")
  })

  test("builds a query string, omitting defaults and empty values", () => {
    expect(buildGitHubSearch({})).toBe("")
    expect(buildGitHubSearch({ state: "open" })).toBe("")
    expect(buildGitHubSearch({ state: "merged" })).toBe("?state=merged")
    expect(
      buildGitHubSearch({
        state: "closed",
        author: " octocat ",
        label: "",
        q: " login ",
      })
    ).toBe("?state=closed&author=octocat&q=login")
  })

  test("round-trips through the query string", () => {
    const filters = {
      state: "all",
      author: "hubot",
      label: "bug",
      q: "view",
    }
    expect(parseGitHubFilters(buildGitHubSearch(filters))).toEqual(filters)
    expect(parseGitHubFilters(buildGitHubSearch({}))).toEqual({
      state: "open",
      author: "",
      label: "",
      q: "",
    })
  })
})
