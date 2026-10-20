import { describe, expect, test } from "vitest"
import {
  buildInvitePath,
  buildIssuePath,
  buildWorkspacePath,
  findWorkspaceBySlug,
  parseAppPath,
  parseInvitePath,
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

  test("parses workspace, issue, and title URLs", () => {
    expect(parseAppPath("/")).toEqual({
      workspaceSlug: null,
      identifier: null,
    })
    expect(parseAppPath("/acme-corp")).toEqual({
      workspaceSlug: "acme-corp",
      identifier: null,
    })
    expect(parseAppPath("/acme-corp/issue/WEB-123/fix-login")).toEqual({
      workspaceSlug: "acme-corp",
      identifier: "WEB-123",
    })
    // Identifier lookup is case-insensitive; the title slug is ignored.
    expect(parseAppPath("/Acme/ISSUE/web-7")).toEqual({
      workspaceSlug: "acme",
      identifier: "WEB-7",
    })
    expect(parseAppPath("/acme/issue/WEB-9")).toEqual({
      workspaceSlug: "acme",
      identifier: "WEB-9",
    })
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
    expect(parseAppPath("/invite/x")).toEqual({
      workspaceSlug: null,
      identifier: null,
    })
    expect(parseAppPath("/INVITE/x/issue/WEB-1")).toEqual({
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
})
