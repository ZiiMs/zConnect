import { describe, expect, test } from "bun:test"
import {
  type BetterAuthGitHubClient,
  createBetterAuthGitHubAccountSource,
} from "./token-source.js"

function fakeAuth(options: {
  accounts?: Array<{
    id: string
    providerId: string
    accountId: string
    scope?: string | null
  }>
  token?: { accessToken: string; scopes: string[] }
  tokenError?: boolean
}) {
  const tokenBodies: Array<{ accountId: string; userId: string }> = []
  const auth: BetterAuthGitHubClient = {
    api: {
      async getAccessToken(input) {
        tokenBodies.push(input.body)
        if (options.tokenError) throw new Error("revoked")
        return options.token ?? { accessToken: "", scopes: [] }
      },
    },
    $context: Promise.resolve({
      internalAdapter: {
        async findAccounts() {
          return options.accounts ?? []
        },
      },
    }),
  }
  return { auth, tokenBodies }
}

const githubAccount = {
  id: "ba-account-1",
  providerId: "github",
  accountId: "gh-42",
  scope: "repo,read:user",
}

describe("Better Auth GitHub account source", () => {
  test("reads the token for the linked GitHub account", async () => {
    const { auth, tokenBodies } = fakeAuth({
      accounts: [githubAccount],
      token: { accessToken: "gho_token", scopes: ["repo"] },
    })
    const source = createBetterAuthGitHubAccountSource(async () => auth)

    expect(await source.getLinkedAccount("user-1")).toEqual({
      accountId: "ba-account-1",
      accessToken: "gho_token",
      scopes: ["repo"],
    })
    // Better Auth 1.7 selects the account by its local row id, not providerId.
    expect(tokenBodies).toEqual([
      { accountId: "ba-account-1", userId: "user-1" },
    ])
  })

  test("returns null when the user has no linked GitHub account", async () => {
    const { auth, tokenBodies } = fakeAuth({
      accounts: [{ id: "ba-google", providerId: "google", accountId: "g-1" }],
    })
    const source = createBetterAuthGitHubAccountSource(async () => auth)

    expect(await source.getLinkedAccount("user-1")).toBeNull()
    expect(tokenBodies).toEqual([])
  })

  test("falls back to the stored account scope when the token omits scopes", async () => {
    const { auth } = fakeAuth({
      accounts: [githubAccount],
      token: { accessToken: "gho_token", scopes: [] },
    })
    const source = createBetterAuthGitHubAccountSource(async () => auth)

    expect((await source.getLinkedAccount("user-1"))?.scopes).toEqual([
      "repo",
      "read:user",
    ])
  })

  test("returns null when Better Auth cannot mint a usable token", async () => {
    const { auth } = fakeAuth({
      accounts: [githubAccount],
      tokenError: true,
    })
    const source = createBetterAuthGitHubAccountSource(async () => auth)
    expect(await source.getLinkedAccount("user-1")).toBeNull()

    const empty = fakeAuth({
      accounts: [githubAccount],
      token: { accessToken: "", scopes: ["repo"] },
    })
    const emptySource = createBetterAuthGitHubAccountSource(
      async () => empty.auth
    )
    expect(await emptySource.getLinkedAccount("user-1")).toBeNull()

    const missing = createBetterAuthGitHubAccountSource(async () => {
      throw new Error("auth unavailable")
    })
    expect(await missing.getLinkedAccount("user-1")).toBeNull()
  })
})
