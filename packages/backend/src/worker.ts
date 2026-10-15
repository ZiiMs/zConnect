import { Worker } from "bullmq"
import { QUEUES } from "./lib/queue.js"
import { createWorkerConnection } from "./lib/redis.js"

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

export { worker }
