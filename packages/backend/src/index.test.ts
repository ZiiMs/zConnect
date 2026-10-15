import { describe, expect, test } from "bun:test"
import app from "./index.js"

describe("GET /", () => {
  test("returns hello", async () => {
    const res = await app.request("/")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("Hello Hono!")
  })
})
