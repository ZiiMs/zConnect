import { useEffect, useState } from "react"

/** Current pathname (testable seam over `window.location`). */
export function getPathname(): string {
  return window.location.pathname
}

/**
 * History navigation that notifies `usePathname` subscribers. No-ops when
 * the target already matches, so title-slug refreshes never stack duplicate
 * history entries.
 */
export function navigate(path: string, opts?: { replace?: boolean }): void {
  if (window.location.pathname === path) return
  if (opts?.replace) window.history.replaceState(null, "", path)
  else window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

/** Live pathname: re-renders on push/replace (via navigate) + back/forward. */
export function usePathname(): string {
  const [pathname, setPathname] = useState<string>(() => getPathname())
  useEffect(() => {
    const onChange = () => setPathname(getPathname())
    window.addEventListener("popstate", onChange)
    return () => window.removeEventListener("popstate", onChange)
  }, [])
  return pathname
}
