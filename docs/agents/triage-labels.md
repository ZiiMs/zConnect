# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual labels used in this repo's issue tracker (GitCafe, `ziim/zConnect`).

| Label in mattpocock/skills | Label in our tracker | GitCafe label ID | Meaning                                  |
| -------------------------- | -------------------- | ---------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | _not yet recorded_ | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | _not yet recorded_ | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | _not yet recorded_ | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | _not yet recorded_ | Requires human implementation            |
| `wontfix`                  | `wontfix`            | _not yet recorded_ | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label from this table.

## Filling in the ID column

GitCafe references labels by **ID**, not by name: `create_issue` and `update_issue` take
`labelIds: string[]`. There is no MCP tool that creates or lists labels, so:

1. Create the five labels above in the GitCafe web UI for `ziim/zConnect` (they must be
   named exactly as in the second column — that's the string the skills speak in).
2. Copy each label's ID into the third column here.

Until the IDs are recorded, a skill that needs to apply a triage label must either ask for the
ID or apply it in the web UI. Don't guess an ID — a wrong one silently applies an unrelated
label.

## Changing the vocabulary

If you rename a label in GitCafe, edit the second column to match. Only that column matters to
the skills; the first column is the canonical role name and should stay as-is.
