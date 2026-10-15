import { Hono } from "hono"
import { cors } from "hono/cors"
import { getDb } from "./db/index.js"
import { createDrizzleWorkspaceStore } from "./workspaces/drizzle-store.js"
import { createWorkspacesApp } from "./workspaces/routes.js"

const app = new Hono()

app.use(
  "/api/*",
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  })
)

// Imported dynamically so the app object stays import-safe without env
// (contract tests never hit this route).
app.all("/api/auth/*", async (c) => {
  const { auth } = await import("./lib/auth.js")
  return auth.handler(c.req.raw)
})

app.route(
  "/",
  createWorkspacesApp({
    store: createDrizzleWorkspaceStore(() => getDb()),
    getSession: async (req) => {
      const { auth } = await import("./lib/auth.js")
      const session = await auth.api.getSession({ headers: req.headers })
      if (!session) return null
      return { user: { id: session.user.id, email: session.user.email } }
    },
  })
)

app.get("/", (c) => {
  return c.text("Hello Hono!")
})

export default app
