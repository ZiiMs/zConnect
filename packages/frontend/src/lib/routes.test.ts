import { describe, expect, test } from "vitest"
import {
  buildGitHubPath,
  buildInboxPath,
  buildInvitePath,
  buildIssuePath,
  buildMyIssuesPath,
  buildNewProjectPath,
  buildProjectPath,
  buildSettingsPath,
  buildWorkspacePath,
  findProjectByKey,
  findWorkspaceBySlug,
  parseAppPath,
  parseInboxFilter,
  parseInvitePath,
  parseMyIssuesTab,
  parseSettingsTab,
  slugifyTitle,
  slugifyWorkspace,
} from "./routes.js"

describe("routes", () => {
  test("slugifies workspace names to URL segments", () => {
    expect(slugifyWorkspace("Acme Corp")).toBe("acme-corp")
    expect(slugifyWorkspace("  Web_Team! ")).toBe("web-team")
    expect(slugifyWorkspace("")).toBe("workspace")
    expect(slugifyWorkspace("!!!")).toBe("workspace")
  })

  test("slugifies titles, falling back for blank titles", () => {
    expect(slugifyTitle("Fix login redirect")).toBe("fix-login-redirect")
    expect(slugifyTitle("")).toBe("issue")
  })

  test("builds workspace and issue paths", () => {
    expect(buildWorkspacePath("Acme Corp")).toBe("/acme-corp")
    expect(buildIssuePath("Acme Corp", "WEB-123", "Fix login")).toBe(
      "/acme-corp/issue/WEB-123/fix-login"
    )
    expect(buildIssuePath("Acme", "web-7")).toBe("/acme/issue/WEB-7")
  })

  test("builds project, settings, my-issues, inbox, and new-project paths", () => {
    expect(buildProjectPath("Acme Corp", "WEB")).toBe("/acme-corp/WEB")
    expect(buildProjectPath("Acme", "web")).toBe("/acme/WEB")
    expect(buildGitHubPath("Acme Corp", "WEB")).toBe("/acme-corp/WEB/github")
    expect(buildGitHubPath("Acme", "web")).toBe("/acme/WEB/github")
    expect(buildGitHubPath("Acme", "WEB", "pull-requests")).toBe(
      "/acme/WEB/github"
    )
    expect(buildGitHubPath("Acme", "WEB", "issues")).toBe(
      "/acme/WEB/github/issues"
    )
    expect(buildSettingsPath("Acme")).toBe("/acme/settings")
    expect(buildSettingsPath("Acme", "general")).toBe("/acme/settings/general")
    expect(buildSettingsPath("Acme", "workflow")).toBe(
      "/acme/settings/workflow"
    )
    expect(buildSettingsPath("Acme", "labels")).toBe("/acme/settings/labels")
    expect(buildSettingsPath("Acme", "connections")).toBe(
      "/acme/settings/connections"
    )
    expect(buildSettingsPath("Acme", "repositories")).toBe(
      "/acme/settings/repositories"
    )
    expect(buildMyIssuesPath("Acme")).toBe("/acme/my-issues")
    expect(buildMyIssuesPath("Acme", "watched")).toBe("/acme/my-issues/watched")
    expect(buildInboxPath("Acme")).toBe("/acme/inbox")
    expect(buildInboxPath("Acme", "unread")).toBe("/acme/inbox/unread")
    expect(buildNewProjectPath("Acme")).toBe("/acme/new-project")
  })

  test("parses workspace, issue, and title URLs", () => {
    expect(parseAppPath("/")).toMatchObject({
      workspaceSlug: null,
      identifier: null,
      section: "project",
    })
    expect(parseAppPath("/acme-corp")).toMatchObject({
      workspaceSlug: "acme-corp",
      identifier: null,
      section: "project",
      projectKey: null,
    })
    expect(parseAppPath("/acme-corp/issue/WEB-123/fix-login")).toMatchObject({
      workspaceSlug: "acme-corp",
      identifier: "WEB-123",
      section: "issue",
    })
    // Identifier lookup is case-insensitive; the title slug is ignored.
    expect(parseAppPath("/Acme/ISSUE/web-7")).toMatchObject({
      workspaceSlug: "acme",
      identifier: "WEB-7",
      section: "issue",
    })
    expect(parseAppPath("/acme/issue/WEB-9")).toMatchObject({
      workspaceSlug: "acme",
      identifier: "WEB-9",
      section: "issue",
    })
  })

  test("parses project, settings, my-issues, inbox, and new-project URLs", () => {
    expect(parseAppPath("/acme/WEB")).toMatchObject({
      workspaceSlug: "acme",
      section: "project",
      projectKey: "WEB",
      projectView: "issues",
      githubTab: "pull-requests",
    })
    expect(parseAppPath("/acme/web")).toMatchObject({
      workspaceSlug: "acme",
      section: "project",
      projectKey: "WEB",
      projectView: "issues",
    })
    expect(parseAppPath("/acme/WEB/github")).toMatchObject({
      workspaceSlug: "acme",
      section: "project",
      projectKey: "WEB",
      projectView: "github",
      githubTab: "pull-requests",
    })
    // The view literal is case-insensitive; a title slug after `github` is
    // ignored, and `issues` selects the second GitHub View tab.
    expect(parseAppPath("/Acme/Web/GITHUB")).toMatchObject({
      workspaceSlug: "acme",
      projectKey: "WEB",
      projectView: "github",
      githubTab: "pull-requests",
    })
    expect(parseAppPath("/acme/WEB/github/ISSUES")).toMatchObject({
      workspaceSlug: "acme",
      projectKey: "WEB",
      projectView: "github",
      githubTab: "issues",
    })
    expect(parseAppPath("/acme/WEB/github/issues/extra")).toMatchObject({
      projectView: "github",
      githubTab: "issues",
    })
    expect(parseAppPath("/acme/settings")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "index",
    })
    expect(parseAppPath("/acme/settings/members")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "members",
    })
    expect(parseAppPath("/acme/settings/workflows")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "workflow",
    })
    expect(parseAppPath("/acme/settings/statuses")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "workflow",
    })
    expect(parseAppPath("/Acme/Settings/Labels")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "labels",
    })
    expect(parseAppPath("/acme/settings/connections")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "connections",
    })
    expect(parseAppPath("/acme/settings/repositories")).toMatchObject({
      workspaceSlug: "acme",
      section: "settings",
      settingsTab: "repositories",
    })
    expect(parseAppPath("/acme/my-issues")).toMatchObject({
      workspaceSlug: "acme",
      section: "my-issues",
      myIssuesTab: "assigned",
    })
    expect(parseAppPath("/acme/my-issues/watched")).toMatchObject({
      workspaceSlug: "acme",
      section: "my-issues",
      myIssuesTab: "watched",
    })
    expect(parseAppPath("/acme/inbox")).toMatchObject({
      workspaceSlug: "acme",
      section: "inbox",
      inboxFilter: "all",
    })
    expect(parseAppPath("/acme/inbox/unread")).toMatchObject({
      workspaceSlug: "acme",
      section: "inbox",
      inboxFilter: "unread",
    })
    expect(parseAppPath("/acme/new-project")).toMatchObject({
      workspaceSlug: "acme",
      section: "new-project",
    })
  })

  test("parses tab aliases and defaults", () => {
    expect(parseSettingsTab(null)).toBe("index")
    expect(parseSettingsTab("general")).toBe("general")
    expect(parseSettingsTab("connections")).toBe("connections")
    expect(parseSettingsTab("Repositories")).toBe("repositories")
    expect(parseSettingsTab("workflows")).toBe("workflow")
    expect(parseSettingsTab("statuses")).toBe("workflow")
    expect(parseSettingsTab("nope")).toBe("index")
    expect(parseMyIssuesTab("created")).toBe("created")
    expect(parseMyIssuesTab(null)).toBe("assigned")
    expect(parseInboxFilter("unread")).toBe("unread")
    expect(parseInboxFilter("all")).toBe("all")
    expect(parseInboxFilter(null)).toBe("all")
  })

  test("builds and parses invite paths", () => {
    expect(buildInvitePath("inv-1")).toBe("/invite/inv-1")
    expect(buildInvitePath("inv 1/x")).toBe("/invite/inv%201%2Fx")
    expect(parseInvitePath("/invite/inv-1")).toBe("inv-1")
    expect(parseInvitePath("/INVITE/inv%201")).toBe("inv 1")
    expect(parseInvitePath("/invite/inv-1?from=email")).toBe("inv-1")
    expect(parseInvitePath("/invite/")).toBeNull()
    expect(parseInvitePath("/invite")).toBeNull()
    expect(parseInvitePath("/acme/issue/WEB-1")).toBeNull()
  })

  test("an invite URL is never parsed as a workspace", () => {
    expect(parseAppPath("/invite/x")).toMatchObject({
      workspaceSlug: null,
      identifier: null,
    })
    expect(parseAppPath("/INVITE/x/issue/WEB-1")).toMatchObject({
      workspaceSlug: null,
      identifier: null,
    })
  })

  test("finds a workspace by slug", () => {
    const workspaces = [{ name: "Acme Corp" }, { name: "Beta" }]
    expect(findWorkspaceBySlug(workspaces, "acme-corp")).toEqual({
      name: "Acme Corp",
    })
    expect(findWorkspaceBySlug(workspaces, null)).toBeNull()
    expect(findWorkspaceBySlug(workspaces, "nope")).toBeNull()
  })

  test("finds a project by key", () => {
    const projects = [{ key: "WEB" }, { key: "MOB" }]
    expect(findProjectByKey(projects, "web")).toEqual({ key: "WEB" })
    expect(findProjectByKey(projects, null)).toBeNull()
    expect(findProjectByKey(projects, "nope")).toBeNull()
  })
})
