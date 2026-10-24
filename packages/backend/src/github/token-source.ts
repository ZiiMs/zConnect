/**
 * GitHub account custody for the workspace Connection (ADR-0005). The
 * connection finalizes from the GitHub account the session user linked
 * through Better Auth; tests inject a plain object instead of touching
 * Better Auth or the network.
 */

export interface GitHubLinkedAccount {
  /** Better Auth account row id (audit trail for the connector). */
  accountId: string
  accessToken: string
  scopes: string[]
}

export interface GitHubAccountSource {
  /** The GitHub account linked to this zConnect user, with a usable token. */
  getLinkedAccount(userId: string): Promise<GitHubLinkedAccount | null>
}

/** Minimal Better Auth surface used by the production source. */
export interface BetterAuthGitHubClient {
  api: {
    getAccessToken(input: {
      body: { accountId: string; userId: string }
    }): Promise<{ accessToken: string; scopes: string[] }>
  }
  $context: Promise<{
    internalAdapter: {
      findAccounts(userId: string): Promise<
        Array<{
          id: string
          providerId: string
          accountId: string
          scope?: string | null
        }>
      >
    }
  }>
}

function parseScopes(scope: string | null | undefined): string[] {
  return (scope ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * Production source. `getAccessToken` in better-auth 1.7.x selects an
 * account by its local row id (not `providerId`), while `listUserAccounts`
 * requires the request session, so the account row is resolved through the
 * auth context and the token then goes through Better Auth's refresh path.
 */
export function createBetterAuthGitHubAccountSource(
  loadAuth: () => Promise<BetterAuthGitHubClient>
): GitHubAccountSource {
  return {
    async getLinkedAccount(userId) {
      let auth: BetterAuthGitHubClient
      try {
        auth = await loadAuth()
      } catch {
        return null
      }
      let account:
        | {
            id: string
            providerId: string
            accountId: string
            scope?: string | null
          }
        | undefined
      try {
        const context = await auth.$context
        const accounts = await context.internalAdapter.findAccounts(userId)
        account = accounts.find((row) => row.providerId === "github")
      } catch {
        return null
      }
      if (!account) return null
      try {
        const token = await auth.api.getAccessToken({
          body: { accountId: account.id, userId },
        })
        if (!token.accessToken) return null
        return {
          accountId: account.id,
          accessToken: token.accessToken,
          scopes:
            token.scopes && token.scopes.length > 0
              ? token.scopes
              : parseScopes(account.scope),
        }
      } catch {
        return null
      }
    },
  }
}
