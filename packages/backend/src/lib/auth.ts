import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"
import * as schema from "../db/auth-schema.js"
import { getDb } from "../db/index.js"
import { allowedOrigins } from "./origins.js"

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: allowedOrigins(),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  /**
   * The GitHub Connection is authorized by an Owner/Admin whose GitHub email
   * may differ from their zConnect email (ADR-0005). Linking stays manual;
   * only explicit `linkSocial` calls attach the account.
   */
  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
})
