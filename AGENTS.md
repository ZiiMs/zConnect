# AGENTS.md

zConnect - a Bun-workspaces monorepo: `packages/backend` (Hono + Bun, Drizzle + Neon Postgres,
Better Auth, BullMQ) and `packages/frontend` (React + Vite, Tailwind v4, shadcn). Linting and
formatting are Biome, configured at the repo root.

## Agent skills

### Issue tracker

Issues live in GitHub (`ZiiMs/zConnect`), driven through the `gh` CLI, which must already be
authenticated (`gh auth status`). This supersedes any personal instruction to use Plane — for
this repository, GitHub wins. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. `gh` takes labels by name (`--add-label`
/ `--remove-label`) — see `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root, shared by both packages.
See `docs/agents/domain.md`.
