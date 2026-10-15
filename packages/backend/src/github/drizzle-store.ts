import { and, eq } from "drizzle-orm"
import type { getDb } from "../db/index.js"
import {
  externalLink,
  githubInstall,
  timelineEvent,
  webhookDelivery,
} from "../db/schema.js"
import type { ExternalLinkKind } from "./parse.js"
import type {
  CreateExternalLinkInput,
  ExternalLink,
  ExternalLinkState,
  GitHubInstall,
  GitHubStore,
  TimelineEvent,
} from "./store.js"

type Db = ReturnType<typeof getDb>

/**
 * Production GitHubStore over Supabase Postgres. Resolves the connection
 * lazily per call so importing the app never requires DATABASE_URL —
 * contract tests inject the memory store instead.
 */
export function createDrizzleGitHubStore(resolveDb: () => Db): GitHubStore {
  return {
    async createInstall(workspaceId, repos) {
      const db = resolveDb()
      const [row] = await db
        .insert(githubInstall)
        .values({ workspaceId, repos: [...repos] })
        .returning()
      return toInstall(row)
    },

    async listInstalls(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(githubInstall)
        .where(eq(githubInstall.workspaceId, workspaceId))
      return rows.map(toInstall)
    },

    async findInstallByRepo(fullName) {
      const db = resolveDb()
      const rows = await db.select().from(githubInstall)
      const lower = fullName.toLowerCase()
      const match = rows.find((row) =>
        (row.repos ?? []).some((r) => r.toLowerCase() === lower)
      )
      return match ? toInstall(match) : null
    },

    async createExternalLink(issueId, input: CreateExternalLinkInput) {
      const db = resolveDb()
      const existing = await db
        .select()
        .from(externalLink)
        .where(
          and(
            eq(externalLink.issueId, issueId),
            eq(externalLink.url, input.url)
          )
        )
      if (existing[0]) return toLink(existing[0])
      const [row] = await db
        .insert(externalLink)
        .values({
          issueId,
          provider: input.provider,
          kind: input.kind,
          url: input.url,
          title: input.title ?? null,
          state: input.state ?? null,
        })
        .returning()
      return toLink(row)
    },

    async updateExternalLink(id, patch) {
      const db = resolveDb()
      const [row] = await db
        .update(externalLink)
        .set({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.state !== undefined ? { state: patch.state } : {}),
        })
        .where(eq(externalLink.id, id))
        .returning()
      if (!row) throw new Error("External Link not found")
      return toLink(row)
    },

    async listExternalLinks(issueId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(externalLink)
        .where(eq(externalLink.issueId, issueId))
      return rows.map(toLink)
    },

    async appendTimelineEvent(issueId, kind, body) {
      const db = resolveDb()
      const [row] = await db
        .insert(timelineEvent)
        .values({ issueId, kind, body })
        .returning()
      return toEvent(row)
    },

    async listTimelineEvents(issueId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(timelineEvent)
        .where(eq(timelineEvent.issueId, issueId))
      return rows.map(toEvent)
    },

    async hasProcessedDelivery(deliveryId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(webhookDelivery)
        .where(eq(webhookDelivery.deliveryId, deliveryId))
      return rows.length > 0
    },

    async markDeliveryProcessed(deliveryId) {
      const db = resolveDb()
      await db
        .insert(webhookDelivery)
        .values({ deliveryId })
        .onConflictDoNothing()
    },
  }
}

function toInstall(row: typeof githubInstall.$inferSelect): GitHubInstall {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    repos: [...(row.repos ?? [])],
  }
}

function toLink(row: typeof externalLink.$inferSelect): ExternalLink {
  return {
    id: row.id,
    issueId: row.issueId,
    provider: "github",
    kind: row.kind as ExternalLinkKind,
    url: row.url,
    title: row.title,
    state: row.state as ExternalLinkState | null,
  }
}

function toEvent(row: typeof timelineEvent.$inferSelect): TimelineEvent {
  return { id: row.id, issueId: row.issueId, kind: row.kind, body: row.body }
}
