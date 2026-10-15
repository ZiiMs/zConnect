import { Queue } from "bullmq"
import { redis } from "./redis.js"

/** Every queue in the app. Add new ones here so producers and workers agree. */
export const QUEUES = {
  default: "default",
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export const queues = {
  default: new Queue(QUEUES.default, { connection: redis }),
} satisfies Record<QueueName, Queue>

export type JobPayloads = {
  [QUEUES.default]: { task: string }
}
