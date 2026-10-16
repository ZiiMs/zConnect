/**
 * PROTOTYPE (throwaway) — URL as the state store.
 *
 * No router in this app, so the mockups read their axes straight from the
 * query string and write back with `history.replaceState`. Every combination
 * is reload-stable and shareable, e.g.
 * `?screen=issues&nav=1&issues=3&style=mono&color=forest&mode=dark`.
 *
 * Legacy URLs from the first round (`?layout=A&theme=mono&signin=S1`) still
 * resolve: `layout` maps onto the per-surface pickers, `theme` onto both
 * style and color, `signin=S3` onto `signin=3`.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  BOARD_VARIANTS,
  DEFAULT_BOARD,
  DEFAULT_COLOR,
  DEFAULT_DETAIL,
  DEFAULT_ISSUES,
  DEFAULT_MODE,
  DEFAULT_NAV,
  DEFAULT_SCREEN,
  DEFAULT_SETTINGS,
  DEFAULT_SIGNIN,
  DEFAULT_STYLE,
  DETAIL_VARIANTS,
  ISSUES_VARIANTS,
  MODES,
  type ModeKey,
  NAV_VARIANTS,
  SCREENS,
  type ScreenKey,
  SETTINGS_VARIANTS,
  SIGNIN_VARIANTS,
  THEME_COLORS,
  THEME_STYLES,
  type ThemeColorKey,
  type ThemeStyleKey,
  type VariantKey,
} from "./prototype-config"
import { REGISTRY_THEMES } from "./registry-themes"

export interface ProtoState {
  screen: ScreenKey
  nav: VariantKey
  issues: VariantKey
  board: VariantKey
  detail: VariantKey
  settings: VariantKey
  signin: VariantKey
  /** A registry theme key, or "" for the composable style × color axes. */
  theme: string
  style: ThemeStyleKey
  color: ThemeColorKey
  mode: ModeKey
}

const KEYS = [
  "screen",
  "nav",
  "issues",
  "board",
  "detail",
  "settings",
  "signin",
  "theme",
  "style",
  "color",
  "mode",
] as const

const VARIANT_KEYS: readonly VariantKey[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
]

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

const screenKeys = SCREENS.map((item) => item.key)
const styleKeys = THEME_STYLES.map((item) => item.key)
const colorKeys = THEME_COLORS.map((item) => item.key)
/** "" is the composable style × color mode; the rest are registry themes. */
const themeKeys = ["", ...REGISTRY_THEMES.map((item) => item.key)]

/** The variant list each surface axis walks with the ← / → arrows. */
const AXIS_TABLE: Record<string, readonly { key: string }[]> = {
  nav: NAV_VARIANTS,
  issues: ISSUES_VARIANTS,
  board: BOARD_VARIANTS,
  detail: DETAIL_VARIANTS,
  settings: SETTINGS_VARIANTS,
  signin: SIGNIN_VARIANTS,
}

const LEGACY_LAYOUT: Record<string, Partial<ProtoState>> = {
  A: { nav: "1", issues: "1", board: "1", detail: "1", settings: "1" },
  B: { nav: "2", issues: "2", board: "2", detail: "2", settings: "2" },
  C: { nav: "3", issues: "3", board: "3", detail: "3", settings: "3" },
  D: { nav: "4", issues: "4", board: "4", detail: "4", settings: "4" },
}

const LEGACY_THEME: Record<string, Partial<ProtoState>> = {
  neutral: { style: "neutral", color: "neutral" },
  slate: { style: "slate", color: "blue" },
  violet: { style: "violet", color: "violet" },
  sand: { style: "sand", color: "clay" },
  mono: { style: "mono", color: "terminal" },
}

export function readProtoState(): ProtoState {
  const params = new URLSearchParams(window.location.search)
  const legacyLayout = params.get("layout")
  const legacyTheme = params.get("theme")
  const legacySignin = params.get("signin")
  const legacy: Partial<ProtoState> = {
    ...(legacyLayout !== null ? (LEGACY_LAYOUT[legacyLayout] ?? {}) : {}),
    ...(legacyTheme !== null ? (LEGACY_THEME[legacyTheme] ?? {}) : {}),
  }
  if (legacySignin !== null && /^S[1-8]$/.test(legacySignin)) {
    legacy.signin = legacySignin.slice(1) as VariantKey
  }
  return {
    screen: pick(screenKeys, params.get("screen"), DEFAULT_SCREEN),
    nav: pick(VARIANT_KEYS, params.get("nav"), legacy.nav ?? DEFAULT_NAV),
    issues: pick(
      VARIANT_KEYS,
      params.get("issues"),
      legacy.issues ?? DEFAULT_ISSUES
    ),
    board: pick(
      VARIANT_KEYS,
      params.get("board"),
      legacy.board ?? DEFAULT_BOARD
    ),
    detail: pick(
      VARIANT_KEYS,
      params.get("detail"),
      legacy.detail ?? DEFAULT_DETAIL
    ),
    settings: pick(
      VARIANT_KEYS,
      params.get("settings"),
      legacy.settings ?? DEFAULT_SETTINGS
    ),
    signin: pick(
      VARIANT_KEYS,
      params.get("signin"),
      legacy.signin ?? DEFAULT_SIGNIN
    ),
    theme: pick(themeKeys, params.get("theme"), ""),
    style: pick(styleKeys, params.get("style"), legacy.style ?? DEFAULT_STYLE),
    color: pick(colorKeys, params.get("color"), legacy.color ?? DEFAULT_COLOR),
    mode: pick(MODES, params.get("mode"), DEFAULT_MODE),
  }
}

function toQuery(state: ProtoState): string {
  const params = new URLSearchParams()
  for (const key of KEYS) {
    const value = state[key]
    // "" means "use the composable axes" — leaving it out keeps URLs clean.
    if (value === "") {
      continue
    }
    params.set(key, value)
  }
  return params.toString()
}

/** A link that switches axes while keeping the rest. */
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

/**
 * The variant axis the ← / → arrows walk: whatever surface the current
 * screen shows (issues/board/detail/settings/signin).
 */
export function activeVariantKey(state: ProtoState): keyof ProtoState {
  if (state.screen === "issues") return "issues"
  if (state.screen === "board") return "board"
  if (state.screen === "issue") return "detail"
  if (state.screen === "settings") return "settings"
  return "signin"
}

export function stepVariant(
  state: ProtoState,
  delta: number
): Partial<ProtoState> {
  const axis = activeVariantKey(state)
  const keys: string[] = (AXIS_TABLE[axis] ?? []).map((item) => item.key)
  return {
    [axis]: cycleKey(keys, String(state[axis]), delta),
  } as Partial<ProtoState>
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
