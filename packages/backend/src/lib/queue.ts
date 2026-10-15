import { Queue } from "bullmq"
import { GITHUB_WEBHOOK_JOB, type GitHubWebhookJob } from "../github/job.js"
import { redis } from "./redis.js"

/** Every queue in the app. Add new ones here so producers and workers agree. */
export const QUEUES = {
  default: "default",
  githubWebhook: GITHUB_WEBHOOK_JOB,
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export const queues = {
  default: new Queue(QUEUES.default, { connection: redis }),
  [QUEUES.githubWebhook]: new Queue(QUEUES.githubWebhook, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
    },
  }),
} satisfies Record<QueueName, Queue>

export type JobPayloads = {
  [QUEUES.default]: { task: string }
  [QUEUES.githubWebhook]: GitHubWebhookJob
}
