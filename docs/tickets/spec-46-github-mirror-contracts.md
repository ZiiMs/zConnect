# GitHub mirror — implementation contracts (#46)

Working agreement for the agents implementing GitHub issues #47–#55 under spec #46.
Every implementer reads this file first. It fixes the shared types, route shapes, table
names, and file ownership so parallel work cannot drift. If a detail here is wrong or
impossible, report it to the coordinator instead of silently choosing a different shape.

Vocabulary is `GLOSSARY.md`: **GitHub Connection**, **GitHub View**, **GitHub Item**,
**Pull Request**, **GitHub Issue**, **External Link**. Never introduce synonyms
(no "integration", no "mirror" as a type name, no "remote issue").

Read `docs/adr/0005-github-read-only-mirror.md` first.

## 0. Ticket ownership

| Ticket | Slice | Owned files (create/extend) |
| --- | --- | --- |
| #47 | Schema, token custody, connection, allowlist, settings UI | `db/schema.ts`, `drizzle/00xx_*.sql`, `lib/cipher.ts`, `github/connection-store.ts`, `github/connection-routes.ts`, `github/token-source.ts`, `lib/auth.ts`, frontend `connections-settings.tsx`, `lib/routes.ts` (settings tab) |
| #48 | Project repository links + Repositories settings tab | `github/project-routes.ts`, frontend `repositories-settings.tsx` |
| #49 | `GitProvider` seam, PR sync, PR list API, GitHub View shell | `github/provider.ts`, `github/github-provider.ts`, `github/sync.ts`, `github/snapshot-store.ts`, `github/view-routes.ts`, frontend `github-view.tsx`, `pull-request-rows.tsx`, `lib/github-view.ts` |
| #50 | GitHub Issues sync + tab | extends `github/provider.ts`, `github/github-provider.ts`, `github/sync.ts`, `github/view-routes.ts`, frontend `github-issue-rows.tsx` |
| #51 | Sweep, staleness, throttle, retention, failure lifecycle | extends `github/sync.ts`, `github/view-routes.ts`, `lib/queue.ts`, `worker.ts`, `index.ts` |
| #52 | Link/unlink GitHub Items to Issues | `github/item-routes.ts`, frontend `github-link-dialog.tsx`, extends `external-link-section.tsx` |
| #53 | Create an Issue from a GitHub Item | extends `github/item-routes.ts`, frontend `github-create-dialog.tsx` |
| #54 | Auto-link, transition Activity Events, badge refresh | extends `github/sync.ts`, `github/parse.ts` |
| #55 | Retire `github_install`, webhook repository resolution | `github/handler.ts`, `github/routes.ts`, `github/store.ts`, `db/schema.ts`, migration |

Rules:

- **Schema is owned by #47.** All tables below land there, including `github_connection.lastManualRefreshAt`
  and every snapshot column later tickets read. Later tickets never add tables or columns.
- **Do not rename anything in this file.** If you need a change, ask the coordinator.
- Later tickets may add methods to `github/store.ts` and `github/drizzle-store.ts`. Append at
  the end of the interface / factory; never reorder existing members.
- Keep both stores (`createMemoryGitHubStore`, `createDrizzleGitHubStore`) in lockstep, plus
  the memory store is the test double — contract tests never touch Postgres.

## 1. Schema (`packages/backend/src/db/schema.ts`, migration in `packages/backend/drizzle/`)

Conventions already in the file: `uuid("id").primaryKey().defaultRandom()`, snake_case
columns, `timestamp(..., { withTimezone: true })`, `varchar` with explicit length,
`jsonb().$type<…>()`, indexes declared in the table's second argument.

### `github_connection`

| column | type |
| --- | --- |
| `id` | uuid pk |
| `workspace_id` | uuid, not null, **unique**, FK `workspace.id` cascade |
| `connector_user_id` | text not null (zConnect user id that authorized) |
| `connector_account_id` | text not null (Better Auth account id) |
| `login` | text not null (GitHub login, display only) |
| `scopes` | text[] not null default `[]` |
| `status` | varchar(32) not null default `active` (`active` \| `reconnect_required`) |
| `encrypted_access_token` | text not null |
| `last_synced_at` | timestamptz, null |
| `last_manual_refresh_at` | timestamptz, null |
| `created_at` / `updated_at` | timestamptz not null default now |

### `github_repository`

| column | type |
| --- | --- |
| `id` | uuid pk |
| `connection_id` | uuid not null FK `github_connection.id` cascade |
| `github_id` | text not null (GitHub's immutable database id, stringified) |
| `full_name` | text not null (`owner/name`, mutable) |
| `owner` / `name` | text not null |
| `private` / `archived` / `issues_enabled` | boolean not null, default false/false/true |
| `default_branch` | text null |
| `pushed_at` | timestamptz null |
| `selected_at` | timestamptz not null default now |
| `last_synced_at` | timestamptz null |
| `sync_error` | text null |

Unique `(connection_id, github_id)`; index on `lower(full_name)` is not required —
`findRepositoryByFullName` may compare in JS over the workspace's rows (≤ 50).

### `project_repository`

Join table: `project_id` uuid FK cascade, `repository_id` uuid FK `github_repository.id`
cascade, `linked_by` text not null, `linked_at` timestamptz not null default now.
Composite primary key `(project_id, repository_id)`.

### `github_pull_request`

`id` uuid pk, `repository_id` uuid FK cascade, `number` integer not null, `title` text
not null, `state` varchar(16) not null (`open` \| `merged` \| `closed`), `draft` boolean
not null default false, `author_login` text not null, `author_avatar_url` text null, `url`
text not null, `source_branch` text not null, `target_branch` text not null,
`checks_state` varchar(16) null (`success` \| `failure` \| `pending` \| `expected`),
`review_decision` varchar(32) null (`approved` \| `changes_requested` \| `review_required`),
`comment_count` integer not null default 0, `body_excerpt` text null,
`github_created_at` timestamptz not null, `github_updated_at` timestamptz not null,
`merged_at` timestamptz null, `closed_at` timestamptz null, `synced_at` timestamptz not null.

Unique `(repository_id, number)`; index `(repository_id, state, github_updated_at)`.

### `github_issue`

`id` uuid pk, `repository_id` uuid FK cascade, `number` integer not null, `title` text not
null, `state` varchar(16) not null (`open` \| `closed`), `author_login` text not null,
`author_avatar_url` text null, `url` text not null, `labels` jsonb not null default `[]`
(`{ name, color }[]`), `assignees` jsonb not null default `[]`
(`{ login, avatarUrl }[]`), `comment_count` integer not null default 0, `body_excerpt`
text null, `github_created_at` timestamptz not null, `github_updated_at` timestamptz not
null, `closed_at` timestamptz null, `synced_at` timestamptz not null.

Unique `(repository_id, number)`; index `(repository_id, state, github_updated_at)`.

### `external_link`

No column changes. Kind gains `issue`. Add `index("external_link_url_idx").on(table.url)`
(the unique index already covers `(issue_id, url)`, but reverse lookup is by URL alone).

## 2. Domain types (`packages/backend/src/github/store.ts`)

```ts
export type GitHubConnectionStatus = "active" | "reconnect_required"
export const GITHUB_CONNECTION_STATUSES = ["active", "reconnect_required"] as const

/** Safe view — never carries the token. */
export interface GitHubConnection {
  id: string
  workspaceId: string
  connectorUserId: string
  connectorAccountId: string
  login: string
  scopes: string[]
  status: GitHubConnectionStatus
  lastSyncedAt: string | null
  lastManualRefreshAt: string | null
  createdAt: string
  updatedAt: string
}

/** Store-only shape. Routes must never serialize `encryptedAccessToken`. */
export interface GitHubConnectionSecret extends GitHubConnection {
  encryptedAccessToken: string
}

export const MAX_ALLOWLIST = 50

export interface GitHubRepository {
  id: string
  connectionId: string
  githubId: string
  fullName: string
  owner: string
  name: string
  private: boolean
  archived: boolean
  issuesEnabled: boolean
  defaultBranch: string | null
  pushedAt: string | null
  selectedAt: string
  lastSyncedAt: string | null
  syncError: string | null
}

export interface ProjectRepositoryLink {
  projectId: string
  repositoryId: string
  linkedBy: string
  linkedAt: string
}

export type PullRequestState = "open" | "merged" | "closed"
export type GitHubIssueState = "open" | "closed"

export interface PullRequestSnapshot {
  id: string
  repositoryId: string
  number: number
  title: string
  state: PullRequestState
  draft: boolean
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  sourceBranch: string
  targetBranch: string
  checksState: string | null
  reviewDecision: string | null
  commentCount: number
  bodyExcerpt: string | null
  githubCreatedAt: string
  githubUpdatedAt: string
  mergedAt: string | null
  closedAt: string | null
  syncedAt: string
}

export interface GitHubLabel {
  name: string
  color: string
}

export interface GitHubAssignee {
  login: string
  avatarUrl: string | null
}

export interface GitHubIssueSnapshot {
  id: string
  repositoryId: string
  number: number
  title: string
  state: GitHubIssueState
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  labels: GitHubLabel[]
  assignees: GitHubAssignee[]
  commentCount: number
  bodyExcerpt: string | null
  githubCreatedAt: string
  githubUpdatedAt: string
  closedAt: string | null
  syncedAt: string
}
```

`ExternalLinkKind` becomes `"pr" | "issue" | "branch" | "commit"` (`github/parse.ts`).

### Store additions

Connection/repository methods are added by #47; snapshot methods by #49/#50; sweep and
retention by #51. All take an explicit `at: string` where the result carries a timestamp so
the sync runner can drive a fake clock.

```ts
// #47 — connection custody
getConnection(workspaceId: string): Promise<GitHubConnectionSecret | null>
getConnectionById(connectionId: string): Promise<GitHubConnectionSecret | null>
upsertConnection(input: {
  workspaceId: string
  connectorUserId: string
  connectorAccountId: string
  login: string
  scopes: string[]
  encryptedAccessToken: string
  at: string
}): Promise<GitHubConnectionSecret>
deleteConnection(workspaceId: string): Promise<void>
setConnectionStatus(workspaceId: string, status: GitHubConnectionStatus): Promise<void>
touchConnectionLastSynced(workspaceId: string, at: string): Promise<void>
touchConnectionManualRefresh(workspaceId: string, at: string): Promise<void>

// #47 — repository allowlist
replaceAllowlist(
  connectionId: string,
  repositories: RemoteRepository[],
  at: string
): Promise<{ repositories: GitHubRepository[]; removedRepositoryIds: string[] }>
listAllowlist(connectionId: string): Promise<GitHubRepository[]>
getConnectionRepository(connectionId: string, repositoryId: string): Promise<GitHubRepository | null>
findRepositoryByFullName(connectionId: string, fullName: string): Promise<GitHubRepository | null>
findRepositoryByGithubId(connectionId: string, githubId: string): Promise<GitHubRepository | null>
findRepositoryByRemoteFullName(fullName: string): Promise<{ repository: GitHubRepository; connection: GitHubConnection } | null>
updateRepository(id: string, patch: Partial<Pick<GitHubRepository,
  "fullName" | "owner" | "name" | "private" | "archived" | "issuesEnabled" | "defaultBranch" | "pushedAt" | "lastSyncedAt" | "syncError">>): Promise<GitHubRepository>
getRepository(id: string): Promise<GitHubRepository | null>

// #48 — project links
listProjectRepositories(projectId: string): Promise<GitHubRepository[]>
replaceProjectRepositories(projectId: string, repositoryIds: string[], linkedBy: string, at: string): Promise<GitHubRepository[]>
listRepositoryProjectIds(repositoryId: string): Promise<string[]>
/** Repositories linked to at least one project; the sweep's candidate pool. */
listLinkedRepositories(): Promise<GitHubRepository[]>

// #49/#50 — snapshots
upsertPullRequests(repositoryId: string, items: RemotePullRequest[], at: string): Promise<void>
listPullRequestsForProject(projectId: string, filters: GitHubItemFilters):
  Promise<{ items: PullRequestSnapshot[]; nextCursor: string | null }>
listOpenPullRequests(repositoryId: string): Promise<PullRequestSnapshot[]>
getPullRequest(repositoryId: string, number: number): Promise<PullRequestSnapshot | null>
setPullRequestState(repositoryId: string, number: number,
  patch: { state: PullRequestState; mergedAt: string | null; closedAt: string | null; githubUpdatedAt: string }, at: string): Promise<void>

upsertGitHubIssues(repositoryId: string, items: RemoteGitHubIssue[], at: string): Promise<void>
listGitHubIssuesForProject(projectId: string, filters: GitHubItemFilters):
  Promise<{ items: GitHubIssueSnapshot[]; nextCursor: string | null }>
listOpenGitHubIssues(repositoryId: string): Promise<GitHubIssueSnapshot[]>
getGitHubIssue(repositoryId: string, number: number): Promise<GitHubIssueSnapshot | null>
setGitHubIssueState(repositoryId: string, number: number,
  patch: { state: GitHubIssueState; closedAt: string | null; githubUpdatedAt: string }, at: string): Promise<void>

// #51 — retention
deleteExpiredPullRequests(olderThan: string): Promise<number>
deleteExpiredGitHubIssues(olderThan: string): Promise<number>

// #52 — reverse link lookup / removal
findExternalLinksByUrl(url: string): Promise<ExternalLink[]>
getExternalLink(id: string): Promise<ExternalLink | null>
deleteExternalLink(id: string): Promise<boolean>
listLinkedIssueRefs(
  urls: string[],
  readerId: string,
  canReadProject: ProjectReadGate
): Promise<Record<string, LinkedIssueRef[]>
/** Removes cached items for a repository (allowlist removal / disconnect cascade). */
deleteRepository(repositoryId: string): Promise<void>
```

`listLinkedIssueRefs` is introduced by **#49** (the Pull Request rows need chips); #52 adds
`findExternalLinksByUrl`, `getExternalLink`, `deleteExternalLink`, and the `/issues/N` URL
classification. #49/#50 must also purge their snapshot maps inside the memory store's
`removeRepository`, and extend `deleteConnection`/`replaceAllowlist` cascades through it.

```ts
/** Chip shown on a GitHub Item row. One entry per readable External Link. */
export interface LinkedIssueRef {
  linkId: string
  issueId: string
  identifier: string
  title: string
}

/** Boolean form of `readableProject`, applied per linked Issue's project. */
export type ProjectReadGate = (
  projectId: string,
  readerId: string
) => Promise<boolean>

export interface GitHubItemFilters {
  state: "open" | "merged" | "closed" | "all"
  author?: string | null
  label?: string | null
  query?: string | null
  limit?: number
  cursor?: string | null
}
```

Cursor encoding is the existing collaboration one: base64url of
`${githubUpdatedAt.toISOString()}|${id}`, meaning "strictly older than". Default limit 30,
max 100. Order: `github_updated_at DESC, id DESC`. Text query matches title
case-insensitively (`ILIKE %q%` in Drizzle, `includes` lowercased in memory).

`listLinkedIssueRefs` returns only `kind = "pr" | "issue"` links, newest link first,
and only when the link's target Issue passes `readableProject` for the requesting reader
(`projectReadGate`); one gate answer is cached per project. The list routes and the item
link response therefore pass the session user's id, and a chip for an Issue in a project
or workspace the reader cannot read is omitted.

## 3. Cipher (`packages/backend/src/lib/cipher.ts`) — #47

```ts
export interface IntegrationCipher {
  /** Versioned payload, safe to store. */
  encrypt(plain: string): string
  /** Throws `Error("cipher: …")` on tamper, wrong key, or unknown version. */
  decrypt(payload: string): string
}

/** `key` is the raw 32-byte base64 value of INTEGRATION_ENCRYPTION_KEY. */
export function createIntegrationCipher(key: string): IntegrationCipher
```

Format: `v1.<base64url(iv)>.<base64url(ciphertext)>.<base64url(tag)>`, AES-256-GCM,
12-byte random IV. The shipped implementation uses `node:crypto` synchronously
(`createCipheriv`/`createDecipheriv`) with the same versioned payload; `crypto.subtle` is not
required. Invalid key length throws at construction. `INTEGRATION_ENCRYPTION_KEY` unset
means the connection feature is unavailable: `POST` connection returns
`503 { error: "GitHub connection is not configured" }` rather than throwing at import.

## 4. Provider seam (`packages/backend/src/github/provider.ts`) — #49

```ts
export interface RemoteRepository {
  githubId: string
  fullName: string
  owner: string
  name: string
  private: boolean
  archived: boolean
  issuesEnabled: boolean
  defaultBranch: string | null
  pushedAt: string | null
}

export interface RemotePullRequest {
  number: number
  title: string
  draft: boolean
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  sourceBranch: string
  targetBranch: string
  checksState: string | null
  reviewDecision: string | null
  commentCount: number
  bodyExcerpt: string | null
  createdAt: string
  updatedAt: string
  /** Closed/merged items only appear in state resolution, never the open list. */
}

export interface RemoteGitHubIssue {
  number: number
  title: string
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  labels: GitHubLabel[]
  assignees: GitHubAssignee[]
  commentCount: number
  bodyExcerpt: string | null
  createdAt: string
  updatedAt: string
}

export interface RepoRef {
  owner: string
  name: string
}

export type ProviderErrorCode = "unauthorized" | "forbidden" | "not_found" | "rate_limited"

export class GitProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    /** ISO instant from GitHub's reset header, for `rate_limited`. */
    readonly retryAt?: string
  )
}

export interface GitProvider {
  listRepositories(accessToken: string, query?: string): Promise<RemoteRepository[]>
  listOpenPullRequests(accessToken: string, repo: RepoRef): Promise<RemotePullRequest[]>
  listOpenIssues(accessToken: string, repo: RepoRef): Promise<RemoteGitHubIssue[]>
  resolvePullRequestStates(accessToken: string, repo: RepoRef, numbers: number[]):
    Promise<Map<number, { state: PullRequestState; mergedAt: string | null; closedAt: string | null; updatedAt: string }>>
  resolveIssueStates(accessToken: string, repo: RepoRef, numbers: number[]):
    Promise<Map<number, { state: GitHubIssueState; closedAt: string | null; updatedAt: string }>>
}
```

- `bodyExcerpt`: first 400 characters of the body, whitespace collapsed, trimmed; `null`
  when the body is empty. The adapter computes it; the sync engine never fetches bodies.
- `resolve*States` treats "not found" as closed. Batch ≤ 50 numbers per request.
- `GitProvider extends GitHubRemote` (the interface #47 created in
  `github/connection-routes.ts`): `listRepositories(accessToken, query?)` and
  `getViewerLogin(accessToken)`. `RemoteRepository` stays defined in `github/store.ts` and is
  imported here. The real adapter is ONE object satisfying both, so `index.ts` passes it as
  the connection app's `remote` and the sync/view apps' `provider`. #47's
  `github/repository-source.ts` is folded into `github/github-provider.ts` (keep the REST
  repository listing logic, delete the duplicate module).
- The GitHub adapter is `createGitHubProvider(fetchImpl?)`: GraphQL for open PRs/issues,
  REST for repository listing (pagination), GraphQL aliases for state resolution. It is
  never imported by tests without an injected fetch stub; the mapping tests stub `fetch`
  and perform no I/O. The fake lives in `github/fake-provider.ts`:

```ts
export interface FakeProvider extends GitProvider {
  repositories: RemoteRepository[]
  pullRequests: Record<string, RemotePullRequest[]>   // "owner/name"
  issues: Record<string, RemoteGitHubIssue[]>
  closedPullRequests: Record<string, Array<{ number: number; state: "merged" | "closed"; at: string }>>
  closedIssues: Record<string, Array<{ number: number; at: string }>>
  /** Thrown by the next call for a repo, keyed "owner/name". */
  failNext: Map<string, GitProviderError>
  calls: string[]
}
```

`failNext` is consumed per repo. Use it for 401/403/404/rate-limit tests.

## 5. Sync engine (`packages/backend/src/github/sync.ts`) — #49 seeds, #50/#51/#54 extend

Ticket split inside the engine: **#49** ships provider + open Pull Request upsert + `lastSyncedAt`
+ provider error mapping (401/403/404). **#50** adds GitHub Issue upsert. **#51** adds
missing-number state resolution, the 15-minute sweep, retention, rename repair, refresh
throttling, and the status route. **#54** adds auto-link and transition Activity Events.


```ts
export interface GitHubSyncDeps {
  github: GitHubStore
  workspaces: WorkspaceStore
  provider: GitProvider
  decrypt: (payload: string) => string
  /** Injected clock; every timestamp written by sync derives from this. */
  now: () => Date
}

export type SyncOutcome =
  | { status: "ok"; repositories: number; pullRequests: number; issues: number; linked: number }
  | { status: "rate_limited"; retryAt: string }
  | { status: "reconnect_required" }
  | { status: "unavailable"; repositoryId: string }

export async function syncRepository(deps: GitHubSyncDeps, repositoryId: string): Promise<SyncOutcome>
export async function syncConnection(deps: GitHubSyncDeps, connectionId: string): Promise<SyncOutcome>
/** Repositories linked to at least one project whose last sync is older than `maxAgeMs`. */
export async function selectSweepRepositories(deps: GitHubSyncDeps, maxAgeMs: number): Promise<string[]>
/** Deletes merged/closed items closed before `now - 90 days`. */
export async function applyRetention(deps: GitHubSyncDeps): Promise<{ pullRequests: number; issues: number }>
```

- `syncRepository` returns early with `unavailable` when the repository is gone, and with
  `reconnect_required` when the connection status is already `reconnect_required`.
- A 401 sets the connection `reconnect_required` and stops the workspace (`SyncOutcome`
  `reconnect_required`); the repository keeps its snapshot.
- 403/404 writes `syncError` on the repository, keeps the snapshot, returns `unavailable`.
- `rate_limited` returns `retryAt` without touching `lastSyncedAt`.
- Success clears `syncError`, sets `lastSyncedAt` on the repository, and
  `touchConnectionLastSynced`.
- Rename repair: after listing, match the remote `githubId`; when `fullName` drifted,
  update `fullName`/`owner`/`name`/`private`/`archived`/`issuesEnabled` before syncing.
- Missing open rows: diff stored open numbers against the fetched open set, resolve the
  missing numbers in batches, then `setPullRequestState` / `setGitHubIssueState`.
- Reappearance: an upsert sets `state = "open"` and clears `closedAt`/`mergedAt`.
- Idempotency: only state transitions observed against the stored row emit Activity Events
  or create links; unique constraints and URL dedupe protect retries.
- #54 adds `autoLink` after each upsert (exported pure helper for tests):

```ts
/** KEY-N refs from a PR's source branch + title, or a GitHub Issue's title. */
export function autoLinkRefs(input: { kind: "pr" | "issue"; sourceBranch?: string; title: string }): string[]
```

- #54 transition events, appended through `workspaces.appendActivity` with actor
  `{ type: "github", id: null }`:
  - `types`: `github.pull_request.merged`, `github.pull_request.closed`,
    `github.issue.closed`, `github.issue.reopened`, `github.pull_request.reopened`,
    `github.linked`.
  - summary: `Merged pull request #12`, `Closed pull request #12`,
    `Closed GitHub issue #7`, `Reopened pull request #12`, `Linked automatically from WEB-123`.
  - payload: `{ kind: "pr" | "issue", number, url, repository: "owner/name", identifier? }`.
  - Each transition updates every matching External Link's `title`/`state`
    (`merged`/`closed`/`open`) via `findExternalLinksByUrl(item.url)`.

## 6. HTTP contracts

All new routes live on the existing Hono app, mounted from `index.ts`. Every response is
JSON. Auth: no session → `401`. Permission miss → `403`. Missing row → `404`. Validation →
`400`. The access token never appears in any response or log.

**Project path parameter.** Spec #46 writes `/api/projects/:key/...`, but every existing
`/api/projects/...` route takes the project **row id** and `getProject` resolves ids only
(only `/api/issues/:key` accepts a human identifier). The new routes therefore use
`/api/projects/:id/...` with the project row id; the browser URL keeps `{PROJECTKEY}`. This
is a deliberate, documented deviation from the spec's literal path spelling.

Permission helpers (existing, `workspaces/permissions.ts`): `readableProject` (member or
Viewer grant), `writableProject` (member+), `manageableProject` (Owner/Admin). Workspace
admin check = `getMembership().role !== "Member"`.

### #47 Connection (`github/connection-routes.ts`)

```
GET    /api/workspaces/:id/github-connection           any member
POST   /api/workspaces/:id/github-connection           Owner/Admin
DELETE /api/workspaces/:id/github-connection           Owner/Admin
GET    /api/workspaces/:id/github-connection/repositories?query=   Owner/Admin
PUT    /api/workspaces/:id/github-connection/repositories          Owner/Admin
```

- `GET` → `{ connection: GitHubConnectionView | null, repositories: GitHubRepositoryView[] }`.
  `GitHubConnectionView` = connection minus `encryptedAccessToken`, plus
  `connectorName: string | null` (from `listMembers`) and `repositoryCount: number`.
  `GitHubRepositoryView` = repository minus nothing, plus `unavailable: boolean`
  (`syncError !== null`). Works for a Viewer? No: connection read needs membership, not a
  Viewer grant (`403`).
- `POST` body `{}` (empty object tolerated). Reads the linked GitHub account for the
  session user through the injected `GitHubAccountSource`. No linked account →
  `400 { error: "GitHub account not linked" }`. Upserts by workspace (reconnect replaces
  token/login, status back to `active`, keeps the allowlist) → `201 { connection,
  repositories }`.
- `DELETE` → `200 { disconnected: true }`. Cascade deletes repositories, project links,
  snapshots. External Links survive untouched.
- `GET .../repositories` → `{ items: Array<RemoteRepository & { selected: boolean }> }`,
  capped at the provider's listing, filtered by `query` (case-insensitive substring on
  `fullName`, server-side filter is fine).
- `PUT .../repositories` body `{ githubIds: string[] }` (GitHub immutable ids, ≤ 50,
  dedupe). Re-lists repositories from the provider, keeps the selected ones, upserts them,
  deletes the ones dropped (and their project links + snapshots), returns
  `{ repositories: GitHubRepositoryView[], removed: number }`. Unknown id → `400`.
  Saving the same set is idempotent (`selectedAt` unchanged).
- Provider failures on both repository endpoints share one mapping: a `GitProviderError`
  with `code: "unauthorized"` sets the Connection `reconnect_required` and answers
  `409 { error: "GitHub connection needs to be reconnected", status: "reconnect_required" }`;
  other provider codes keep the existing
  `502 { error: "GitHub repositories are unavailable" }`. The settings picker surfaces the
  409 as the reconnect state and reuses the pane's Reconnect action.

`GitHubAccountSource` (`github/token-source.ts`):

```ts
export interface GitHubAccountSource {
  /** The GitHub account linked to this zConnect user, with a usable token. */
  getLinkedAccount(userId: string): Promise<{
    accountId: string
    accessToken: string
    scopes: string[]
  } | null>
}
```

Production: `createBetterAuthGitHubAccountSource({ getSession })` using
`auth.api.getAccessToken({ body: { providerId: "github", userId } })` (falling back to
`auth.api.listUserAccounts` for the account id) — check `node_modules/better-auth` types or
the Better Auth docs before coding. Tests inject `{ getLinkedAccount: async () => ({...}) }`.

Auth config gains `github` in `socialProviders` (env `GITHUB_CLIENT_ID` /
`GITHUB_CLIENT_SECRET`) and `accountLinking: { allowDifferentEmails: true }`. Requested
scope `repo` is asked for by the frontend `linkSocial` call.

### #48 Project repositories (`github/project-routes.ts`)

```
GET /api/projects/:id/repositories   project read (member or Viewer)
PUT /api/projects/:id/repositories   Owner/Admin of the project's workspace
```

`GET` →
`{ items: ProjectRepositoryView[], connection: { status, login } | null }` where
`ProjectRepositoryView` = repository + `unavailable` + `linkedAt` + `linkedBy`.
`PUT` body `{ repositoryIds: string[] }` (local ids, must belong to the workspace's
allowlist; unknown/foreign id → `400`), replaces the set, returns the same shape as `GET`.

### #49/#50/#51 GitHub View (`github/view-routes.ts`)

```
GET  /api/projects/:id/github/pull-requests?state=&author=&q=&cursor=&limit=
GET  /api/projects/:id/github/issues?state=&author=&label=&q=&cursor=&limit=
POST /api/projects/:id/github/refresh
GET  /api/projects/:id/github/status
```

All project read. Default `state=open`. Invalid `state` → `400`.

List envelope (identical for both tabs):

```ts
{
  items: GitHubItemRow[]
  nextCursor: string | null
  lastSyncedAt: string | null          // newest repository lastSyncedAt in the project
  connection: { status: GitHubConnectionStatus; login: string } | null
  repositories: Array<{
    id: string
    fullName: string
    issuesEnabled: boolean
    unavailable: boolean
    lastSyncedAt: string | null        // this repository's own sync instant
  }>
  filters: { authors: string[]; labels: Array<{ name: string; color: string }> }
}
```

`repositories[].lastSyncedAt` is per repository (`null` when it never synced), so one fresh
repository cannot hide an older sibling; the top-level `lastSyncedAt` stays the newest across
the project. The backend names the facet shape `GitHubViewFacets` (author and label options);
it is distinct from the frontend's `GitHubViewFilters` (§8), the applied
state/author/label/q filter set.

`PullRequestRow` = `PullRequestSnapshot` + `repository: string` (fullName) +
`linkedIssues: LinkedIssueRef[]`. `GitHubIssueRow` = `GitHubIssueSnapshot` +
`repository: string` + `linkedIssues: LinkedIssueRef[]`. `filters.authors` is every
distinct author login across the project's snapshot for that kind (regardless of the
current filter); `filters.labels` is the same for issue labels, sorted by name.

`POST /github/refresh`:

- Project read. Enqueues a sync for every linked repository older than five minutes
  (`lastSyncedAt` null counts as stale) through the injected `enqueueSync(repositoryId)`.
- Body `{ automatic?: boolean }`; an empty body is tolerated and means manual. When
  `automatic` is true (the view-opening path), enqueue the stale repositories, do **not**
  check or stamp `lastManualRefreshAt`, and return `202`. Manual (the default, used by the
  Refresh button) keeps the throttle and stamps.
- Throttled per **workspace** to once per 60 seconds using
  `github_connection.lastManualRefreshAt`; inside the window →
  `429 { error: "Refresh throttled", retryAfter }`.
- Otherwise `202 { accepted: true, enqueued: number, lastSyncedAt }`.
- A workspace with no connection → `409 { error: "GitHub is not connected" }`.
- #49 ships a naive version (always enqueue, no throttle); #51 adds staleness + throttle +
  status.
- Rate limits are deferred, not retried across every repository: the sweep stops at the
  first `rate_limited` outcome and schedules one delayed `github-sync-sweep` job with
  `delay = max(0, retryAt - now)` under a stable job id (no duplicate when one is already
  scheduled). The manual per-repository `github-sync` job may complete; the delayed sweep
  is the retry. `lastSyncedAt` is untouched by the limit.

`GET /github/status` (#51) → `{ connection, repositories, lastSyncedAt }` — same shapes as
the list envelope's non-item fields, so the settings/inline banner can poll cheaply.

### #52/#53 Items (`github/item-routes.ts`)

```
POST   /api/projects/:id/github/items/link          project write (+ target project write)
POST   /api/projects/:id/github/items/create-issue  project write
DELETE /api/issues/:key/external-links/:id           issue write
```

- `link` body `{ kind: "pr" | "issue", repositoryId: string, number: number, issue:
  string }` (target Issue identifier, e.g. `WEB-123`).
  - GitHub item must exist in the project's linked repositories → `404`.
  - Target issue resolves by identifier; `writableProject` on the target's project →
    `403` when it differs and the caller cannot write there.
  - Creates an External Link of kind `pr`/`issue` with `url` = snapshot url, `title` =
    snapshot title, `state` = snapshot state; dedupe by `(issueId, url)` → `200` with the
    existing link.
  - Appends `github.linked` Activity Event on the target Issue.
  - → `201 { link: ExternalLink, issue: { id, identifier, title }, linkedIssues: LinkedIssueRef[] }`.
- `create-issue` body `{ kind, repositoryId, number, title?, description? }`:
  - `title`/`description` are the create dialog's edited values. When present they
    override the snapshot-derived values; both are trimmed, `title` must be 1–200
    characters, `description` at most 20,000 (empty allowed). When absent, title =
    snapshot title and body = `"${url}\n\n${bodyExcerpt ?? ""}"` (no trailing blank
    line when the excerpt is empty).
  - Creates an Issue via `workspaces.createIssue(projectId, { title, description,
    statusId: <project default status> }, { type: "user", id: userId })`, falling back
    to the project's first status when none is flagged default.
  - The External Link still uses the snapshot `url`/`title`/`state`; append
    `github.linked` once.
  - → `201 Issue`.
- `DELETE /api/issues/:key/external-links/:id` → `200 { deleted: true }`; link must belong
  to that issue (`404`), issue write required (`403`). Idempotent `200` when already gone.
- `POST /api/issues/:key/external-links` (existing) now accepts `/issues/N` URLs as kind
  `issue`.

## 7. Queues and worker (#49 seeds, #51 completes)

`lib/queue.ts` adds `githubSync: "github-sync"` with `defaultJobOptions`:
`{ attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 50,
removeOnFail: 100 }`.

- Producers add `{ repositoryId }` with `deduplication: { id: repositoryId }` so duplicates
  collapse only while a job for that repository is waiting or active. BullMQ deletes the
  deduplication key when the job completes or fails, so a later refresh enqueues a fresh
  sync; a retained `jobId` would swallow those additions until the 50/100 retention evicted
  the old job.
- The API receives `enqueueSync: (repositoryId: string) => Promise<void>` as a dependency of
  the view routes; `index.ts` wires the BullMQ producer. Tests pass a collector or an
  inline `(id) => syncConnection(...)` adapter.
- `worker.ts` adds an `github-sync` worker (concurrency 3) calling `syncRepository`.
- #51 adds a repeatable scheduler every 15 minutes (`upsertJobScheduler
  "github-sync-sweep"`) and a daily retention job (`upsertJobScheduler "github-retention"`)
  that compute the candidate repository ids and call `syncRepository`/`applyRetention`
  directly in the worker (no extra queue hop for retention).
- Worker test files call the exported functions directly; nothing in tests starts BullMQ.

## 8. Frontend

### Routes (`lib/routes.ts`, `App.tsx`)

- `AppPath` gains:
  ```ts
  projectView: "issues" | "github"
  githubTab: "pull-requests" | "issues"
  ```
  and `SettingsTab` gains `"connections" | "repositories"`.
- `buildGitHubPath(workspaceName, projectKey, tab?)`:
  `/{ws}/{KEY}/github` for pull requests, `/{ws}/{KEY}/github/issues` for the Issues tab.
- `parseAppPath` for a project-key second segment: `segments[2]?.toLowerCase() === "github"`
  → `projectView: "github"`, `githubTab: segments[3]?.toLowerCase() === "issues" ? "issues" : "pull-requests"`.
  Without it, `projectView: "issues"`.
- Filters live in the query string: `state`, `author`, `label`, `q`, `cursor`. Add
  `lib/github-view.ts` with pure helpers:
  ```ts
  export interface GitHubViewFilters { state: string; author: string; label: string; q: string }
  export function parseGitHubFilters(search: string): GitHubViewFilters
  export function buildGitHubSearch(filters: Partial<GitHubViewFilters>): string
  ```
  Defaults: `state=open`, others empty; empty values are omitted from the URL.

### API client (`lib/api.ts`)

Add typed methods, following the existing `request` helper and `ApiError`:

```ts
getGitHubConnection(workspaceId): Promise<GitHubConnectionResponse>
connectGitHubConnection(workspaceId): Promise<GitHubConnectionResponse>
disconnectGitHubConnection(workspaceId): Promise<void>
searchGitHubRepositories(workspaceId, query): Promise<{ items: RemoteRepositoryOption[] }>
setGitHubAllowlist(workspaceId, githubIds): Promise<...>
getProjectRepositories(projectId): Promise<ProjectRepositoriesResponse>
setProjectRepositories(projectId, repositoryIds): Promise<ProjectRepositoriesResponse>
listPullRequests(projectId, filters): Promise<GitHubListResponse<PullRequestRow>>
listGitHubIssues(projectId, filters): Promise<GitHubListResponse<GitHubIssueRow>>
refreshGitHub(projectId): Promise<{ accepted: boolean; enqueued: number }>
linkGitHubItem(projectId, input): Promise<{ link: ExternalLink; issue: ... }>
createIssueFromGitHubItem(projectId, input): Promise<Issue>
deleteExternalLink(issueKey, linkId): Promise<void>
```

### Surfaces

- **Settings registration** (four places): `SettingsTab`/`SETTINGS_TABS`/
  `parseSettingsTab` in `lib/routes.ts`, `SETTINGS_CATEGORIES` in
  `components/workspace-settings.tsx`, and the `WorkspaceSettings` panel switch. #47 adds the
  `connections` page and nav item; #48 adds the `repositories` page and nav item.
- **App shell**: `App.tsx` canonicalizes unknown paths. Every new section needs its branch
  there (settings tabs flow through `buildSettingsPath`; the project GitHub view needs its
  own canonical path). `App.test.tsx` mocks `lib/api` with a **whitelist** of methods — any
  new `api.*` call rendered by the shell must be added to that mock or jsdom will hit real
  `fetch`. Add the GitHub View's calls to the mock.
- **Project nav** (#49): a tab row in `project-issues.tsx` near `IssueFilterPresetTabs`
  with `Issues` and `GitHub`. `Issues` is `/{ws}/{KEY}` (the existing List/Table/Kanban
  views); `GitHub` is `/{ws}/{KEY}/github` and renders the GitHub View. The GitHub entry is
  a peer of the issue views, not a fourth view inside their switcher.
- **GitHub View** (#49/#50): header shows "Updated <relative>" + Refresh button (project
  read), filters bar, table, empty states (`no connection`, `no repositories linked`, `no
  open pull requests`/`no open GitHub issues`, `issues disabled`, `repository unavailable`,
  `reconnect required` banner: admin sees Reconnect, non-admin sees "ask an admin"),
  stale chip when `lastSyncedAt` is older than five minutes.
- **Pull Request row** (#49): state icon, draft chip, `#number`, title, repository when
  more than one repository is linked, author, `source → target`, checks badge, review
  badge, comment count, linked Issue chips, relative update time. Click opens `url` in a
  new tab (`target="_blank" rel="noreferrer"`).
- **GitHub Issue row** (#50): state icon, `#number`, title, repository when >1, author,
  labels with colors, assignees, comment count, linked chips, relative time.
- **Row actions** (#52/#53): a trailing menu with Link to Issue / Create Issue / Open on
  GitHub, hidden for Viewers (project write check) — decided from the same role list the
  issue views already load.
- **Link dialog** (#52): searches the project's Issues by identifier or title (uses the
  existing issue list query), submits `linkGitHubItem`, refreshes the row chips.
- **Create dialog** (#53): prefilled editable title + body, submits, navigates to the new
  Issue (`buildIssuePath`).
- **Settings → Connections → GitHub** (#47): connect/reconnect button
  (`authClient.linkSocial({ provider: "github", scopes: ["repo"], callbackURL })`), status,
  connector login/name, last sync, allowlist picker (search + checkboxes, private/archived
  markers, 50 cap), disconnect confirmation naming what is dropped (cached GitHub Items,
  repository links) and what survives (External Links on Issues). Owner/Admin only; members
  see status read-only. `?linked=1` in the URL triggers the finalize POST once.
- **Settings → Repositories** (#48): project selector (same pattern as Workflow/Labels),
  allowlisted repositories with checkboxes/row toggles, linked rows show sync state and an
  Unavailable marker, empty state points to Settings → Connections → GitHub. Read-only for
  members; Owner/Admin can save.

## 9. Testing seams

Three seams, matching the spec:

1. **HTTP contract** (`github/*.test.ts`): `new Hono()`, mount
   `createWorkspacesApp({ store, getSession })` plus the new app factory, memory stores,
   fake provider, `enqueueSync` collector or inline. Assert status + JSON, never SQL.
2. **Sync runner** (`github/sync.test.ts`): call `syncRepository`/`selectSweepRepositories`/
   `applyRetention` with `now: () => new Date(fixed)`.
3. **Frontend App** (`App.test.tsx`, plus component tests): mock only `lib/api.ts`
   (`vi.mock`), keep `lib/routes.ts` and hooks real, navigate by pushing `window.history`
   and asserting rendered rows/tabs/filters.

Also required pure-unit tests: `parseExternalUrl` issue classification, `extractIssueRefs`,
cursor encode/decode round-trip, cipher round-trip/tamper, `parseGitHubFilters` /
`buildGitHubSearch`, `autoLinkRefs`.

No test performs network I/O. No `vi.mock` of stores. No Playwright additions.

## 10. Definition of done per ticket

- `bun run --cwd packages/backend test` and `bun test` (frontend: `bun run --cwd
  packages/frontend test`) pass; `bun run --cwd packages/backend typecheck` and
  `bun run --cwd packages/frontend typecheck` pass; `bunx biome check` reports no new
  errors in touched files.
- Ticket acceptance criteria covered by named tests.
- Docs touched when behavior is operator-visible (`packages/backend/.env.example`,
  `packages/backend/README.md`, `GLOSSARY.md` only if a term is missing).
- Commit messages: conventional, referencing the ticket (`feat(github): … (#47)`).
