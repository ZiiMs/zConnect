/**
 * Typed background job for GitHub webhooks (T6 – External Links). The
 * payload lives in the github module so routes and the worker agree without
 * importing queue infrastructure (which needs REDIS_URL) in contract tests.
 */
import type { PullRequestAction } from "./handler.js"

export const GITHUB_WEBHOOK_JOB = "github-webhook" as const

export interface GitHubWebhookJob {
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
