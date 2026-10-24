import { describe, expect, test } from "bun:test"
import { githubSyncJobOptions } from "./job.js"

describe("github sync jobs", () => {
  test("deduplicate only while the repository job is pending", () => {
    const options = githubSyncJobOptions("repository-1")

    expect(options).toEqual({ deduplication: { id: "repository-1" } })
    expect("jobId" in options).toBe(false)
  })
})
