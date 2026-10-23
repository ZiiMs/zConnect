/**
 * URL routes per GLOSSARY.md sharing model: the browser location is the state
 * store for workspace + open page, so links are shareable and survive
 * reloads. Shapes:
 * - `/{workspaceSlug}` for the workspace home (canonicalizes to the open
 *   project's `/{workspaceSlug}/{PROJECTKEY}` once projects load),
 * - `/{workspaceSlug}/{PROJECTKEY}` for a project,
 * - `/{workspaceSlug}/issue/{IDENTIFIER}/{title-slug?}` for detail,
 * - `/{workspaceSlug}/settings[/{tab}]` for settings,
 * - `/{workspaceSlug}/my-issues[/{tab}]` for My Issues,
 * - `/{workspaceSlug}/inbox[/{filter}]` for Inbox,
 * - `/{workspaceSlug}/new-project` for project creation.
 * The identifier (KEY-N, e.g. WEB-123) is the lookup key; the workspace and
 * title segments are readability context and are ignored for resolution (the
 * title slug, like Linear/Medium, never affects which issue loads).
 */

export type WorkspaceSection =
  | "project"
  | "issue"
  | "settings"
  | "my-issues"
  | "inbox"
  | "new-project"

export type SettingsTab =
  | "general"
  | "members"
  | "workflow"
  | "labels"
  | "notifications"

/** Settings location: a detail tab, or the `index` homepage (`/settings`). */
export type SettingsView = SettingsTab | "index"

export type MyIssuesTab = "assigned" | "created" | "watched"

export type InboxFilter = "all" | "unread"

export interface AppPath {
  workspaceSlug: string | null
  section: WorkspaceSection
  /** Uppercase project key for `/{ws}/{KEY}`, or null for the home alias. */
  projectKey: string | null
  identifier: string | null
  /** `index` is the settings homepage (`/{ws}/settings`); the rest are detail pages. */
  settingsTab: SettingsView
  myIssuesTab: MyIssuesTab
  inboxFilter: InboxFilter
}

export const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "members",
  "workflow",
  "labels",
  "notifications",
]

export const MY_ISSUES_TABS: MyIssuesTab[] = ["assigned", "created", "watched"]

export const INBOX_FILTERS: InboxFilter[] = ["all", "unread"]

/**
 * Canonical settings view: the bare `/settings` URL is the `index`
 * homepage; every detail page appends its segment (including `general`).
 * Accepts `workflows`/`statuses`/`status` aliases for workflow.
 */
export function parseSettingsTab(raw: string | null | undefined): SettingsView {
  const lower = (raw ?? "").toLowerCase()
  if (lower === "") return "index"
  if (lower === "general") return "general"
  if (lower === "members") return "members"
  if (
    lower === "workflow" ||
    lower === "workflows" ||
    lower === "statuses" ||
    lower === "status"
  )
    return "workflow"
  if (lower === "labels") return "labels"
  if (lower === "notifications") return "notifications"
  return "index"
}

/** Canonical My Issues tab, defaulting to `assigned`. */
export function parseMyIssuesTab(raw: string | null | undefined): MyIssuesTab {
  const lower = (raw ?? "").toLowerCase()
  if (lower === "created") return "created"
  if (lower === "watched") return "watched"
  return "assigned"
}

/** Canonical inbox filter, defaulting to `all`. */
export function parseInboxFilter(raw: string | null | undefined): InboxFilter {
  return (raw ?? "").toLowerCase() === "unread" ? "unread" : "all"
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

/** `/{workspaceSlug}/{PROJECTKEY}` — a project in the workspace. */
export function buildProjectPath(
  workspaceName: string,
  projectKey: string
): string {
  return `/${slugifyWorkspace(workspaceName)}/${projectKey.toUpperCase()}`
}

/**
 * `/{workspaceSlug}/settings[/{tab}]` — settings. The bare `/settings`
 * URL is the index homepage; every detail page (including `general`)
 * appends its segment.
 */
export function buildSettingsPath(
  workspaceName: string,
  tab?: SettingsTab | "index"
): string {
  const base = `/${slugifyWorkspace(workspaceName)}/settings`
  if (!tab || tab === "index") return base
  return `${base}/${tab}`
}

/**
 * `/{workspaceSlug}/my-issues[/{tab}]` — My Issues. `assigned` is the bare
 * URL; `created`/`watched` append their segment.
 */
export function buildMyIssuesPath(
  workspaceName: string,
  tab?: MyIssuesTab
): string {
  const base = `/${slugifyWorkspace(workspaceName)}/my-issues`
  if (!tab || tab === "assigned") return base
  return `${base}/${tab}`
}

/**
 * `/{workspaceSlug}/inbox[/{filter}]` — Inbox. `all` is the bare URL;
 * `unread` appends its segment.
 */
export function buildInboxPath(
  workspaceName: string,
  filter?: InboxFilter
): string {
  const base = `/${slugifyWorkspace(workspaceName)}/inbox`
  if (!filter || filter === "all") return base
  return `${base}/${filter}`
}

/** `/{workspaceSlug}/new-project` — project creation. */
export function buildNewProjectPath(workspaceName: string): string {
  return `/${slugifyWorkspace(workspaceName)}/new-project`
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
 * Parse a pathname into its workspace + section parts. The title segment
 * (and anything after it) is ignored. Matching is case-insensitive for the
 * section literals; identifiers and project keys are uppercased for canonical
 * comparison.
 */
export function parseAppPath(pathname: string): AppPath {
  const fallback: AppPath = {
    workspaceSlug: null,
    section: "project",
    projectKey: null,
    identifier: null,
    settingsTab: "index",
    myIssuesTab: "assigned",
    inboxFilter: "all",
  }
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
  if (segments.length === 0) return fallback
  // `/invite/...` is its own page, never a workspace slug.
  if (segments[0].toLowerCase() === "invite") {
    return { ...fallback, workspaceSlug: null }
  }
  const workspaceSlug = segments[0].toLowerCase() || null
  const second = segments[1]?.toLowerCase() ?? null
  if (second === null) {
    return { ...fallback, workspaceSlug, section: "project" }
  }
  if (second === "issue") {
    const raw = segments[2]?.trim() ?? ""
    return {
      ...fallback,
      workspaceSlug,
      section: "issue",
      identifier: raw ? raw.toUpperCase() : null,
    }
  }
  if (second === "settings") {
    return {
      ...fallback,
      workspaceSlug,
      section: "settings",
      settingsTab: parseSettingsTab(segments[2] ?? null),
    }
  }
  if (second === "my-issues") {
    return {
      ...fallback,
      workspaceSlug,
      section: "my-issues",
      myIssuesTab: parseMyIssuesTab(segments[2] ?? null),
    }
  }
  if (second === "inbox") {
    return {
      ...fallback,
      workspaceSlug,
      section: "inbox",
      inboxFilter: parseInboxFilter(segments[2] ?? null),
    }
  }
  if (second === "new-project") {
    return { ...fallback, workspaceSlug, section: "new-project" }
  }
  // Anything else is a project-key attempt (`/{ws}/{KEY}`); the shell falls
  // back to the workspace home when no project matches.
  const rawKey = segments[1].trim()
  return {
    ...fallback,
    workspaceSlug,
    section: "project",
    projectKey: rawKey ? rawKey.toUpperCase() : null,
  }
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

/** First project whose key matches (case-insensitive), or null. */
export function findProjectByKey<T extends { key: string }>(
  projects: T[],
  key: string | null
): T | null {
  if (!key) return null
  const upper = key.toUpperCase()
  return projects.find((p) => p.key.toUpperCase() === upper) ?? null
}
