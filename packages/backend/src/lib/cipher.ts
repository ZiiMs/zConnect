import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Integration secrets at rest (ADR-0005): AES-256-GCM with a versioned
 * payload so the key can be rotated later. `INTEGRATION_ENCRYPTION_KEY` is
 * the raw 32-byte base64 value; an unset key leaves the connection feature
 * unavailable (the route answers 503) instead of failing at import.
 */
export interface IntegrationCipher {
  /** Versioned payload, safe to store. */
  encrypt(plain: string): string
  /** Throws `Error("cipher: …")` on tamper, wrong key, or unknown version. */
  decrypt(payload: string): string
}

const VERSION = "v1"
const IV_BYTES = 12
const KEY_BYTES = 32

/** `key` is the raw 32-byte base64 value of INTEGRATION_ENCRYPTION_KEY. */
export function createIntegrationCipher(key: string): IntegrationCipher {
  const raw = Buffer.from(key, "base64")
  if (raw.length !== KEY_BYTES) {
    throw new Error("cipher: INTEGRATION_ENCRYPTION_KEY must be 32 bytes")
  }

  return {
    encrypt(plain) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv("aes-256-gcm", raw, iv)
      const ciphertext = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
      ])
      const tag = cipher.getAuthTag()
      return [
        VERSION,
        iv.toString("base64url"),
        ciphertext.toString("base64url"),
        tag.toString("base64url"),
      ].join(".")
    },

    decrypt(payload) {
      const parts = payload.split(".")
      if (parts.length !== 4) throw new Error("cipher: malformed payload")
      const [version, iv, ciphertext, tag] = parts
      if (version !== VERSION) {
        throw new Error(`cipher: unknown version ${version}`)
      }
      let decipher: ReturnType<typeof createDecipheriv> & {
        setAuthTag(tag: Buffer): void
      }
      try {
        decipher = createDecipheriv(
          "aes-256-gcm",
          raw,
          Buffer.from(iv, "base64url")
        ) as ReturnType<typeof createDecipheriv> & {
          setAuthTag(tag: Buffer): void
        }
        decipher.setAuthTag(Buffer.from(tag, "base64url"))
      } catch {
        throw new Error("cipher: malformed payload")
      }
      try {
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8")
      } catch {
        throw new Error("cipher: authentication failed")
      }
    },
  }
}
