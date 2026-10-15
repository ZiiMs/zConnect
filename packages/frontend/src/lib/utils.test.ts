import { describe, expect, test } from "vitest"
import { cn } from "./utils.js"

describe("cn", () => {
  test("merges class names and drops falsy values", () => {
    const result = cn("px-2", false && "never", "py-1")
    expect(result).toContain("px-2")
    expect(result).toContain("py-1")
    expect(result).not.toContain("never")
  })
})
