/**
 * Worker-level GitHub jobs (#51), extracted from `worker.ts` so the sweep
 * logic is testable without a queue. The sweep walks the due candidates and
 * stops at the first rate limit: GitHub's reset instant defers the whole
 * sweep through one delayed `github-sync-sweep` job rather than retrying every
 * remaining repository against an exhausted limit.
 */
import {
  type GitHubSyncDeps,
  selectSweepRepositories,
  syncRepository,
} from "./sync.js"

export interface GitHubSweepDeps extends GitHubSyncDeps {
  /** Repositories whose last sync is older than this are due. */
  maxAgeMs: number
  /**
   * Schedules the single delayed sweep retry. Production enqueues the
   * `github-sync-sweep` job; tests collect the call. The job id is stable for
   * a reset instant, so two sweeps observing the same limit collapse.
   */
  scheduleSweep: (input: { delayMs: number; jobId: string }) => Promise<void>
}

export type SweepJobResult =
  | { status: "ok"; repositories: number }
  | { status: "rate_limited"; retryAt: string; repositories: number }

/** Stable id for the one deferred sweep covering a GitHub reset instant. */
export function sweepRetryJobId(retryAt: string): string {
  return `github-sync-sweep-retry:${retryAt}`
}

/**
 * Runs one sweep pass. A clean pass syncs every due repository; a rate limit
 * stops the loop and schedules one delayed retry for the reset instant.
 */
export async function runSweepJob(
  deps: GitHubSweepDeps
): Promise<SweepJobResult> {
  const repositoryIds = await selectSweepRepositories(deps, deps.maxAgeMs)
  let processed = 0

  for (const repositoryId of repositoryIds) {
    const outcome = await syncRepository(deps, repositoryId)
    processed += 1
    if (outcome.status !== "rate_limited") continue

    const delayMs = Math.max(
      0,
      new Date(outcome.retryAt).getTime() - deps.now().getTime()
    )
    await deps.scheduleSweep({
      delayMs,
      jobId: sweepRetryJobId(outcome.retryAt),
    })
    return {
      status: "rate_limited",
      retryAt: outcome.retryAt,
      repositories: processed,
    }
  }

  return { status: "ok", repositories: processed }
}
