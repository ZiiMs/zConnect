import "./lib/env.js"
import { Worker } from "bullmq"
import { getDb } from "./db/index.js"
import { createDrizzleGitHubStore } from "./github/drizzle-store.js"
import { createGitHubProvider } from "./github/github-provider.js"
import { handlePullRequestEvent, handlePushEvent } from "./github/handler.js"
import type { GitHubWebhookPayload } from "./github/job.js"
import {
  applyRetention,
  type GitHubSyncDeps,
  selectSweepRepositories,
  syncRepository,
} from "./github/sync.js"
import { createIntegrationCipher } from "./lib/cipher.js"
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
 * GitHub View sync (#49/#51). One job per repository (`jobId` collapses
 * duplicates on the queue); the runner writes Pull Request and GitHub Issue
 * snapshots and freshness. The same worker also owns the repeatable
 * `github-sync-sweep` and `github-retention` schedulers, branching on the job
 * name so a maintenance job never needs a second queue hop.
 */
const githubProvider = createGitHubProvider()
const integrationCipher = process.env.INTEGRATION_ENCRYPTION_KEY
  ? createIntegrationCipher(process.env.INTEGRATION_ENCRYPTION_KEY)
  : null

/** Repositories older than this are swept by the repeatable job. */
const GITHUB_SWEEP_INTERVAL_MS = 15 * 60 * 1000
const GITHUB_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000

function createGitHubSyncDeps(): GitHubSyncDeps | null {
  if (!integrationCipher) return null
  const db = () => getDb()
  return {
    workspaces: createDrizzleWorkspaceStore(db),
    github: createDrizzleGitHubStore(db),
    provider: githubProvider,
    decrypt: (payload: string) => integrationCipher.decrypt(payload),
    now: () => new Date(),
  }
}

async function runGitHubSyncSweep(): Promise<
  { skipped: true } | { repositories: number }
> {
  const deps = createGitHubSyncDeps()
  if (!deps) return { skipped: true }
  const repositoryIds = await selectSweepRepositories(
    deps,
    GITHUB_SWEEP_INTERVAL_MS
  )
  for (const repositoryId of repositoryIds) {
    const outcome = await syncRepository(deps, repositoryId)
    console.log(`[worker] github-sync-sweep ${repositoryId}: ${outcome.status}`)
  }
  return { repositories: repositoryIds.length }
}

async function runGitHubRetention(): Promise<
  { skipped: true } | { pullRequests: number; issues: number }
> {
  const deps = createGitHubSyncDeps()
  if (!deps) return { skipped: true }
  const result = await applyRetention(deps)
  console.log(
    `[worker] github-retention: removed ${result.pullRequests} pull request(s) and ${result.issues} GitHub Issue(s)`
  )
  return result
}

const githubSyncWorker = new Worker<JobPayloads[typeof QUEUES.githubSync]>(
  QUEUES.githubSync,
  async (job) => {
    if (job.name === "github-sync-sweep") return await runGitHubSyncSweep()
    if (job.name === "github-retention") return await runGitHubRetention()

    const deps = createGitHubSyncDeps()
    if (!deps) {
      console.warn(
        "[worker] github-sync skipped: INTEGRATION_ENCRYPTION_KEY is unset"
      )
      return { skipped: true }
    }
    const outcome = await syncRepository(deps, job.data.repositoryId)
    console.log(
      `[worker] github-sync ${job.data.repositoryId}: ${outcome.status}`
    )
    return outcome
  },
  { connection: createWorkerConnection(), concurrency: 3 }
)

githubSyncWorker.on("completed", (job) => {
  console.log(`[worker] completed github-sync (${job.id})`)
})

githubSyncWorker.on("failed", (job, err) => {
  console.error(`[worker] failed github-sync (${job?.id}):`, err.message)
})

console.log(`[worker] listening on queue "${QUEUES.githubSync}"`)

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

// GitHub freshness (#51): a sweep every fifteen minutes over repositories
// linked to at least one project and parked longer than the window, plus a
// daily 90-day retention pass. Both run in the github-sync worker; upserting
// the stable ids refreshes the schedules instead of stacking duplicates.
void queues[QUEUES.githubSync]
  .upsertJobScheduler(
    "github-sync-sweep",
    { every: GITHUB_SWEEP_INTERVAL_MS },
    { name: "github-sync-sweep" }
  )
  .then(() => {
    console.log("[worker] scheduled github-sync-sweep every 15 minutes")
  })
  .catch((error: unknown) => {
    console.error("[worker] failed to schedule github-sync-sweep:", error)
  })

void queues[QUEUES.githubSync]
  .upsertJobScheduler(
    "github-retention",
    { every: GITHUB_RETENTION_INTERVAL_MS },
    { name: "github-retention" }
  )
  .then(() => {
    console.log("[worker] scheduled github-retention daily")
  })
  .catch((error: unknown) => {
    console.error("[worker] failed to schedule github-retention:", error)
  })

export type { JobPayloads }
export { digestWorker, githubSyncWorker, githubWorker, worker }
