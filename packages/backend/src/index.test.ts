import { describe, expect, test } from "bun:test"

// The origin list is frozen when `index.ts` is first imported, so the env has to
// be settled before that import. A local frontend is what the CORS assertions
// below exercise.
process.env.FRONTEND_URL = "http://localhost:5173"

const { default: app } = await import("./index.js")

function preflight(origin: string) {
  return app.request("/api/auth/sign-in/social", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
    },
  })
}

describe("GET /", () => {
  test("returns hello", async () => {
    const res = await app.request("/")

    expect(res.status).toBe(200)
    expect(await res.text()).toBe("Hello Hono!")
  })
})

describe("CORS", () => {
  test("echoes a swapped Vite port", async () => {
    const res = await preflight("http://localhost:5176")

    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5176"
    )
    expect(res.headers.get("access-control-allow-credentials")).toBe("true")
  })

  test("echoes the 127.0.0.1 spelling of a dev origin", async () => {
    const res = await preflight("http://127.0.0.1:5177")

    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5177"
    )
  })

  test("says nothing to a port outside the range", async () => {
    const res = await preflight("http://localhost:6000")

    expect(res.headers.get("access-control-allow-origin")).toBeNull()
  })
})
