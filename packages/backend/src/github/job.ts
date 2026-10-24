/**
 * Typed background jobs for GitHub webhooks (T6 – External Links). The
 * payloads live in the github module so routes and the worker agree without
 * importing queue infrastructure (which needs REDIS_URL) in contract tests.
 */
import type { PullRequestAction, PushCommit } from "./handler.js"

export const GITHUB_WEBHOOK_JOB = "github-webhook" as const

export interface GitHubWebhookJob {
  kind: "pull_request"
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

export interface GitHubPushJob {
  kind: "push"
  deliveryId: string
  repoFullName: string
  commits: PushCommit[]
}

export type GitHubWebhookPayload = GitHubWebhookJob | GitHubPushJob

/**
 * Options for one repository's sync job. Deduplication replaces a stable job
 * id: BullMQ releases the key when the job completes or fails, while a
 * retained completed job with the same `jobId` would swallow later refreshes
 * until retention evicted it.
 */
export function githubSyncJobOptions(repositoryId: string): {
  deduplication: { id: string }
} {
  return { deduplication: { id: repositoryId } }
}
