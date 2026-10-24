# GitHub integration is a read-only mirror over a workspace OAuth App

zConnect mirrors open GitHub pull requests and GitHub issues into a project-scoped, read-only GitHub View instead of importing them, because the mirror answers "what is in flight" without taking on two-way write conflicts, identity mapping, or deletion semantics. A single workspace-level GitHub OAuth App, authorized by an Owner or Admin and stored encrypted in `github_connection`, supplies the token; freshness comes from refreshing on view open and a 15-minute sweep. A GitHub App installation was rejected because its app registration and install flow add setup friction beyond the requested "just OAuth", even though its webhooks would make updates instant. Per-Member OAuth was rejected because it gives each teammate a different repository reality. Import-based sync was rejected because it is a larger product whose reversal would strand imported issues.

## Consequences

- Updates can lag by up to 15 minutes. Repo webhooks can be added later without a schema change.
- The connector's `repo`-scoped token is a shared workspace credential. If it is revoked or the connector loses repository access, sync pauses until an admin reconnects. The token never leaves the backend.
- GitHub Issues remain a distinct entity from zConnect Issues; they are never imported.
- Disconnecting drops cached GitHub Items and project repository links, but External Links on Issues survive.
