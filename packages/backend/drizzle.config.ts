import "./src/lib/env.js"
import { defineConfig } from "drizzle-kit"

/**
 * Migrations need a direct connection: Neon's `-pooler` endpoint runs
 * PgBouncer in transaction mode, while DDL/drizzle-kit expects a session.
 * Runtime traffic (`src/db/index.ts`) uses the pooled `DATABASE_URL`.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL is not set (run `neon env pull` to write the repo-root .env.local)"
  )
}

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
})
