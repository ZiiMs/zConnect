/**
 * GitHub persistence boundary (T6 – External Links). The webhook handler
 * and routes depend only on this interface: contract tests inject the memory
 * store, production injects the Drizzle store over Supabase Postgres.
 * Vocabulary per GLOSSARY.md: External Link (never Integration/Sync).
 */
import type { ExternalLinkKind } from "./parse.js"

export interface GitHubInstall {
  id: string
  workspaceId: string
  repos: string[]
}

export type ExternalLinkState = "open" | "merged" | "closed"

export interface ExternalLink {
  id: string
  issueId: string
  provider: "github"
  kind: ExternalLinkKind
  url: string
  title: string | null
  state: ExternalLinkState | null
}

export interface TimelineEvent {
  id: string
  issueId: string
  kind: string
  body: string
}

export interface CreateExternalLinkInput {
  provider: "github"
  kind: ExternalLinkKind
  url: string
  title?: string | null
  state?: ExternalLinkState | null
}

export interface GitHubStore {
  createInstall(workspaceId: string, repos: string[]): Promise<GitHubInstall>
  listInstalls(workspaceId: string): Promise<GitHubInstall[]>
  /** Workspace install covering `owner/repo`, or null when not installed. */
  findInstallByRepo(fullName: string): Promise<GitHubInstall | null>
  /**
   * Creates an External Link, deduped by issue plus URL so webhook
   * redelivery never duplicates the badge.
   */
  createExternalLink(
    issueId: string,
    input: CreateExternalLinkInput
  ): Promise<ExternalLink>
  updateExternalLink(
    id: string,
    patch: { title?: string | null; state?: ExternalLinkState | null }
  ): Promise<ExternalLink>
  listExternalLinks(issueId: string): Promise<ExternalLink[]>
  appendTimelineEvent(
    issueId: string,
    kind: string,
    body: string
  ): Promise<TimelineEvent>
  listTimelineEvents(issueId: string): Promise<TimelineEvent[]>
  hasProcessedDelivery(deliveryId: string): Promise<boolean>
  markDeliveryProcessed(deliveryId: string): Promise<void>
}

export function createMemoryGitHubStore(): GitHubStore {
  const installs = new Map<string, GitHubInstall>()
  const links = new Map<string, ExternalLink>()
  const events: TimelineEvent[] = []
  const deliveries = new Set<string>()

  return {
    async createInstall(workspaceId, repos) {
      const install: GitHubInstall = {
        id: crypto.randomUUID(),
        workspaceId,
        repos: [...repos],
      }
      installs.set(install.id, install)
      return { ...install, repos: [...install.repos] }
    },

    async listInstalls(workspaceId) {
      return [...installs.values()]
        .filter((i) => i.workspaceId === workspaceId)
        .map((i) => ({ ...i, repos: [...i.repos] }))
    },

    async findInstallByRepo(fullName) {
      const lower = fullName.toLowerCase()
      for (const install of installs.values()) {
        if (install.repos.some((r) => r.toLowerCase() === lower)) {
          return { ...install, repos: [...install.repos] }
        }
      }
      return null
    },

    async createExternalLink(issueId, input) {
      for (const link of links.values()) {
        if (link.issueId === issueId && link.url === input.url) {
          return { ...link }
        }
      }
      const link: ExternalLink = {
        id: crypto.randomUUID(),
        issueId,
        provider: input.provider,
        kind: input.kind,
        url: input.url,
        title: input.title ?? null,
        state: input.state ?? null,
      }
      links.set(link.id, link)
      return { ...link }
    },

    async updateExternalLink(id, patch) {
      const link = links.get(id)
      if (!link) throw new Error("External Link not found")
      if (patch.title !== undefined) link.title = patch.title
      if (patch.state !== undefined) link.state = patch.state
      return { ...link }
    },

    async listExternalLinks(issueId) {
      return [...links.values()]
        .filter((l) => l.issueId === issueId)
        .map((l) => ({ ...l }))
    },

    async appendTimelineEvent(issueId, kind, body) {
      const event: TimelineEvent = {
        id: crypto.randomUUID(),
        issueId,
        kind,
        body,
      }
      events.push(event)
      return { ...event }
    },

    async listTimelineEvents(issueId) {
      return events.filter((e) => e.issueId === issueId).map((e) => ({ ...e }))
    },

    async hasProcessedDelivery(deliveryId) {
      return deliveries.has(deliveryId)
    },

    async markDeliveryProcessed(deliveryId) {
      deliveries.add(deliveryId)
    },
  }
}
