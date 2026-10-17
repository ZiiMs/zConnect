# Issue tracker: GitHub via `gh` CLI

Issues and specs for this repo live in **GitHub** at [`ZiiMs/zConnect`](https://github.com/ZiiMs/zConnect).
Drive them with the **`gh` CLI**. Agents that have the
GitHub MCP server configured may use those tools instead; the vocabulary below is the CLI.

> **This repo uses GitHub, not Plane.** Some agents carry a personal `AGENTS.md` that
> mandates Plane for work items. For this repository, the guidance below wins.

`gh <command> --help` is authoritative for flags; help output always matches the installed
CLI version (`gh 2.102.0` verified).

## Precondition: sign in

`zConnect` is private. Every command needs an authenticated `gh`:

```sh
gh auth status
```

- If that succeeds, you are authenticated; it prints the account, protocol, and scopes.
  Issue work needs `repo` (that scope also covers private-repo issues and PRs).
- A 401 / `authentication required` means no usable credential — ask the user to run
  `gh auth login` themselves. Do not attempt it.
- A network failure means the host was unreachable — diagnose connectivity, do not claim
  the user is logged out.

In CI/headless, `GH_TOKEN` overrides stored credentials.

## Repo context

`gh` resolves the repository from the current clone's remotes (`origin` →
`ZiiMs/zConnect`), so `--repo` is optional inside the clone. Outside a clone, pass it:

```sh
gh issue list --repo ZiiMs/zConnect --state open
gh pr list --repo ZiiMs/zConnect --state open
```

## Conventions

All issue commands are `gh issue <verb>`; all PR commands are `gh pr <verb>`.

- **Create an issue**: `gh issue create --title "..." --body-file body.md`, optional
  `--label <name>`, repeatable `--assignee <login>` (or `@me`), `--milestone <title>`,
  `--template <name>`, `--attach <file>`. The command prints the new issue URL.
- **Read an issue**: `gh issue view <n>` for detail; add `--comments` for its conversation.
- **List issues**: `gh issue list --state open|closed|all` with optional `--label`,
  `--assignee`, `--author`, `--milestone`, `--search "<query>"` (full GitHub search syntax,
  including `no:assignee` and `sort:`), `--limit`. Use `--json <fields>` when a follow-up
  command or pipe needs machine-stable values.
- **Edit**: `gh issue edit <n> --title "..." --body-file body.md --add-label ready-for-agent
  --milestone "v1"`. Edits accept several issue numbers at once: `gh issue edit 12 13
  --add-label needs-triage`.
- **Close / reopen**: `gh issue close <n> --reason completed|"not planned"|duplicate`
  (add `--comment "..."` for a closing note, `--duplicate-of <n>` to mark the duplicate).
  `gh issue reopen <n>` reopens.
- **Other targeted verbs**: `gh issue comment`, `gh issue pin` / `unpin`, `gh issue lock` /
  `unlock`, `gh issue develop`, `gh issue transfer`, `gh issue delete`.
- **Comment**: `gh issue comment <n> --body "..."` (or `--body-file`). To fix your own last
  comment: `gh issue comment <n> --edit-last`; `--delete-last` needs `--yes` and an
  explicit user request.
- **Assign**: `gh issue edit <n> --add-assignee <login>` / `--remove-assignee <login>`
  (`@me` for yourself), or `--assignee` at create time.
- **Labels**: `gh issue edit <n> --add-label <name>` / `--remove-label <name>`. Labels take
  **names**, not IDs. Manage the vocabulary with `gh label list`, `gh label create`,
  `gh label edit`, `gh label delete`.
- **Milestones**: `--milestone <title>` on create/edit, `--remove-milestone` to clear.
  Listing or creating milestones needs `gh api` — there is no `gh milestone` command.
- **Link issue ↔ PR**: no link verb exists. GitHub links them from the PR body
  (`Closes #12`, `Fixes #12`) and from cross-references in either conversation. Check the
  result with `gh pr view <n> --json closingIssuesReferences`; create a branch already
  linked to the issue with `gh issue develop <n> --checkout`.

### States

GitHub's issue state is `open` / `closed`, closed with a **reason** — there is no workflow
vocabulary (`triage`/`backlog`/`started`/… no longer exist in this repo's tracker):

- Done: `gh issue close <n> --reason completed`
- Abandoned: `gh issue close <n> --reason "not planned"`
- Duplicate: `gh issue close <n> --reason duplicate --duplicate-of <n>`
- Moved back into play: `gh issue reopen <n>`

`--state` accepts only `open`, `closed`, or `all` — put anything richer in labels or
`--search`.

### Sub-issues and dependencies

Native, and the backbone of wayfinding (below):

```sh
gh issue create --parent <map>            # file a child under a map
gh issue edit <map> --add-sub-issue <n>   # adopt an existing issue
gh issue edit <n> --parent <map>          # re-parent one
gh issue edit <n> --add-blocked-by 200,201 --add-blocking 300
gh issue edit <n> --remove-parent --remove-blocked-by 200
```

Read the relationships with `gh issue view <n> --json parent,subIssues,subIssuesSummary,blockedBy,blocking`.

### Concurrency: no version fence — re-read on failure

The CLI sends no `If-Match` fence; writes are last-write-wins. If a write fails in a way
that could be a concurrent change (conflict, 409/422), re-read the resource
(`gh issue view <n>`) before repeating it.

### Do not auto-retry

If a create/edit/comment call fails in a way that leaves its result unclear, **stop and
check** (`gh issue view <n>`, `gh issue list --search "<title>"`) before issuing it again.
Duplicate issues and comments are worse than a slow confirmation. Destructive commands
(`gh issue delete`, `gh issue comment --delete-last`, `gh label delete`) prompt or need
`--yes` — pass it only when the user asked for the destructive action.

## Labels and milestones

Labels are repository-scoped and referenced **by name**:

```sh
gh label list --repo ZiiMs/zConnect
gh issue edit <n> --add-label ready-for-agent
```

See `triage-labels.md` for the triage vocabulary. The five triage labels and the
`wayfinder:*` labels already exist in the repo; do not create near-duplicates.

## Pull requests

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same triage labels (`gh pr list`, `gh pr view`,
`gh pr diff`, `gh pr review`, `gh pr comment`).

Full lifecycle (available regardless of that flag):

```sh
gh pr list --state open
gh pr view <n>
gh pr view <n> --json files,reviews,statusCheckRollup   # machine-stable snapshot
gh pr diff <n>                                          # add --patch for the raw patch
gh pr checks <n>                                        # CI state for one PR
gh pr create --title "..." --body-file pr-body.md --base main
gh pr edit <n> --title "New title" --add-label ready-for-human
gh pr checkout <n>
gh pr comment <n> --body "..."                          # conversation comment
gh pr review <n> --approve --body "LGTM"                # also --request-changes / --comment
gh pr review <n> --comment --body "..."                 # no verdict
gh pr ready <n>                                         # draft → ready for review
gh pr merge <n> --squash                                # merge|squash|rebase; --auto waits on checks
gh pr close <n>                                         # also: gh pr reopen <n>
gh pr update-branch <n>                                 # rebase the PR branch onto its base
```

Notes:

- `--head` defaults to the current branch; `--base` to the repo default. Cross-fork:
  `--head <fork-owner>:fix --base main`.
- `gh pr review` takes exactly one of `--approve` / `--request-changes` / `--comment`.
  Inline, line-anchored comments are not a CLI feature — post them through
  `gh api` (or the MCP server) when a review needs them.
- **`gh pr ready` marks a draft PR ready for review.** To check merge readiness,
  read `gh pr checks <n>` plus the branch ruleset.
- A merge that is blocked by checks fails loudly; `--auto` enqueues it instead. Read the
  error rather than retrying the merge.
- Agent output is markdown and complete — read it directly. Add `--json` only when you
  need machine-stable values (numbers, SHAs, URLs) for a follow-up command or pipe.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `gh issue create`, then return its number.

## When a skill says "fetch the relevant ticket"

Read it with `gh issue view <n>` (add `--comments` when the conversation matters).

## Wayfinding operations

Used by `/wayfinder`. GitHub has native sub-issues and dependencies, so the **map** and its
**children** are real relationships — not body conventions.

- **Map**: an issue labeled `wayfinder:map`, titled after the effort, holding the
  Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue filed with `--parent <map>` and exactly one type label —
  `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Blocking**: `gh issue edit <n> --add-blocked-by <n>,<n>`. A ticket is unblocked when no
  entry in its `blockedBy` is still open — read `gh issue view <n> --json blockedBy` rather
  than assuming, since the relationship survives the blocker closing.
- **Frontier**: for each `wayfinder:*` type label,
  `gh issue list --label <label> --state open --json number,blockedBy,assignees`; drop any
  child with an open blocker or an assignee. Lowest issue number wins.
- **Claim**: assign the ticket to yourself with `gh issue edit <n> --add-assignee @me`.
  This is the session's first write.
- **Resolve**: `gh issue comment <n> --body "..."` with the answer, then
  `gh issue close <n> --reason completed`, then append a context pointer (gist + link) to
  the map's Decisions-so-far via `gh issue edit <map-n> --body-file body.md`
  (re-read the map body first).
