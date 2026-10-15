import IORedis from "ioredis"

const url = process.env.REDIS_URL

if (!url) {
  throw new Error("REDIS_URL is not set in packages/backend/.env")
}

const redisUrl: string = url

/**
 * Shared connection for producers (Queues).
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null })

/** Fresh connection for consumers (Workers) — BullMQ uses blocking commands. */
export function createWorkerConnection() {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null })
}
