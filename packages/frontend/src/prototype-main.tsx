/**
 * PROTOTYPE (throwaway) — separate Vite entry for `prototype.html`.
 *
 * Kept out of `main.tsx` on purpose: the mockups never touch the real entry,
 * and `prototype.html` is not in the build's input list, so a stray merge
 * cannot ship them. Run with `bun run --cwd packages/frontend dev` and open
 * http://localhost:5173/prototype.html
 */
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "./prototypes/app-mockups/themes.css"
import { PrototypeRoot } from "./prototypes/app-mockups/prototype-root"
import { readProtoState } from "./prototypes/app-mockups/use-proto-params"

// Apply the theme before the first paint so there is no unstyled flash.
const state = readProtoState()
const root = document.documentElement
root.dataset.protoTheme = state.theme
root.dataset.protoMode = state.mode
root.classList.toggle("dark", state.mode === "dark")
root.style.colorScheme = state.mode

const container = document.getElementById("root")
if (container === null) {
  throw new Error("prototype entry is missing #root")
}

createRoot(container).render(
  <StrictMode>
    <PrototypeRoot />
  </StrictMode>
)
