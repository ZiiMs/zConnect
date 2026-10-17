/**
 * The browser origins allowed to call the API.
 *
 * `FRONTEND_URL` is the source of truth and takes a comma-separated list, so a
 * deployment can name more than one app origin. When any of them is local, the
 * whole Vite port range is trusted as well: Vite quietly walks to the next free
 * port when 5173 is taken, and a request from an untrusted origin reaches the
 * browser as an opaque `TypeError: Failed to fetch`. Deployed origins never
 * pick that range up.
 *
 * `index.ts` (CORS) and `lib/auth.ts` (`trustedOrigins`) both read this, so the
 * two cannot disagree about which origins are allowed.
 */

/** The ports Vite walks when its default is taken. */
const VITE_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179] as const

const DEFAULT_ORIGIN = "http://localhost:5173"

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i

function split(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "")
}

export function allowedOrigins(
  frontendUrl: string | undefined = process.env.FRONTEND_URL
): string[] {
  const configured = split(frontendUrl ?? DEFAULT_ORIGIN)
  const origins = configured.length > 0 ? configured : [DEFAULT_ORIGIN]

  if (!origins.some((origin) => LOCAL_ORIGIN.test(origin))) {
    return origins
  }

  const local = VITE_PORTS.flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ])

  return [...new Set([...origins, ...local])]
}
