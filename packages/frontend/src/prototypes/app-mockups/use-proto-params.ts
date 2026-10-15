/**
 * PROTOTYPE (throwaway) — URL as the state store.
 *
 * There is no router in this app, so the mockups read their axes straight from
 * the query string and write back with `history.replaceState`. Every variant
 * is therefore reload-stable and shareable: send someone
 * `?layout=C&screen=issue&theme=mono&mode=dark`.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  DEFAULT_LAYOUT,
  DEFAULT_MODE,
  DEFAULT_SCREEN,
  DEFAULT_SIGNIN,
  DEFAULT_THEME,
  LAYOUTS,
  type LayoutKey,
  MODES,
  type ModeKey,
  SCREENS,
  type ScreenKey,
  SIGNIN_VARIANTS,
  type SigninKey,
  THEMES,
  type ThemeKey,
} from "./prototype-config"

export interface ProtoState {
  layout: LayoutKey
  screen: ScreenKey
  theme: ThemeKey
  mode: ModeKey
  signin: SigninKey
}

const KEYS = ["layout", "screen", "theme", "mode", "signin"] as const

function pick<T extends string>(
  values: readonly T[],
  raw: string | null,
  fallback: T
): T {
  if (raw !== null && (values as readonly string[]).includes(raw)) {
    return raw as T
  }
  return fallback
}

const layoutKeys = LAYOUTS.map((item) => item.key)
const screenKeys = SCREENS.map((item) => item.key)
const themeKeys = THEMES.map((item) => item.key)
const signinKeys = SIGNIN_VARIANTS.map((item) => item.key)

export function readProtoState(): ProtoState {
  const params = new URLSearchParams(window.location.search)
  return {
    layout: pick(layoutKeys, params.get("layout"), DEFAULT_LAYOUT),
    screen: pick(screenKeys, params.get("screen"), DEFAULT_SCREEN),
    theme: pick(themeKeys, params.get("theme"), DEFAULT_THEME),
    mode: pick(MODES, params.get("mode"), DEFAULT_MODE),
    signin: pick(signinKeys, params.get("signin"), DEFAULT_SIGNIN),
  }
}

function toQuery(state: ProtoState): string {
  const params = new URLSearchParams()
  for (const key of KEYS) {
    params.set(key, state[key])
  }
  return params.toString()
}

/** A link that switches one axis while keeping the rest. */
export function protoHref(patch: Partial<ProtoState>): string {
  return `?${toQuery({ ...readProtoState(), ...patch })}`
}

export function cycleKey<T extends string>(
  values: readonly T[],
  current: T,
  delta: number
): T {
  const index = values.indexOf(current)
  const next = (index + delta + values.length) % values.length
  return values[next] as T
}

const layoutByIndex = layoutKeys
const signinByIndex = signinKeys

/** The primary axis the ← / → arrows walk: layout, or sign-in on that screen. */
export function stepVariant(
  state: ProtoState,
  delta: number
): Partial<ProtoState> {
  if (state.screen === "signin") {
    return { signin: cycleKey(signinByIndex, state.signin, delta) }
  }
  return { layout: cycleKey(layoutByIndex, state.layout, delta) }
}

export function useProtoState(): [
  ProtoState,
  (patch: Partial<ProtoState>) => void,
] {
  const [state, setState] = useState<ProtoState>(readProtoState)
  const stateRef = useRef(state)
  stateRef.current = state

  const update = useCallback((patch: Partial<ProtoState>) => {
    const next = { ...stateRef.current, ...patch }
    stateRef.current = next
    window.history.replaceState(null, "", `?${toQuery(next)}`)
    setState(next)
  }, [])

  useEffect(() => {
    const onPop = () => setState(readProtoState())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  return [state, update]
}
