import { eq } from "drizzle-orm"
import type { getDb } from "../db/index.js"
import { workspaceToken } from "../db/schema.js"
import {
  hashToken,
  mintPlaintext,
  type TokenStore,
  type WorkspaceToken,
  type WorkspaceTokenMeta,
} from "./tokens.js"

type Db = ReturnType<typeof getDb>

function notFound(message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = "not_found"
  return error
}

function toMeta(row: typeof workspaceToken.$inferSelect): WorkspaceTokenMeta {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    prefix: row.prefix,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}

function toRecord(row: typeof workspaceToken.$inferSelect): WorkspaceToken {
  return { ...toMeta(row), hash: row.hash }
}

/**
 * Production TokenStore over Neon Postgres. Same lazy-db pattern as the
 * Drizzle workspace store: importing never requires DATABASE_URL.
 */
export function createDrizzleTokenStore(resolveDb: () => Db): TokenStore {
  return {
    async createToken(input) {
      const db = resolveDb()
      const { plaintext, prefix } = mintPlaintext()
      const [row] = await db
        .insert(workspaceToken)
        .values({
          workspaceId: input.workspaceId,
          name: input.name,
          hash: await hashToken(plaintext),
          prefix,
          createdBy: input.createdBy,
        })
        .returning()
      return {
        record: toMeta(row),
        plaintext,
      }
    },

    async listTokens(workspaceId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(workspaceToken)
        .where(eq(workspaceToken.workspaceId, workspaceId))
      return rows.map(toMeta)
    },

    async revokeToken(tokenId) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(workspaceToken)
        .where(eq(workspaceToken.id, tokenId))
      if (!rows[0]) throw notFound("Token not found")
      await db.delete(workspaceToken).where(eq(workspaceToken.id, tokenId))
    },

    async resolveToken(plaintext) {
      const db = resolveDb()
      const rows = await db
        .select()
        .from(workspaceToken)
        .where(eq(workspaceToken.hash, await hashToken(plaintext)))
      return rows[0] ? toRecord(rows[0]) : null
    },
  }
}

