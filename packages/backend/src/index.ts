import "./lib/env.js"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { getDb } from "./db/index.js"
import { createGitHubConnectionApp } from "./github/connection-routes.js"
import { createDrizzleGitHubStore } from "./github/drizzle-store.js"
import { createGitHubProvider } from "./github/github-provider.js"
import type { GitHubWebhookPayload } from "./github/job.js"
import { createGitHubProjectApp } from "./github/project-routes.js"
import { createGitHubApp } from "./github/routes.js"
import { createBetterAuthGitHubAccountSource } from "./github/token-source.js"
import { createGitHubViewApp } from "./github/view-routes.js"
import { createIntegrationCipher } from "./lib/cipher.js"
import { createMailerFromEnv } from "./lib/mailer.js"
import { allowedOrigins } from "./lib/origins.js"
import { createDrizzleTokenStore } from "./mcp/drizzle-tokens.js"
import { createMcpApp } from "./mcp/routes.js"
import { createRealtimeApp } from "./realtime/routes.js"
import { createRealtimeSealer } from "./realtime/service.js"
import { createDrizzleWorkspaceStore } from "./workspaces/drizzle-store.js"
import { createWorkspacesApp } from "./workspaces/routes.js"

const app = new Hono()
const getSession = async (req: Request) => {
  const { auth } = await import("./lib/auth.js")
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return null
  return { user: { id: session.user.id, email: session.user.email } }
}

// Unset key leaves the GitHub Connection feature unavailable (POST answers
// 503); a set-but-invalid key fails loudly at startup.
const integrationCipher = process.env.INTEGRATION_ENCRYPTION_KEY
  ? createIntegrationCipher(process.env.INTEGRATION_ENCRYPTION_KEY)
  : null

// One adapter satisfies both seams: the Connection routes' remote listing and
// the sync/view apps' GitProvider.
const githubProvider = createGitHubProvider()

app.use(
  "/api/*",
  cors({
    origin: allowedOrigins(),
    credentials: true,
  })
)

// Imported dynamically so the app object stays import-safe without env
// (contract tests never hit this route).
app.all("/api/auth/*", async (c) => {
  const { auth } = await import("./lib/auth.js")
  return auth.handler(c.req.raw)
})

// Sealed live queries for the collaboration surfaces. Reads are still
// backend-authorized: the browser gets a short-lived capability, never a
// database credential.
app.route(
  "/",
  createRealtimeApp({
    store: createDrizzleWorkspaceStore(() => getDb()),
    getSession,
    sealer: createRealtimeSealer(),
  })
)

app.route(
  "/",
  createWorkspacesApp({
    store: createDrizzleWorkspaceStore(() => getDb()),
    getSession,
    mailer: createMailerFromEnv(),
    frontendUrl: process.env.FRONTEND_URL,
  })
)

// GitHub App + External Links (T6), mounted additively. The queue import is
// dynamic so the app object stays import-safe without REDIS_URL (contract
// tests never enqueue). Webhook HMAC applies only when GITHUB_WEBHOOK_SECRET
// is set — production must set it; see github/routes.ts.
app.route(
  "/",
  createGitHubApp({
    workspaces: createDrizzleWorkspaceStore(() => getDb()),
    github: createDrizzleGitHubStore(() => getDb()),
    getSession,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    enqueue: async (job: GitHubWebhookPayload) => {
      const { queues, QUEUES } = await import("./lib/queue.js")
      await queues[QUEUES.githubWebhook].add("github-webhook", job, {
        jobId: job.deliveryId,
      })
    },
  })
)

app.route(
  "/",
  createGitHubConnectionApp({
    workspaces: createDrizzleWorkspaceStore(() => getDb()),
    github: createDrizzleGitHubStore(() => getDb()),
    getSession,
    cipher: integrationCipher,
    accounts: createBetterAuthGitHubAccountSource(
      async () => (await import("./lib/auth.js")).auth
    ),
    remote: githubProvider,
  })
)

// Project-scoped repository links (#48): read for every member/Viewer, manage
// for Owner/Admin. Mounted additively beside the Connection routes.
app.route(
  "/",
  createGitHubProjectApp({
    workspaces: createDrizzleWorkspaceStore(() => getDb()),
    github: createDrizzleGitHubStore(() => getDb()),
    getSession,
  })
)

// GitHub View (#49): project read for the Pull Request tab and the manual
// refresh. The queue import stays dynamic so the app object is import-safe
// without REDIS_URL.
app.route(
  "/",
  createGitHubViewApp({
    workspaces: createDrizzleWorkspaceStore(() => getDb()),
    github: createDrizzleGitHubStore(() => getDb()),
    getSession,
    enqueueSync: async (repositoryId: string) => {
      const { queues, QUEUES } = await import("./lib/queue.js")
      await queues[QUEUES.githubSync].add(
        "github-sync",
        { repositoryId },
        { jobId: repositoryId }
      )
    },
  })
)

app.get("/", (c) => {
  return c.text("Hello Hono!")
})

// T7 MCP server: workspace token issuance + Streamable HTTP route.
app.route(
  "/",
  createMcpApp({
    store: createDrizzleWorkspaceStore(() => getDb()),
    tokens: createDrizzleTokenStore(() => getDb()),
    getSession,
    mailer: createMailerFromEnv(),
    frontendUrl: process.env.FRONTEND_URL,
  })
)

export { app }

export default {
  fetch: app.fetch,
}
