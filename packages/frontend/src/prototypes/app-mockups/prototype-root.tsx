/**
 * PROTOTYPE (throwaway) — entry component for `prototype.html`.
 *
 * Reads the axes out of the URL, keeps them on `<html>` as `data-proto-theme`
 * / `data-proto-mode`, and renders the chosen layout (or sign-in variant) plus
 * the floating switcher. Nothing here is imported by the app's own entry, so
 * the production bundle cannot contain it.
 */

import type { ReactElement } from "react"
import { useEffect } from "react"
import type { LayoutKey, ScreenKey } from "./prototype-config"
import { PrototypeSwitcher } from "./prototype-switcher"
import { useProtoState } from "./use-proto-params"
import { LayoutA } from "./variants/layout-a-rail"
import { LayoutB } from "./variants/layout-b-topbar"
import { LayoutC } from "./variants/layout-c-three-pane"
import { LayoutD } from "./variants/layout-d-dashboard"
import { SignIn } from "./variants/signin-variants"

const LAYOUTS: Record<
  LayoutKey,
  (props: { screen: ScreenKey }) => ReactElement
> = {
  A: LayoutA,
  B: LayoutB,
  C: LayoutC,
  D: LayoutD,
}

export function PrototypeRoot() {
  const [state, update] = useProtoState()

  useEffect(() => {
    const root = document.documentElement
    root.dataset.protoTheme = state.theme
    root.dataset.protoMode = state.mode
    root.classList.toggle("dark", state.mode === "dark")
    root.style.colorScheme = state.mode
  }, [state.theme, state.mode])

  const Layout = LAYOUTS[state.layout]

  return (
    <>
      {state.screen === "signin" ? (
        <SignIn variant={state.signin} />
      ) : (
        <Layout screen={state.screen} />
      )}
      <PrototypeSwitcher onChange={update} state={state} />
    </>
  )
}
