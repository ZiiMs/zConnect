import { Worker } from "bullmq"
import { getDb } from "./db/index.js"
import { createDrizzleGitHubStore } from "./github/drizzle-store.js"
import { handlePullRequestEvent } from "./github/handler.js"
import type { GitHubWebhookJob } from "./github/job.js"
import { type JobPayloads, QUEUES } from "./lib/queue.js"
import { createWorkerConnection } from "./lib/redis.js"
import { createDrizzleWorkspaceStore } from "./workspaces/drizzle-store.js"

/**
 * Background worker process. Run separately from the API:
 *   bun run worker
 */
const worker = new Worker(
  QUEUES.default,
  async (job) => {
    console.log(`[worker] processing ${job.name} (${job.id})`)
    return { ok: true, echo: job.data }
  },
  { connection: createWorkerConnection() }
)

worker.on("completed", (job) => {
  console.log(`[worker] completed ${job.name} (${job.id})`)
})

worker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.name} (${job?.id}):`, err.message)
})

console.log(`[worker] listening on queue "${QUEUES.default}"`)

/**
 * GitHub webhook worker (T6 – External Links). Consumes the typed
 * `github-webhook` queue with retry (attempts/backoff on the queue) and
 * delegates to the idempotent handler, which dedupes by delivery id so
 * redelivered webhooks never duplicate links or timeline events.
 */
const githubWorker = new Worker<GitHubWebhookJob>(
  QUEUES.githubWebhook,
  async (job) => {
    const db = () => getDb()
    const result = await handlePullRequestEvent(
      {
        workspaces: createDrizzleWorkspaceStore(db),
        github: createDrizzleGitHubStore(db),
      },
      job.data
    )
    console.log(
      `[worker] github-webhook ${job.data.deliveryId}: linked ${result.linked.join(", ") || "none"}`
    )
    return result
  },
  { connection: createWorkerConnection() }
)

githubWorker.on("completed", (job) => {
  console.log(`[worker] completed github-webhook (${job.id})`)
})

githubWorker.on("failed", (job, err) => {
  console.error(`[worker] failed github-webhook (${job?.id}):`, err.message)
})

console.log(`[worker] listening on queue "${QUEUES.githubWebhook}"`)

export type { JobPayloads }
export { githubWorker, worker }
