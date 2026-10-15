export interface WorkspaceToken {
  id: string
  workspaceId: string
  name: string
  /** SHA-256 hex of the plaintext; the plaintext itself is never stored. */
  hash: string
  /** First 8 chars of the random part, for display in settings. */
  prefix: string
  createdBy: string
  createdAt: string
}

export type WorkspaceTokenMeta = Omit<WorkspaceToken, "hash">

export interface TokenStore {
  createToken(input: {
    workspaceId: string
    name: string
    createdBy: string
  }): Promise<{ record: WorkspaceTokenMeta; plaintext: string }>
  listTokens(workspaceId: string): Promise<WorkspaceTokenMeta[]>
  revokeToken(tokenId: string): Promise<void>
  resolveToken(plaintext: string): Promise<WorkspaceToken | null>
}

function notFound(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "not_found"
  return error
}

function toMeta(record: WorkspaceToken): WorkspaceTokenMeta {
  const { hash: _hash, ...meta } = record
  return meta
}

export async function hashToken(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(plaintext)
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function mintPlaintext(): { plaintext: string; prefix: string } {
  const random = Buffer.from(crypto.getRandomValues(new Uint8Array(24)))
    .toString("base64url")
    .slice(0, 32)
  return { plaintext: `zct_${random}`, prefix: random.slice(0, 8) }
}

export function createMemoryTokenStore(): TokenStore {
  const byId = new Map<string, WorkspaceToken>()
  const byHash = new Map<string, WorkspaceToken>()

  return {
    async createToken(input) {
      const { plaintext, prefix } = mintPlaintext()
      const record: WorkspaceToken = {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        name: input.name,
        hash: await hashToken(plaintext),
        prefix,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      }
      byId.set(record.id, record)
      byHash.set(record.hash, record)
      return { record: toMeta(record), plaintext }
    },

    async listTokens(workspaceId) {
      return [...byId.values()]
        .filter((t) => t.workspaceId === workspaceId)
        .map(toMeta)
    },

    async revokeToken(tokenId) {
      const record = byId.get(tokenId)
      if (!record) throw notFound("Token not found")
      byId.delete(tokenId)
      byHash.delete(record.hash)
    },

    async resolveToken(plaintext) {
      return byHash.get(await hashToken(plaintext)) ?? null
    },
  }
}
