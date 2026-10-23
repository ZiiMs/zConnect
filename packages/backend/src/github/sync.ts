/**
 * Sync runner (#49/#50/#51): fetches open Pull Requests and GitHub Issues for
 * one repository and writes snapshots, then records freshness on the
 * repository and its Connection. Provider failures map to the three lifecycle
 * outcomes the queue and the GitHub View care about: reconnect_required,
 * unavailable, rate_limited.
 *
 * #51 adds three pieces around that core:
 *
 * - Missing-number resolution: a stored open row that GitHub no longer lists
 *   as open is resolved individually (batched) and transitioned, never deleted
 *   merely for disappearing from the open list.
 * - Rename repair: a `not_found` for the stored `owner/name` is re-checked
 *   against the connection's remote repositories by GitHub's immutable id. A
 *   match under a new name is saved and the call retried once.
 * - Sweep selection and 90-day retention, both driven by the injected clock.
 */

import { githubActivityDraft } from "../workspaces/activity.js"
import type { WorkspaceStore } from "../workspaces/store.js"
import { autoLinkRefs } from "./parse.js"
import type {
  GitProvider,
  RemoteGitHubIssue,
  RemotePullRequest,
} from "./provider.js"
import { GitProviderError } from "./provider.js"
import type {
  GitHubConnectionStatus,
  GitHubIssueState,
  GitHubRepository,
  GitHubStore,
  PullRequestState,
} from "./store.js"

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

/** GitHub state resolution accepts at most fifty numbers per request. */
const STATE_RESOLUTION_BATCH = 50
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000

function repoRef(repository: GitHubRepository) {
  return { owner: repository.owner, name: repository.name }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

/** Automatic links and transitions are authored by GitHub, never a user. */
const GITHUB_ACTOR = { type: "github", id: null } as const

type TransitionState = "merged" | "closed" | "open"

/**
 * Overlapping runs for one repository (a manual refresh racing the sweep, or
 * two queued jobs in this process) would otherwise capture the same pre-sync
 * state: both could create a link/event pair or report the same transition.
 * Serialize per repository id so every run starts from what the previous one
 * persisted. Cross-process duplicate links stay protected by the store's
 * `(issue, url)` uniqueness.
 */
const repositorySyncQueues = new Map<string, Promise<void>>()

async function serializeRepositorySync<T>(
  repositoryId: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = repositorySyncQueues.get(repositoryId) ?? Promise.resolve()
  let release: () => void = () => {}
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => current)
  repositorySyncQueues.set(repositoryId, tail)
  await previous
  try {
    return await run()
  } finally {
    release()
    if (repositorySyncQueues.get(repositoryId) === tail) {
      repositorySyncQueues.delete(repositoryId)
    }
  }
}

function transitionDraft(
  kind: "pr" | "issue",
  state: TransitionState,
  number: number
): { type: string; summary: string } {
  if (kind === "pr") {
    if (state === "merged") {
      return {
        type: "github.pull_request.merged",
        summary: `Merged pull request #${number}`,
      }
    }
    if (state === "closed") {
      return {
        type: "github.pull_request.closed",
        summary: `Closed pull request #${number}`,
      }
    }
    return {
      type: "github.pull_request.reopened",
      summary: `Reopened pull request #${number}`,
    }
  }
  if (state === "closed") {
    return {
      type: "github.issue.closed",
      summary: `Closed GitHub issue #${number}`,
    }
  }
  return {
    type: "github.issue.reopened",
    summary: `Reopened GitHub issue #${number}`,
  }
}

/**
 * Refreshes every External Link pointing at the GitHub Item and appends one
 * Activity Event per linked Issue. Called only when a transition was observed
 * against the stored row, so a no-op sync writes nothing.
 */
async function emitTransition(
  deps: GitHubSyncDeps,
  repository: GitHubRepository,
  item: { kind: "pr" | "issue"; number: number; url: string; title: string },
  state: TransitionState
): Promise<void> {
  const links = await deps.github.findExternalLinksByUrl(item.url)
  const draft = transitionDraft(item.kind, state, item.number)
  const payload = {
    kind: item.kind,
    number: item.number,
    url: item.url,
    repository: repository.fullName,
  }
  for (const link of links) {
    await deps.github.updateExternalLink(link.id, {
      title: item.title,
      state,
    })
    await deps.workspaces.appendActivity(link.issueId, {
      actor: GITHUB_ACTOR,
      ...draft,
      payload,
    })
  }
}

/**
 * Links a GitHub Item's `KEY-N` refs to Issues in the Connection's workspace.
 * Unresolved refs and refs that resolve outside the workspace are ignored.
 * An existing link for the same Issue and URL (a retry, overlap, or a manual
 * link) is left untouched, so the Activity Event fires only on a new link.
 * Returns the number of links created.
 */
async function autoLinkItem(
  deps: GitHubSyncDeps,
  input: {
    kind: "pr" | "issue"
    sourceBranch?: string
    title: string
    url: string
    number: number
    connectionWorkspaceId: string
    repository: GitHubRepository
  }
): Promise<number> {
  const refs = autoLinkRefs(input)
  if (refs.length === 0) return 0

  let created = 0
  for (const identifier of refs) {
    const issue = await deps.workspaces.getIssue(identifier)
    if (!issue) continue
    const project = await deps.workspaces.getProject(issue.projectId)
    if (!project || project.workspaceId !== input.connectionWorkspaceId) {
      continue
    }
    const existing = (await deps.github.findExternalLinksByUrl(input.url)).find(
      (link) => link.issueId === issue.id
    )
    if (existing) continue

    await deps.github.createExternalLink(issue.id, {
      provider: "github",
      kind: input.kind,
      url: input.url,
      title: input.title,
      state: "open",
    })
    const draft = githubActivityDraft(
      "linked",
      `Linked automatically from ${identifier}`
    )
    await deps.workspaces.appendActivity(issue.id, {
      actor: GITHUB_ACTOR,
      ...draft,
      payload: {
        kind: input.kind,
        number: input.number,
        url: input.url,
        repository: input.repository.fullName,
        identifier,
      },
    })
    created += 1
  }
  return created
}

/**
 * Maps a provider failure to the lifecycle outcome and records it. A 401
 * pauses the whole workspace; 403/404 keep the snapshot but mark the
 * repository unavailable; a rate limit leaves freshness untouched so the next
 * sweep retries.
 */
async function recordFailure(
  deps: GitHubSyncDeps,
  repositoryId: string,
  workspaceId: string,
  error: unknown,
  at: string
): Promise<SyncOutcome> {
  if (!(error instanceof GitProviderError)) throw error
  switch (error.code) {
    case "unauthorized":
      await deps.github.setConnectionStatus(workspaceId, "reconnect_required")
      return { status: "reconnect_required" }
    case "rate_limited":
      return { status: "rate_limited", retryAt: error.retryAt ?? at }
    case "forbidden":
    case "not_found":
      await deps.github.updateRepository(repositoryId, {
        syncError: error.message,
      })
      return { status: "unavailable", repositoryId }
  }
}

/**
 * Looks the stored repository up by GitHub's immutable id among the
 * connection's remote repositories. Returns the renamed row when GitHub
 * reports a different `owner/name`, or null when there is nothing to repair.
 */
async function repairRenamedRepository(
  deps: GitHubSyncDeps,
  repository: GitHubRepository,
  accessToken: string
): Promise<GitHubRepository | null> {
  let remotes: Awaited<ReturnType<GitProvider["listRepositories"]>>
  try {
    remotes = await deps.provider.listRepositories(accessToken)
  } catch {
    return null
  }
  const remote = remotes.find(
    (candidate) => candidate.githubId === repository.githubId
  )
  if (!remote || remote.fullName === repository.fullName) return null
  return deps.github.updateRepository(repository.id, {
    fullName: remote.fullName,
    owner: remote.owner,
    name: remote.name,
    private: remote.private,
    archived: remote.archived,
    issuesEnabled: remote.issuesEnabled,
    defaultBranch: remote.defaultBranch,
    pushedAt: remote.pushedAt,
  })
}

/**
 * After the upsert, any stored open number missing from the fetched open set
 * is resolved through the provider's state query. Closed/merged rows are
 * retained (retention ages them out); a row reported open stays open.
 */
async function resolveMissingPullRequests(
  deps: GitHubSyncDeps,
  repositoryId: string,
  repository: GitHubRepository,
  accessToken: string,
  fetched: RemotePullRequest[],
  at: string
): Promise<void> {
  const stored = await deps.github.listOpenPullRequests(repositoryId)
  const storedByNumber = new Map(stored.map((item) => [item.number, item]))
  const fetchedNumbers = new Set(fetched.map((item) => item.number))
  const missing = stored
    .filter((item) => !fetchedNumbers.has(item.number))
    .map((item) => item.number)

  for (const batch of chunk(missing, STATE_RESOLUTION_BATCH)) {
    const states = await deps.provider.resolvePullRequestStates(
      accessToken,
      repoRef(repository),
      batch
    )
    for (const number of batch) {
      const state = states.get(number)
      if (!state) continue
      await deps.github.setPullRequestState(
        repositoryId,
        number,
        {
          state: state.state,
          mergedAt: state.mergedAt,
          closedAt: state.closedAt,
          githubUpdatedAt: state.updatedAt,
        },
        at
      )
      const item = storedByNumber.get(number)
      if (!item || state.state === "open") continue
      await emitTransition(
        deps,
        repository,
        {
          kind: "pr",
          number,
          url: item.url,
          title: item.title,
        },
        state.state
      )
    }
  }
}

async function resolveMissingGitHubIssues(
  deps: GitHubSyncDeps,
  repositoryId: string,
  repository: GitHubRepository,
  accessToken: string,
  fetched: RemoteGitHubIssue[],
  at: string
): Promise<void> {
  const stored = await deps.github.listOpenGitHubIssues(repositoryId)
  const storedByNumber = new Map(stored.map((item) => [item.number, item]))
  const fetchedNumbers = new Set(fetched.map((item) => item.number))
  const missing = stored
    .filter((item) => !fetchedNumbers.has(item.number))
    .map((item) => item.number)

  for (const batch of chunk(missing, STATE_RESOLUTION_BATCH)) {
    const states = await deps.provider.resolveIssueStates(
      accessToken,
      repoRef(repository),
      batch
    )
    for (const number of batch) {
      const state = states.get(number)
      if (!state) continue
      await deps.github.setGitHubIssueState(
        repositoryId,
        number,
        {
          state: state.state,
          closedAt: state.closedAt,
          githubUpdatedAt: state.updatedAt,
        },
        at
      )
      const item = storedByNumber.get(number)
      if (!item || state.state !== "closed") continue
      await emitTransition(
        deps,
        repository,
        {
          kind: "issue",
          number,
          url: item.url,
          title: item.title,
        },
        "closed"
      )
    }
  }
}

async function runRepositorySync(
  deps: GitHubSyncDeps,
  repositoryId: string
): Promise<SyncOutcome> {
  const found = await deps.github.getRepository(repositoryId)
  if (!found) return { status: "unavailable", repositoryId }
  let repository: GitHubRepository = found
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

  /**
   * Runs one provider call, repairing a renamed repository once when GitHub
   * answers `not_found` for the stored `owner/name`. Non-404 failures pass
   * straight through to the lifecycle mapping.
   */
  async function callProvider<T>(fetch: () => Promise<T>): Promise<T> {
    try {
      return await fetch()
    } catch (error) {
      if (!(error instanceof GitProviderError) || error.code !== "not_found") {
        throw error
      }
      const repaired = await repairRenamedRepository(
        deps,
        repository,
        accessToken
      )
      if (!repaired) throw error
      repository = repaired
      return await fetch()
    }
  }

  let pullRequests: RemotePullRequest[]
  try {
    pullRequests = await callProvider(() =>
      deps.provider.listOpenPullRequests(accessToken, repoRef(repository))
    )
  } catch (error) {
    return recordFailure(deps, repositoryId, connection.workspaceId, error, at)
  }

  // The upsert forces every fetched row back to `open` and clears its closing
  // fields, so the previous state must be captured first to detect a reopen.
  const previousPullRequests = new Map<number, PullRequestState>()
  for (const item of pullRequests) {
    const previous = await deps.github.getPullRequest(repositoryId, item.number)
    if (previous) previousPullRequests.set(item.number, previous.state)
  }

  let linked = 0
  await deps.github.upsertPullRequests(repositoryId, pullRequests, at)
  for (const item of pullRequests) {
    linked += await autoLinkItem(deps, {
      kind: "pr",
      sourceBranch: item.sourceBranch,
      title: item.title,
      url: item.url,
      number: item.number,
      connectionWorkspaceId: connection.workspaceId,
      repository,
    })
    const previous = previousPullRequests.get(item.number)
    if (previous === "merged" || previous === "closed") {
      await emitTransition(
        deps,
        repository,
        {
          kind: "pr",
          number: item.number,
          url: item.url,
          title: item.title,
        },
        "open"
      )
    }
  }

  try {
    await resolveMissingPullRequests(
      deps,
      repositoryId,
      repository,
      accessToken,
      pullRequests,
      at
    )
  } catch (error) {
    return recordFailure(deps, repositoryId, connection.workspaceId, error, at)
  }

  // Issues disabled on the repository: leave the snapshot untouched; the
  // GitHub View explains why the tab is empty.
  let issues: RemoteGitHubIssue[] = []
  if (repository.issuesEnabled) {
    try {
      issues = await callProvider(() =>
        deps.provider.listOpenIssues(accessToken, repoRef(repository))
      )
    } catch (error) {
      return recordFailure(
        deps,
        repositoryId,
        connection.workspaceId,
        error,
        at
      )
    }

    const previousIssues = new Map<number, GitHubIssueState>()
    for (const item of issues) {
      const previous = await deps.github.getGitHubIssue(
        repositoryId,
        item.number
      )
      if (previous) previousIssues.set(item.number, previous.state)
    }

    await deps.github.upsertGitHubIssues(repositoryId, issues, at)
    for (const item of issues) {
      linked += await autoLinkItem(deps, {
        kind: "issue",
        title: item.title,
        url: item.url,
        number: item.number,
        connectionWorkspaceId: connection.workspaceId,
        repository,
      })
      if (previousIssues.get(item.number) === "closed") {
        await emitTransition(
          deps,
          repository,
          {
            kind: "issue",
            number: item.number,
            url: item.url,
            title: item.title,
          },
          "open"
        )
      }
    }

    try {
      await resolveMissingGitHubIssues(
        deps,
        repositoryId,
        repository,
        accessToken,
        issues,
        at
      )
    } catch (error) {
      return recordFailure(
        deps,
        repositoryId,
        connection.workspaceId,
        error,
        at
      )
    }
  }

  await deps.github.updateRepository(repositoryId, {
    lastSyncedAt: at,
    syncError: null,
  })
  await deps.github.touchConnectionLastSynced(connection.workspaceId, at)
  return {
    status: "ok",
    repositories: 1,
    pullRequests: pullRequests.length,
    issues: issues.length,
    linked,
  }
}

export async function syncRepository(
  deps: GitHubSyncDeps,
  repositoryId: string
): Promise<SyncOutcome> {
  return serializeRepositorySync(repositoryId, () =>
    runRepositorySync(deps, repositoryId)
  )
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

/**
 * Repositories linked to at least one project whose last sync is null or
 * older than `maxAgeMs`, sorted by full name. A workspace whose Connection
 * needs a reconnect is paused, so none of its repositories are selected.
 */
export async function selectSweepRepositories(
  deps: GitHubSyncDeps,
  maxAgeMs: number
): Promise<string[]> {
  const repositories = await deps.github.listLinkedRepositories()
  const cutoff = deps.now().getTime() - maxAgeMs
  const connectionStatuses = new Map<string, GitHubConnectionStatus | null>()
  const due: GitHubRepository[] = []

  for (const repository of repositories) {
    if (
      repository.lastSyncedAt &&
      new Date(repository.lastSyncedAt).getTime() >= cutoff
    ) {
      continue
    }
    let status = connectionStatuses.get(repository.connectionId)
    if (status === undefined) {
      const connection = await deps.github.getConnectionById(
        repository.connectionId
      )
      status = connection?.status ?? null
      connectionStatuses.set(repository.connectionId, status)
    }
    if (status === "reconnect_required") continue
    due.push(repository)
  }

  return due
    .sort((a, b) =>
      a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase())
    )
    .map((repository) => repository.id)
}

/**
 * Deletes merged/closed GitHub Items whose closing instant (or last GitHub
 * update when there is none) is older than ninety days. Open rows never age
 * out.
 */
export async function applyRetention(
  deps: GitHubSyncDeps
): Promise<{ pullRequests: number; issues: number }> {
  const olderThan = new Date(deps.now().getTime() - RETENTION_MS).toISOString()
  const [pullRequests, issues] = await Promise.all([
    deps.github.deleteExpiredPullRequests(olderThan),
    deps.github.deleteExpiredGitHubIssues(olderThan),
  ])
  return { pullRequests, issues }
}
