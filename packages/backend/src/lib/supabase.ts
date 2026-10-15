import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
if (!url) {
  throw new Error("SUPABASE_URL is not set in packages/backend/.env")
}

const anonKey = process.env.SUPABASE_ANON_KEY
if (!anonKey) {
  throw new Error("SUPABASE_ANON_KEY is not set in packages/backend/.env")
}

const serviceRoleKey = process.env.SUPABASE_SECRET_KEY

/** Scoped to the requester's JWT / anon key. Respects RLS. */
export const supabase = createClient(url, anonKey)

/**
 * Bypasses RLS. Server-only — never expose to the frontend.
 * Null until SUPABASE_SECRET_KEY is set (Dashboard → Project Settings → API Keys).
 */
export const supabaseAdmin = serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null
