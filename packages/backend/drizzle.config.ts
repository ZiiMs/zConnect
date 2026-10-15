import { defineConfig } from "drizzle-kit"

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL is not set in packages/backend/.env")
}

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
})
