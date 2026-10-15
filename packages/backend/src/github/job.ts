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
