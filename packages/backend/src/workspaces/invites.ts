import { Hono } from "hono"
import { z } from "zod"
import type { Mailer } from "../lib/mailer.js"
import type { GetSession } from "./session.js"
import {
  type Invitation,
  type Membership,
  WORKSPACE_ROLES,
  type WorkspaceStore,
} from "./store.js"

const inviteBody = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(WORKSPACE_ROLES),
})

const DEFAULT_FRONTEND_URL = "http://localhost:5173"

export interface InvitesDeps {
  store: WorkspaceStore
  getSession: GetSession
  /** Optional outbound mail; absent/`null` means copy-link only. */
  mailer?: Mailer | null
  /** Origin the accept page is served from. */
  frontendUrl?: string
}

/** Strip a trailing slash so the accept path never doubles up. */
function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "")
}

function acceptUrlFor(origin: string, invitationId: string): string {
  return `${normalizeOrigin(origin)}/invite/${invitationId}`
}

function isExpired(invitation: Invitation, now = Date.now()): boolean {
  const expiresAt = Date.parse(invitation.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

function inviterLabel(
  members: Membership[],
  inviterId: string,
  fallbackEmail: string
): string {
  const inviter = members.find((member) => member.userId === inviterId)
  return inviter?.name?.trim() || inviter?.email?.trim() || fallbackEmail
}

function isConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "conflict"
  )
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "not_found"
  )
}

/**
 * Invitation HTTP boundary: create (Owner/Admin), list for the signed-in
 * email, read one for the accept page, and accept. Email delivery lives here
 * too; the accept URL is always returned so a copy-link fallback works when
 * mail is disabled or the send fails.
 */
export function createInvitesApp({
  store,
  getSession,
  mailer = null,
  frontendUrl = DEFAULT_FRONTEND_URL,
}: InvitesDeps) {
  const app = new Hono()

  app.post("/api/workspaces/:id/invites", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const parsed = inviteBody.safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: "Invalid invite" }, 400)
    const workspace = await store.getWorkspace(workspaceId)
    if (!workspace) return c.json({ error: "Not found" }, 404)
    try {
      const invitation = await store.createInvitation({
        workspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        invitedBy: session.user.id,
      })
      const acceptUrl = acceptUrlFor(frontendUrl, invitation.id)
      let mailSent = false
      if (mailer) {
        const members = await store.listMembers(workspaceId)
        const inviter = inviterLabel(
          members,
          invitation.invitedBy,
          session.user.email
        )
        try {
          await mailer.send({
            to: invitation.email,
            subject: `Join ${workspace.name} on zConnect`,
            text: [
              `${inviter} invited you to join ${workspace.name} on zConnect as ${invitation.role}.`,
              "",
              `Accept the invitation: ${acceptUrl}`,
              `This invitation expires on ${invitation.expiresAt.slice(0, 10)}.`,
            ].join("\n"),
          })
          mailSent = true
        } catch (error) {
          // Delivery is best-effort: the invitation row still exists and the
          // response carries the copy-link fallback. Never log the URL.
          console.error(
            `[invites] failed to send invitation for workspace ${workspaceId}:`,
            error instanceof Error ? error.message : error
          )
        }
      }
      return c.json({ ...invitation, mailSent, acceptUrl }, 201)
    } catch (error) {
      if (isConflict(error)) return c.json({ error: "Already invited" }, 409)
      throw error
    }
  })

  app.get("/api/invitations", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const invitations = await store.listInvitationsForEmail(session.user.email)
    // Enrich for the account-level inbox: the invitee is not a member yet,
    // so they cannot read the workspace row themselves.
    const enriched = await Promise.all(
      invitations.map(async (invitation) => {
        const [workspace, members] = await Promise.all([
          store.getWorkspace(invitation.workspaceId),
          store.listMembers(invitation.workspaceId),
        ])
        const inviter = members.find(
          (member) => member.userId === invitation.invitedBy
        )
        return {
          ...invitation,
          workspace: workspace
            ? { id: workspace.id, name: workspace.name }
            : { id: invitation.workspaceId, name: "Unknown workspace" },
          inviter: inviter
            ? {
                id: inviter.userId,
                ...(inviter.name ? { name: inviter.name } : {}),
                ...(inviter.email ? { email: inviter.email } : {}),
              }
            : { id: invitation.invitedBy },
        }
      })
    )
    return c.json(enriched)
  })

  app.get("/api/workspaces/:id/invites", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const workspaceId = c.req.param("id")
    const membership = await store.getMembership(workspaceId, session.user.id)
    if (!membership || membership.role === "Member") {
      return c.json({ error: "Forbidden" }, 403)
    }
    const workspace = await store.getWorkspace(workspaceId)
    if (!workspace) return c.json({ error: "Not found" }, 404)
    return c.json(await store.listInvitationsForWorkspace(workspaceId))
  })

  app.delete("/api/invitations/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const invitation = await store.getInvitation(c.req.param("id"))
    if (!invitation) return c.json({ error: "Not found" }, 404)
    const isInvitee =
      invitation.email.toLowerCase() === session.user.email.toLowerCase()
    const membership = await store.getMembership(
      invitation.workspaceId,
      session.user.id
    )
    const isManager = !!membership && membership.role !== "Member"
    if (!isInvitee && !isManager) {
      return c.json({ error: "Forbidden" }, 403)
    }
    const deleted = await store.deleteInvitation(invitation.id)
    if (!deleted) return c.json({ error: "Not found" }, 404)
    return new Response(null, { status: 204 })
  })

  app.get("/api/invitations/:id", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const invitation = await store.getInvitation(c.req.param("id"))
    if (!invitation) return c.json({ error: "Not found" }, 404)
    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return c.json({ error: "Forbidden" }, 403)
    }
    if (isExpired(invitation)) return c.json({ error: "Gone" }, 410)
    const [workspace, members] = await Promise.all([
      store.getWorkspace(invitation.workspaceId),
      store.listMembers(invitation.workspaceId),
    ])
    if (!workspace) return c.json({ error: "Not found" }, 404)
    const inviter = members.find(
      (member) => member.userId === invitation.invitedBy
    )
    return c.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      workspace: { id: workspace.id, name: workspace.name },
      inviter: inviter
        ? {
            id: inviter.userId,
            ...(inviter.name ? { name: inviter.name } : {}),
            ...(inviter.email ? { email: inviter.email } : {}),
          }
        : { id: invitation.invitedBy },
    })
  })

  app.post("/api/invitations/:id/accept", async (c) => {
    const session = await getSession(c.req.raw)
    if (!session) return c.json({ error: "Unauthorized" }, 401)
    const invitation = await store.getInvitation(c.req.param("id"))
    if (!invitation) return c.json({ error: "Not found" }, 404)
    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return c.json({ error: "Forbidden" }, 403)
    }
    if (isExpired(invitation)) return c.json({ error: "Gone" }, 410)
    try {
      const membership = await store.acceptInvitation(
        invitation.id,
        session.user.id
      )
      return c.json(membership)
    } catch (error) {
      if (isNotFound(error)) return c.json({ error: "Not found" }, 404)
      throw error
    }
  })

  return app
}
