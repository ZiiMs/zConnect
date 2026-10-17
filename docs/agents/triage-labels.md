# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual labels used in this repo's issue tracker (GitHub, `ZiiMs/zConnect`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

All five exist in the repo today (verified with `gh label list --repo ZiiMs/zConnect`). When a
skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
from this table **by name**:

```sh
gh issue edit <n> --add-label ready-for-agent
gh issue list --label needs-triage --state open
```

## Names, not IDs

`gh` resolves labels **by name** — never pass an ID. If a raw `gh api` call needs
an ID, read it from `gh label list --json name,id`. Do not guess one — a wrong ID silently applies
an unrelated label.

## Changing the vocabulary

If you rename a label, update the second column to match and confirm with
`gh label list --repo ZiiMs/zConnect`. Only that column matters to the skills; the first
column is the canonical role name and should stay as-is.

## Wayfinding labels

`/wayfinder` also relies on `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, and `wayfinder:task`, which are already present in the repo. See
`issue-tracker.md` for how they are applied.
