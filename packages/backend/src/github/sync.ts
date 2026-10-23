/**
 * Sync runner (#49): fetches open Pull Requests for one repository and writes
 * snapshots, then records freshness on the repository and its Connection.
 * Provider failures map to the three lifecycle outcomes the queue and the
 * GitHub View care about: reconnect_required, unavailable, rate_limited.
 *
 * Missing-number resolution, the sweep, retention, rename repair and refresh
 * throttling arrive with #51; Issue sync with #50.
 */

import type { WorkspaceStore } from "../workspaces/store.js"
import type { GitProvider, RemotePullRequest } from "./provider.js"
import { GitProviderError } from "./provider.js"
import type { GitHubStore } from "./store.js"

export interface GitHubSyncDeps {
  github: GitHubStore
  workspaces: WorkspaceStore
  provider: GitProvider
  decrypt: (payload: string) => string
  /** Injected clock; every timestamp written by sync derives from this. */
  now: () => Date
}

export type SyncOutcome =
  | {
      status: "ok"
      repositories: number
      pullRequests: number
      issues: number
      linked: number
    }
  | { status: "rate_limited"; retryAt: string }
  | { status: "reconnect_required" }
  | { status: "unavailable"; repositoryId: string }

export async function syncRepository(
  deps: GitHubSyncDeps,
  repositoryId: string
): Promise<SyncOutcome> {
  const repository = await deps.github.getRepository(repositoryId)
  if (!repository) return { status: "unavailable", repositoryId }
  const connection = await deps.github.getConnectionById(
    repository.connectionId
  )
  if (!connection) return { status: "unavailable", repositoryId }
  if (connection.status === "reconnect_required") {
    return { status: "reconnect_required" }
  }

  let accessToken: string
  try {
    accessToken = deps.decrypt(connection.encryptedAccessToken)
  } catch {
    // An unreadable payload is unrecoverable without a reconnect.
    await deps.github.setConnectionStatus(
      connection.workspaceId,
      "reconnect_required"
    )
    return { status: "reconnect_required" }
  }

  const at = deps.now().toISOString()
  let pullRequests: RemotePullRequest[]
  try {
    pullRequests = await deps.provider.listOpenPullRequests(accessToken, {
      owner: repository.owner,
      name: repository.name,
    })
  } catch (error) {
    if (!(error instanceof GitProviderError)) throw error
    switch (error.code) {
      case "unauthorized":
        await deps.github.setConnectionStatus(
          connection.workspaceId,
          "reconnect_required"
        )
        return { status: "reconnect_required" }
      case "rate_limited":
        return {
          status: "rate_limited",
          retryAt: error.retryAt ?? at,
        }
      case "forbidden":
      case "not_found":
        await deps.github.updateRepository(repositoryId, {
          syncError: error.message,
        })
        return { status: "unavailable", repositoryId }
    }
  }

  await deps.github.upsertPullRequests(repositoryId, pullRequests, at)
  await deps.github.updateRepository(repositoryId, {
    lastSyncedAt: at,
    syncError: null,
  })
  await deps.github.touchConnectionLastSynced(connection.workspaceId, at)
  return {
    status: "ok",
    repositories: 1,
    pullRequests: pullRequests.length,
    issues: 0,
    linked: 0,
  }
}

export async function syncConnection(
  deps: GitHubSyncDeps,
  connectionId: string
): Promise<SyncOutcome> {
  const repositories = await deps.github.listAllowlist(connectionId)
  let synced = 0
  let pullRequests = 0
  let issues = 0
  let linked = 0
  let lastUnavailable: string | null = null

  for (const repository of repositories) {
    const outcome = await syncRepository(deps, repository.id)
    switch (outcome.status) {
      case "ok":
        synced += 1
        pullRequests += outcome.pullRequests
        issues += outcome.issues
        linked += outcome.linked
        break
      case "reconnect_required":
        return outcome
      case "rate_limited":
        return outcome
      case "unavailable":
        lastUnavailable = outcome.repositoryId
        break
    }
  }

  if (synced === 0 && lastUnavailable) {
    return { status: "unavailable", repositoryId: lastUnavailable }
  }
  return { status: "ok", repositories: synced, pullRequests, issues, linked }
}
