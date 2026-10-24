import { describe, expect, test } from "bun:test"
import { createIntegrationCipher } from "./cipher.js"

/** 32 raw bytes, base64 — the shape INTEGRATION_ENCRYPTION_KEY takes. */
const KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString(
  "base64"
)

const OTHER_KEY = Buffer.from(
  "fedcba9876543210fedcba9876543210",
  "utf8"
).toString("base64")

describe("integration cipher", () => {
  test("round-trips a token through the versioned payload", () => {
    const cipher = createIntegrationCipher(KEY)
    const payload = cipher.encrypt("gho_secret-token")
    expect(payload.startsWith("v1.")).toBe(true)
    expect(payload).not.toContain("gho_secret-token")
    expect(cipher.decrypt(payload)).toBe("gho_secret-token")
  })

  test("uses a fresh IV for every encryption", () => {
    const cipher = createIntegrationCipher(KEY)
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"))
  })

  test("rejects a tampered ciphertext, tag, or IV", () => {
    const cipher = createIntegrationCipher(KEY)
    const [version, iv, ciphertext, tag] = cipher.encrypt("token").split(".")
    expect(() =>
      cipher.decrypt([version, iv, flip(ciphertext), tag].join("."))
    ).toThrow(/^cipher:/)
    expect(() =>
      cipher.decrypt([version, iv, ciphertext, flip(tag)].join("."))
    ).toThrow(/^cipher:/)
    expect(() =>
      cipher.decrypt([version, flip(iv), ciphertext, tag].join("."))
    ).toThrow(/^cipher:/)
  })

  test("rejects a payload encrypted with another key", () => {
    const payload = createIntegrationCipher(KEY).encrypt("token")
    expect(() => createIntegrationCipher(OTHER_KEY).decrypt(payload)).toThrow(
      /^cipher:/
    )
  })

  test("rejects unknown versions and malformed payloads", () => {
    const cipher = createIntegrationCipher(KEY)
    const valid = cipher.encrypt("token")
    expect(() => cipher.decrypt(`v2${valid.slice(2)}`)).toThrow(
      /^cipher: unknown version/
    )
    expect(() => cipher.decrypt("not-a-payload")).toThrow(/^cipher:/)
    expect(() => cipher.decrypt("v1.only-two")).toThrow(/^cipher:/)
  })

  test("rejects a key that is not 32 bytes", () => {
    expect(() => createIntegrationCipher("dG9vLXNob3J0")).toThrow(/^cipher:/)
    expect(() => createIntegrationCipher("not base64!")).toThrow(/^cipher:/)
  })
})

/** Flip one character so base64url stays well-formed. */
function flip(value: string): string {
  const first = value[0] === "A" ? "B" : "A"
  return first + value.slice(1)
}
