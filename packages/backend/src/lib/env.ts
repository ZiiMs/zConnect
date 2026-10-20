import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

/**
 * `neon deploy` writes Neon-managed variables (`DATABASE_URL`,
 * `DATABASE_URL_UNPOOLED`, and any provisioned service values) to the
 * repo-root `.env.local`.
 * Backend commands run from `packages/backend`, so Bun's automatic `.env`
 * loading never sees that file. Load it explicitly, after any package-local
 * `.env`, so the Neon values win over a stale local copy.
 *
 * Imported first by `src/index.ts` and `src/worker.ts`; `drizzle.config.ts`
 * imports it too so migrations use the direct URL.
 */
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))

for (const file of [".env", ".env.local"]) {
  const path = resolve(repoRoot, file)
  if (existsSync(path)) {
    config({ path, override: true, quiet: true })
  }
}
