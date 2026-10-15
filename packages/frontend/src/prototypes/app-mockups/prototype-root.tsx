/**
 * PROTOTYPE (throwaway) — entry component for `prototype.html`.
 *
 * Composable shell: the nav chrome variant plus the content variant for the
 * current screen. Every surface is picked independently via the URL
 * (`nav`, `issues`, `board`, `detail`, `settings`, `signin`), so any
 * sidebar works with any issues panel, board, detail page or settings.
 * Style and color compose independently too (`style`, `color`, `mode`).
 */
import { useEffect } from "react"
import { PrototypeSwitcher } from "./prototype-switcher"
import { useProtoState } from "./use-proto-params"
import { BOARDS } from "./variants/boards"
import { DETAILS } from "./variants/details"
import { ISSUES_PANELS } from "./variants/issues-panels"
import { NAVS } from "./variants/navs"
import { SETTINGS_PANELS } from "./variants/settings-panels"
import { SIGNINS } from "./variants/signins"

/** Top-bar navs stack vertically; rails sit beside the content. */
const TOPBAR_NAVS = new Set(["2", "7"])

export function PrototypeRoot() {
  const [state, update] = useProtoState()

  useEffect(() => {
    const root = document.documentElement
    root.dataset.protoStyle = state.style
    root.dataset.protoColor = state.color
    root.dataset.protoMode = state.mode
    // Keep the app's own dark hook in sync so `dark:` utilities resolve.
    root.classList.toggle("dark", state.mode === "dark")
    root.style.colorScheme = state.mode
    delete root.dataset.protoTheme
  }, [state.style, state.color, state.mode])

  if (state.screen === "signin") {
    const Signin = SIGNINS[state.signin] ?? SIGNINS["1"]
    return (
      <>
        <Signin />
        <PrototypeSwitcher onChange={update} state={state} />
      </>
    )
  }

  const Nav = NAVS[state.nav] ?? NAVS["1"]
  const topbar = TOPBAR_NAVS.has(state.nav)

  return (
    <>
      <div
        className={
          topbar
            ? "proto-shell flex h-svh flex-col overflow-hidden"
            : "proto-shell flex h-svh overflow-hidden"
        }
      >
        <Nav screen={state.screen} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {state.screen === "issues"
            ? (() => {
                const Content =
                  ISSUES_PANELS[state.issues] ?? ISSUES_PANELS["1"]
                return <Content />
              })()
            : null}
          {state.screen === "board"
            ? (() => {
                const Content = BOARDS[state.board] ?? BOARDS["1"]
                return <Content />
              })()
            : null}
          {state.screen === "issue"
            ? (() => {
                const Content = DETAILS[state.detail] ?? DETAILS["1"]
                return <Content />
              })()
            : null}
          {state.screen === "settings"
            ? (() => {
                const Content =
                  SETTINGS_PANELS[state.settings] ?? SETTINGS_PANELS["1"]
                return <Content />
              })()
            : null}
        </div>
      </div>
      <PrototypeSwitcher onChange={update} state={state} />
    </>
  )
}
