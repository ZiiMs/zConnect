/**
 * Webhook job handler (T6 – External Links). Processes one typed
 * `github-webhook` queue job: resolves KEY-N references from the PR branch
 * and body against the installed workspace, upserts External Links with the
 * cached PR title/state, and appends a timeline event. Merge is badge-only:
 * the handler never moves Issue Status.
 */
import type { WorkspaceStore } from "../workspaces/store.js"
import { extractIssueRefs } from "./parse.js"
import type { ExternalLinkState, GitHubStore, TimelineEvent } from "./store.js"

export type PullRequestAction = "opened" | "synchronize" | "closed"

export interface PullRequestEvent {
  deliveryId: string
  action: PullRequestAction
  repoFullName: string
  branch: string
  body: string
  url: string
  title: string
  number: number
  merged: boolean
}

export interface PullRequestResult {
  skipped: boolean
  linked: string[]
}

export interface HandlerDeps {
  workspaces: WorkspaceStore
  github: GitHubStore
}

function stateFor(event: PullRequestEvent): ExternalLinkState {
  if (event.action === "closed") return event.merged ? "merged" : "closed"
  return "open"
}

function timelineKind(
  event: PullRequestEvent,
  created: boolean,
  state: ExternalLinkState,
  previous: ExternalLinkState | null
): TimelineEvent["kind"] | null {
  if (created) return "link.opened"
  if (state !== previous) {
    if (state === "merged") return "link.merged"
    if (state === "closed") return "link.closed"
    return "link.reopened"
  }
  if (event.action === "synchronize") return null
  return null
}

export async function handlePullRequestEvent(
  { workspaces, github }: HandlerDeps,
  event: PullRequestEvent
): Promise<PullRequestResult> {
  if (await github.hasProcessedDelivery(event.deliveryId)) {
    return { skipped: true, linked: [] }
  }
  await github.markDeliveryProcessed(event.deliveryId)

  const install = await github.findInstallByRepo(event.repoFullName)
  if (!install) return { skipped: false, linked: [] }

  const refs = extractIssueRefs(`${event.branch} ${event.body}`)
  const state = stateFor(event)
  const linked: string[] = []

  for (const ref of refs) {
    const issue = await workspaces.getIssue(ref)
    if (!issue) continue
    const project = await workspaces.getProject(issue.projectId)
    if (!project || project.workspaceId !== install.workspaceId) continue

    const existing = (await github.listExternalLinks(issue.id)).find(
      (link) => link.url === event.url
    )
    const created = !existing
    if (created) {
      await github.createExternalLink(issue.id, {
        provider: "github",
        kind: "pr",
        url: event.url,
        title: event.title,
        state,
      })
    } else if (existing.title !== event.title || existing.state !== state) {
      await github.updateExternalLink(existing.id, {
        title: event.title,
        state,
      })
    }
    const kind = timelineKind(event, created, state, existing?.state ?? null)
    if (kind) {
      await github.appendTimelineEvent(
        issue.id,
        kind,
        `PR #${event.number} ${event.action}${event.merged ? " (merged)" : ""}`
      )
    }
    linked.push(ref)
  }

  return { skipped: false, linked }
}
