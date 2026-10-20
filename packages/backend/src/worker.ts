import "./lib/env.js"
import { Worker } from "bullmq"
import { getDb } from "./db/index.js"
import { createDrizzleGitHubStore } from "./github/drizzle-store.js"
import { handlePullRequestEvent, handlePushEvent } from "./github/handler.js"
import type { GitHubWebhookPayload } from "./github/job.js"
import { createMailerFromEnv } from "./lib/mailer.js"
import { type JobPayloads, QUEUES, queues } from "./lib/queue.js"
import { createWorkerConnection } from "./lib/redis.js"
import { runDigestJob } from "./notifications/digest.js"
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
 * redelivered webhooks never duplicate links or activity events.
 */
const githubWorker = new Worker<GitHubWebhookPayload>(
  QUEUES.githubWebhook,
  async (job) => {
    const db = () => getDb()
    const deps = {
      workspaces: createDrizzleWorkspaceStore(db),
      github: createDrizzleGitHubStore(db),
    }
    const result =
      job.data.kind === "push"
        ? await handlePushEvent(deps, job.data)
        : await handlePullRequestEvent(deps, job.data)
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

/**
 * Digest worker (R2): one email per user covering unread notifications older
 * than the 30-minute window, plus the 90-day read-notification purge. Mailed
 * rows are stamped so a retry or the next run never repeats them.
 */
const digestWorker = new Worker<JobPayloads[typeof QUEUES.digest]>(
  QUEUES.digest,
  async (job) => {
    const result = await runDigestJob({
      store: createDrizzleWorkspaceStore(() => getDb()),
      mailer: createMailerFromEnv(),
      frontendUrl: process.env.FRONTEND_URL,
    })
    console.log(
      `[worker] digest ${job.id}: mailed ${result.users} user(s), ${result.notifications} notification(s)`
    )
    return result
  },
  { connection: createWorkerConnection() }
)

digestWorker.on("completed", (job) => {
  console.log(`[worker] completed notification-digest (${job.id})`)
})

digestWorker.on("failed", (job, err) => {
  console.error(
    `[worker] failed notification-digest (${job?.id}):`,
    err.message
  )
})

console.log(`[worker] listening on queue "${QUEUES.digest}"`)

// Repeatable schedule. BullMQ 6 replaced `JobsOptions.repeat` with job
// schedulers; upserting the stable id refreshes the same every-30-minutes
// schedule on restart instead of stacking new ones.
void queues[QUEUES.digest]
  .upsertJobScheduler(
    "notification-digest",
    { every: 30 * 60 * 1000 },
    { name: "notification-digest", data: {} }
  )
  .then(() => {
    console.log("[worker] scheduled notification-digest every 30 minutes")
  })
  .catch((error: unknown) => {
    console.error("[worker] failed to schedule notification-digest:", error)
  })

export type { JobPayloads }
export { digestWorker, githubWorker, worker }
