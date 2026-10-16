/**
 * PROTOTYPE (throwaway) — Google Fonts loader for the registry themes.
 *
 * A registry theme names its own typefaces, and type is a large part of what
 * makes those themes recognisable (Claude's serif, Vercel's Geist, Vintage
 * Paper's Libre Baskerville). Loading every family up front would be ~30
 * stylesheets, so swap in the active theme's own fonts, and only those.
 *
 * URLs are pre-resolved at generation time (see generate-registry.ts), so a
 * family that is not on Google Fonts — Signifier, in Sage Garden — is already
 * excluded rather than failing here at runtime.
 */
import { REGISTRY_THEMES } from "./registry-themes"

const MARK = "data-proto-font"

let applied: string | null = null

export function applyThemeFonts(themeKey: string) {
  // `paint` runs on every mode flip too; the links only need to change when the
  // theme itself does, and re-adding them re-triggers the font loads.
  if (themeKey === applied) {
    return
  }
  applied = themeKey
  for (const node of document.querySelectorAll(`link[${MARK}]`)) {
    node.remove()
  }
  if (themeKey === "") {
    return
  }
  const theme = REGISTRY_THEMES.find((item) => item.key === themeKey)
  if (!theme) {
    return
  }
  for (const href of theme.fonts) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.setAttribute(MARK, "")
    link.href = href
    document.head.appendChild(link)
  }
}
