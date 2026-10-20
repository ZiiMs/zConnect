/**
 * URL routes per GLOSSARY.md sharing model: the browser location is the state
 * store for workspace + open issue, so detail links are shareable and survive
 * reloads. Shape: `/{workspaceSlug}` for the workspace home and
 * `/{workspaceSlug}/issue/{IDENTIFIER}/{title-slug?}` for detail. The
 * identifier (KEY-N, e.g. WEB-123) is the lookup key; the workspace and title
 * segments are readability context and are ignored for resolution (the title
 * slug, like Linear/Medium, never affects which issue loads).
 */

export interface AppPath {
  workspaceSlug: string | null
  identifier: string | null
}

function slugify(value: string, max: number, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "")
  return slug || fallback
}

/** URL-safe workspace segment derived from the workspace name. */
export function slugifyWorkspace(name: string): string {
  return slugify(name, 60, "workspace")
}

/** URL-safe title segment derived from the issue title. */
export function slugifyTitle(title: string): string {
  return slugify(title, 80, "issue")
}

/** `/{workspaceSlug}` — workspace home (project list). */
export function buildWorkspacePath(workspaceName: string): string {
  return `/${slugifyWorkspace(workspaceName)}`
}

/** `/invite/{id}` — invitation accept page (reserved, never a workspace). */
export function buildInvitePath(id: string): string {
  return `/invite/${encodeURIComponent(id)}`
}

/**
 * Parse `/invite/:id` into the invitation id. The literal is
 * case-insensitive; the id is URL-decoded. Returns null for every other
 * path (including a bare `/invite`).
 */
export function parseInvitePath(pathname: string): string | null {
  const segments =
    pathname
      .split("?")
      .at(0)
      ?.split("#")
      .at(0)
      ?.split("/")
      .filter((s) => s.length > 0) ?? []
  if (segments.length !== 2) return null
  if (segments[0].toLowerCase() !== "invite") return null
  try {
    const id = decodeURIComponent(segments[1]).trim()
    return id === "" ? null : id
  } catch {
    return segments[1]
  }
}

/**
 * `/{workspaceSlug}/issue/{IDENTIFIER}/{title-slug?}` — shareable detail
 * link. The identifier keeps its canonical uppercase KEY-N form.
 */
export function buildIssuePath(
  workspaceName: string,
  identifier: string,
  title?: string
): string {
  const base = `/${slugifyWorkspace(workspaceName)}/issue/${identifier.toUpperCase()}`
  return title ? `${base}/${slugifyTitle(title)}` : base
}

/**
 * Parse a pathname into its workspace + identifier parts. The title segment
 * (and anything after it) is ignored. Matching is case-insensitive for the
 * `issue` literal; the identifier is uppercased for canonical comparison.
 */
export function parseAppPath(pathname: string): AppPath {
  const segments =
    pathname
      .split("?")
      .at(0)
      ?.split("#")
      .at(0)
      ?.split("/")
      .map((s) => {
        try {
          return decodeURIComponent(s)
        } catch {
          return s
        }
      })
      .filter((s) => s.length > 0) ?? []
  if (segments.length === 0) return { workspaceSlug: null, identifier: null }
  // `/invite/...` is its own page, never a workspace slug.
  if (segments[0].toLowerCase() === "invite") {
    return { workspaceSlug: null, identifier: null }
  }
  const workspaceSlug = segments[0].toLowerCase() || null
  if (segments.length >= 3 && segments[1].toLowerCase() === "issue") {
    const raw = segments[2].trim()
    return { workspaceSlug, identifier: raw ? raw.toUpperCase() : null }
  }
  return { workspaceSlug, identifier: null }
}

/** First workspace whose slugified name matches, or null. */
export function findWorkspaceBySlug<T extends { name: string }>(
  workspaces: T[],
  slug: string | null
): T | null {
  if (!slug) return null
  const lower = slug.toLowerCase()
  return workspaces.find((w) => slugifyWorkspace(w.name) === lower) ?? null
}
