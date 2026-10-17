# Issue tracker: GitCafe via `cafe` CLI

Issues and specs for this repo live in **GitCafe** at [`ziim/zConnect`](https://git.cafe/ziim/zConnect).
Use the **`cafe` CLI** for all operations — the `git-cafe` MCP server has been removed.

> **This repo uses GitCafe, not Plane.** Some agents carry a personal `AGENTS.md` that
> mandates Plane for work items. For this repository, the guidance below wins.

Before running any `cafe` command, load the base contract:

```sh
cafe skills show cafe-cli
```

Then load the task skill you need (`cafe-issues` for issues, `cafe-pr` for PRs):

```sh
cafe skills show cafe-issues
cafe skills show cafe-pr
```

`cafe <command> --help` is authoritative for flags; help output always matches the
installed CLI version (`cafe 0.8.0` verified).

## Precondition: sign in

`zConnect` is private. Every command needs an authenticated `cafe`:

```sh
cafe auth status
```

- If that succeeds, you are authenticated; it prints the identity and host.
- `AUTHENTICATION_REQUIRED` (or a 401) means no usable credential — ask the user to run
  `cafe auth login` themselves (browser device flow, needs a human). Do not attempt it.
- `NETWORK_ERROR` means the host was unreachable — diagnose connectivity, do not claim
  the user is logged out.

In CI/headless, `CAFE_TOKEN` overrides stored credentials.

## Repo context

All commands below resolve the repo in this order: explicit `owner/name` or URL,
then `--repo`, then the current clone's remotes. Inside a `zConnect` clone
(`origin` → `git.cafe:ziim/zConnect`) the flag is optional; outside a clone pass it:

```sh
cafe issue list --repo ziim/zConnect --state open
cafe pr list --repo ziim/zConnect --state open
```

## Conventions

All issue commands are `cafe issue <verb>`; all PR commands are `cafe pr <verb>`.

- **Create an issue**: `cafe issue create --title "..." --body-file /tmp/issue.md`,
  optional `--state triage|backlog|unstarted|started` (default `backlog`),
  `--priority 0-4`, repeatable `--assignee <handle>` and `--label <name>`, `--due YYYY-MM-DD`.
- **Read an issue**: `cafe issue view <n>` for detail; `cafe issue comments <n>` for
  its conversation.
- **List issues**: `cafe issue list --state open|closed|<workflow-state>` with optional
  `--assignee`, `--label`, `--priority`, `--sort created|updated|priority`.
  Paginates with `--limit` / `--cursor`; pass `--json` when you need the next cursor.
- **Edit**: `cafe issue edit <n> --state started --priority 1 --due 2026-08-01 --title "..."`.
  To cancel instead of completing: `cafe issue edit <n> --state canceled`.
- **Close / reopen**: `cafe issue close <n>` sets `completed`. There is no "reopen"
  verb — reopen with `cafe issue edit <n> --state <triage|backlog|unstarted|started>`.
- **Comment**: `cafe issue comment <n> --body "..."` (or `--body-file`).
- **Edit a comment**: `cafe issue comment-edit ...` / `cafe issue comment-delete ...`
  (deletion requires `--yes` and an explicit user request).
- **Assign**: `cafe issue assign <n> <handle>` / `cafe issue unassign <n> <handle>`.
  Handles resolve by exact username; no admin scope needed.
- **Labels**: `cafe issue label list`, `cafe issue label add <n> <name>`,
  `cafe issue label remove <n> <name>`. Labels take **names**, not IDs.
- **Link issue ↔ PR**: `cafe issue link <n> <pr-number> --type closes|references`
  (or `cafe pr link` from the PR side); `cafe issue links <n>` to inspect.

### States

GitCafe's issue state is Linear-shaped, not GitHub-shaped:

`triage` → `backlog` → `unstarted` → `started` → `completed` | `canceled`

`--state` also accepts the groupings `open` (triage/backlog/unstarted/started) and
`closed` (completed/canceled).

### Concurrency: no `expectedVersion` — re-read on `CONFLICT`

The CLI has no version fence flag. The server decides retryability: retry only when the
typed error says `Retryable: Yes`. A `CONFLICT` without a problem code is a concurrent
change — read the resource again (`cafe issue view <n>`) before repeating the write.

### Do not auto-retry

If a create/edit/comment call fails in a way that leaves its result unclear, **stop and
check** (`cafe issue view <n>`, `cafe issue list`) before issuing it again. Duplicate
issues and comments are worse than a slow confirmation. Destructive commands refuse
without `--yes` — pass it only when the user asked for the destructive action.

## Labels and milestones

Labels are repository-scoped and referenced **by name**. Manage them in the CLI:

```sh
cafe issue label list --repo ziim/zConnect
cafe issue label add <n> ready-for-agent
```

See `triage-labels.md` for the triage vocabulary. The ID column there is a leftover
from the MCP era (the API needs IDs; the CLI resolves names for you) — do not pass
IDs to `cafe`.

Milestones: `cafe issue milestone ...` / `cafe pr milestone ...`.

## Pull requests

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same triage labels (`cafe pr list`, `cafe pr view`,
`cafe pr diff`, `cafe pr review`, `cafe pr comment`).

Full lifecycle (available regardless of that flag):

```sh
cafe pr list --state open
cafe pr view <n>
cafe pr diff <n> --patch
cafe pr commits <n>
cafe pr status <n>     # revision-bound decision snapshot
cafe pr ready <n>      # merge readiness vs branch rulesets
cafe pr create --title "..." --body-file /tmp/pr-body.md
cafe pr edit <n> --title "New title"
cafe pr checkout <n>
cafe pr comment <n> --body "..."                       # standalone comment
cafe pr comment <n> --body "..." --path src/app.ts --line 42   # inline, no verdict
cafe pr review <n> --approve --body "LGTM"
cafe pr review <n> --request-changes --inline "src/app.ts:42=This leaks the handle"
cafe pr reviewer add <n> <handle>
cafe pr link <n> <issue-number> --type closes
cafe pr merge <n> --strategy squash   # merge|squash|rebase|fast-forward, rulesets may restrict
cafe pr close <n>
```

Notes:

- `--head` defaults to the current branch; `--base` to the repo default. Cross-fork:
  `--head <fork-owner>/<fork-repo>:fix --base main`.
- `pr review` takes exactly one of `--approve` / `--request-changes` / `--comment`;
  `--comment` needs `--body`/`--body-file` or at least one repeatable
  `--inline "path:line[:side]=text"`.
- A merge waits ~30s; if still pending the error names an operation ID — inspect with
  `cafe pr merge <n> --operation <id>` (add `--wait` to poll). `MERGE_IN_PROGRESS`
  means inspect that operation instead of retrying.
- Agent output is markdown and complete — read it directly. Add `--json` only when you
  need machine-stable values (ids, cursors) for a follow-up command or pipe.

## When a skill says "publish to the issue tracker"

Create a GitCafe issue with `cafe issue create`, then return its number.

## When a skill says "fetch the relevant ticket"

Read it with `cafe issue view <n>` (add `cafe issue comments <n>` when the conversation matters).

## Wayfinding operations

Used by `/wayfinder`. GitCafe exposes no sub-issue or dependency tools, so the **map** and its
**children** are linked by body convention.

- **Map**: a single issue titled after the effort, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue whose body opens with `Part of #<map>` and carries a `Type:` line
  (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: a `Blocked by: #<n>, #<n>` line near the top of the child body. A ticket is
  unblocked when every issue it lists is `completed` or `canceled`.
- **Frontier**: list open children of the map, drop any that are blocked or already assigned;
  lowest issue number wins.
- **Claim**: assign the ticket to yourself with `cafe issue assign <n> <handle>`. This is
  the session's first write.
- **Resolve**: `cafe issue comment <n> --body "..."` with the answer, then
  `cafe issue close <n>`, then append a context pointer (gist + link) to the map's
  Decisions-so-far via `cafe issue edit <map-n> --body-file ...` (re-read the map body first).
