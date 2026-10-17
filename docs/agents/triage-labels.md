# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual labels used in this repo's issue tracker (GitCafe, `ziim/zConnect`).

| Label in mattpocock/skills | Label in our tracker | GitCafe label ID (MCP-era reference) | Meaning                                  |
| -------------------------- | -------------------- | ------------------------------------ | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | `label_01m4z8aqq1eaha1f3ce4ceqwdt` | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | `label_01m4z8bc2jf4cbpzqd1py3jrj4` | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | `label_01m4z8bke0fjc9pqxacd7re4py` | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | `label_01m4z8bs24ejcreh853rza75pd` | Requires human implementation            |
| `wontfix`                  | `wontfix`            | `label_01m4z8c8gdfk3r43ceqy39q0wm` | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label from this table **by name**:

```sh
cafe issue label add <n> ready-for-agent
cafe issue list --label needs-triage --state open
```

## The ID column

The `cafe` CLI resolves labels **by name** — never pass an ID to it. The third column
above is a leftover from the `git-cafe` MCP era (verified via
`cafe issue label list --repo ziim/zConnect` on 2026-10-16) and exists only so a raw
`cafe api` call can still map names to IDs. Do not guess an ID — a wrong one silently
applies an unrelated label.

## Changing the vocabulary

If you rename a label, update the second column to match and confirm with
`cafe issue label list`. Only that column matters to the skills; the first column is
the canonical role name and should stay as-is.
