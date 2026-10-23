/**
 * GitHub View filter <-> query-string helpers (#49). The URL is the state
 * store, so a filtered view is shareable: `state`, `author`, `label`, `q`.
 * `state=open` is the default and stays out of the URL.
 */
export interface GitHubViewFilters {
  state: string
  author: string
  label: string
  q: string
}

const STATES = ["open", "merged", "closed", "all"] as const

export function parseGitHubFilters(search: string): GitHubViewFilters {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  )
  const state = (params.get("state") ?? "").toLowerCase()
  return {
    state: (STATES as readonly string[]).includes(state) ? state : "open",
    author: (params.get("author") ?? "").trim(),
    label: (params.get("label") ?? "").trim(),
    q: (params.get("q") ?? "").trim(),
  }
}

export function buildGitHubSearch(filters: Partial<GitHubViewFilters>): string {
  const params = new URLSearchParams()
  const state = filters.state?.toLowerCase()
  if (
    state &&
    state !== "open" &&
    (STATES as readonly string[]).includes(state)
  ) {
    params.set("state", state)
  }
  const author = filters.author?.trim()
  if (author) params.set("author", author)
  const label = filters.label?.trim()
  if (label) params.set("label", label)
  const q = filters.q?.trim()
  if (q) params.set("q", q)
  const search = params.toString()
  return search === "" ? "" : `?${search}`
}
