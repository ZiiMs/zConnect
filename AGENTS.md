# AGENTS.md

zConnect — a Bun-workspaces monorepo: `packages/backend` (Hono + Bun, Drizzle + Supabase Postgres,
Better Auth, BullMQ) and `packages/frontend` (React + Vite, Tailwind v4, shadcn). Linting and
formatting are Biome, configured at the repo root.

## Agent skills

### Issue tracker

Issues live in GitCafe (`ziim/zConnect`), driven through the `git-cafe` MCP tools, which require
OAuth sign-in for this private repo. This supersedes any personal instruction to use Plane — for
this repository, GitCafe wins. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. GitCafe references labels by ID; record them in
the mapping table before applying any. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root, shared by both packages.
See `docs/agents/domain.md`.
