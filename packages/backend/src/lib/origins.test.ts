import { describe, expect, test } from "bun:test"
import { allowedOrigins } from "./origins.js"

describe("allowedOrigins", () => {
  test("trusts the whole Vite port range when the frontend is local", () => {
    const origins = allowedOrigins("http://localhost:5173")

    expect(origins).toContain("http://localhost:5173")
    expect(origins).toContain("http://localhost:5174")
    expect(origins).toContain("http://localhost:5179")
    expect(origins).toContain("http://127.0.0.1:5174")
  })

  test("adds the range for a local 127.0.0.1 frontend too", () => {
    expect(allowedOrigins("http://127.0.0.1:5173")).toContain(
      "http://localhost:5176"
    )
  })

  test("leaves a deployed frontend alone", () => {
    expect(allowedOrigins("https://app.zconnect.example")).toEqual([
      "https://app.zconnect.example",
    ])
  })

  test("splits a comma-separated list and trims it", () => {
    expect(
      allowedOrigins(
        "https://app.zconnect.example, https://staging.zconnect.example"
      )
    ).toEqual([
      "https://app.zconnect.example",
      "https://staging.zconnect.example",
    ])
  })

  test("mixes configured origins with the dev range", () => {
    const origins = allowedOrigins("http://localhost:5173,https://app.example")

    expect(origins).toContain("https://app.example")
    expect(origins).toContain("http://localhost:5177")
  })

  test("falls back to the dev origin when nothing is configured", () => {
    expect(allowedOrigins("")).toContain("http://localhost:5173")
    expect(allowedOrigins(undefined)).toContain("http://localhost:5173")
  })

  test("never repeats an origin", () => {
    const origins = allowedOrigins(
      "http://localhost:5173,http://localhost:5173"
    )

    expect(origins).toHaveLength(new Set(origins).size)
  })
})
