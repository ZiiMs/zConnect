# T7 – MCP server

Agents manage the same Issues through a hosted MCP surface that reuses the
app auth and permission checks, scoped by a workspace token.

## Transport choice

Streamable HTTP as a hand-rolled JSON-RPC dispatcher over the existing Hono
app (`POST /api/mcp`), with no extra dependencies. The JSON-RPC method name
IS the tool name, so the surface is exactly the five MVP tools plus the
`tools/list` discovery method — there is deliberately no `tools/call`
wrapper and no SSE stream (`GET /api/mcp` returns 405). Success wraps the
REST-shaped payload in `{ jsonrpc: "2.0", id, result }` with the mirrored
HTTP status; every failure mirrors its REST counterpart status with a
REST-shaped `{ error }` body, so parity tests compare status codes directly.

## Auth

`Authorization: Bearer <workspace token>`. Tokens are issued from workspace
settings (`POST /api/workspaces/:id/tokens`, Owner/Admin only, show-once
plaintext `zct_…`); only the SHA-256 hash is stored (`workspace_token`
table). A token acts with Member-level access scoped to its workspace:
issue/project reads plus issue create/update. No delete or member admin is
reachable — those methods do not exist (404) and `tools/list` enumerates
exactly the five tools.

## Permission reuse

The dispatcher calls the SAME `WorkspaceStore` queries the REST routes use
(`getProject`, `listProjects`, `listIssues`, `getIssue`, `createIssue`,
`updateIssue`) with the SAME rules: same-workspace reads resolve, foreign
reads are 403, writes require workspace membership (the token counts as a
Member), and store `invalid`/`not_found` codes map to 400/404 exactly like
the REST routes.
