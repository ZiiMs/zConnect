/**
 * GitHub reference parsing (T6 – External Links). Pure functions over branch
 * names, PR bodies, and pasted URLs: no network, no database. Vocabulary per
 * GLOSSARY.md: External Link (never Integration/Sync).
 */

export type ExternalLinkKind = "pr" | "issue" | "branch" | "commit"

export interface ParsedExternalUrl {
  provider: "github"
  kind: ExternalLinkKind
  owner: string
  repo: string
  /** PR number, commit SHA, or branch name depending on kind. */
  ref: string
  url: string
}

const ISSUE_REF_PATTERN = /\b([A-Z][A-Z0-9]{1,15})-(\d+)\b/gi

/**
 * Extracts Issue identifiers (KEY-N) from free text such as a branch name
 * or PR body. Normalized to uppercase, deduped, in first-appearance order.
 */
export function extractIssueRefs(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(ISSUE_REF_PATTERN)) {
    const identifier = `${match[1].toUpperCase()}-${match[2]}`
    if (!seen.has(identifier)) {
      seen.add(identifier)
      found.push(identifier)
    }
  }
  return found
}

function pushRefs(text: string, found: string[], seen: Set<string>): void {
  for (const identifier of extractIssueRefs(text)) {
    if (seen.has(identifier)) continue
    seen.add(identifier)
    found.push(identifier)
  }
}

/**
 * Issue identifiers that should link automatically: a Pull Request's source
 * branch first, then its title; a GitHub Issue contributes its title only.
 * Deduped, uppercase, in first-appearance order.
 */
export function autoLinkRefs(input: {
  kind: "pr" | "issue"
  sourceBranch?: string
  title: string
}): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  if (input.kind === "pr" && input.sourceBranch) {
    pushRefs(input.sourceBranch, found, seen)
  }
  pushRefs(input.title, found, seen)
  return found
}

const GITHUB_URL_PATTERN =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(pull|issues|commit|tree)\/([^/]+?)(?:\/|\?|#|$)/i

/**
 * Classifies a pasted GitHub issue/PR/branch/commit URL. Returns null for
 * non-GitHub or unrecognized URLs.
 */
export function parseExternalUrl(raw: string): ParsedExternalUrl | null {
  const match = GITHUB_URL_PATTERN.exec(raw.trim())
  if (!match) return null
  const [, owner, repo, segment, ref] = match
  const kind: ExternalLinkKind =
    segment.toLowerCase() === "pull"
      ? "pr"
      : segment.toLowerCase() === "issues"
        ? "issue"
        : segment.toLowerCase() === "commit"
          ? "commit"
          : "branch"
  return { provider: "github", kind, owner, repo, ref, url: raw.trim() }
}
