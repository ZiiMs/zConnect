/**
 * PROTOTYPE (throwaway) — dev-only theme overlay for the REAL app.
 *
 * Axes, each opt-in by presence of its own query param:
 *
 *   ?theme= or ?style= / ?color=   which identity the app wears
 *   ?mode=                         light or dark, without touching the identity
 *
 * Sub-shape A of the UI prototype rules: the variants belong on the real
 * screens, not on mockups. The app's colours are all CSS custom properties, and
 * the theme stylesheets target `html[data-proto-*]` (specificity 0,1,1) which
 * beats the app's own `:root` / `.dark` blocks — so the whole app re-skins with
 * no component changes.
 *
 * Each axis applies only when its own param is present, so `?mode=light` leaves
 * the shipped identity alone instead of dragging the composable style/color axes
 * in with it.
 *
 * Dev-only: `main.tsx` imports this behind `import.meta.env.DEV`, so the module,
 * its CSS and its fonts are dropped from the production build.
 */
import { cn } from "cn"
import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/inter"
import "./themes.css"
import "./themes.registry.css"
import { Glyph } from "./atoms"
import {
  MODES,
  type ModeKey,
  THEME_COLORS,
  THEME_IDENTITIES,
  THEME_STYLES,
  type ThemeColorKey,
  type ThemeStyleKey,
} from "./prototype-config"
import { REGISTRY_THEMES } from "./registry-themes"
import { applyThemeFonts } from "./theme-fonts"

export interface RealTheme {
  /** A registry theme key, or "" to use the composable axes. */
  theme: string
  style: ThemeStyleKey
  color: ThemeColorKey
  mode: ModeKey
}

/** What ships today — Darkmatter folded into `index.css`, mono × neutral, dark. */
const SHIPPED: RealTheme = {
  theme: "",
  style: "mono",
  color: "neutral",
  mode: "dark",
}

const KEYS = ["theme", "style", "color", "mode"] as const

interface Axes {
  mode: boolean
  scheme: boolean
}

const STYLE_KEYS = THEME_STYLES.map((item) => item.key)
const COLOR_KEYS = THEME_COLORS.map((item) => item.key)

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

export function readTheme(): RealTheme {
  const params = new URLSearchParams(window.location.search)
  return {
    theme: pick(
      REGISTRY_THEMES.map((item) => item.key),
      params.get("theme"),
      SHIPPED.theme
    ),
    style: pick(STYLE_KEYS, params.get("style"), SHIPPED.style),
    color: pick(COLOR_KEYS, params.get("color"), SHIPPED.color),
    mode: pick(MODES, params.get("mode"), SHIPPED.mode),
  }
}

/** Which axes the URL actually asked for. */
function activeAxes(): Axes {
  const params = new URLSearchParams(window.location.search)
  return {
    mode: params.has("mode"),
    scheme: params.has("theme") || params.has("style") || params.has("color"),
  }
}

function paint(next: RealTheme, axes: Axes) {
  const root = document.documentElement

  if (axes.mode) {
    root.dataset.protoMode = next.mode
    root.classList.toggle("dark", next.mode === "dark")
    root.style.colorScheme = next.mode
  } else {
    delete root.dataset.protoMode
  }

  if (axes.scheme) {
    if (next.theme === "") {
      root.dataset.protoStyle = next.style
      root.dataset.protoColor = next.color
      delete root.dataset.protoTheme
    } else {
      root.dataset.protoTheme = next.theme
      delete root.dataset.protoStyle
      delete root.dataset.protoColor
    }
    applyThemeFonts(next.theme)
  } else {
    delete root.dataset.protoStyle
    delete root.dataset.protoColor
    delete root.dataset.protoTheme
    applyThemeFonts("")
  }
}

/**
 * The mode class belongs to `ThemeProvider`, which reads localStorage "theme"
 * and defaults to dark. Stripping it outright would leave the app light no
 * matter what the user picked, so restore it from the same source. This is a
 * dev-only copy of that logic — it exists because the overlay borrows the class
 * while `?mode=` is set, and has to hand it back.
 */
function restoreProviderMode() {
  const root = document.documentElement
  const stored = localStorage.getItem("theme")
  const dark =
    stored === "dark" ||
    (stored !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", dark)
  root.classList.toggle("light", !dark)
  root.style.removeProperty("color-scheme")
}

function unpaint() {
  paint(SHIPPED, { mode: false, scheme: false })
  restoreProviderMode()
}

function overlayActive(): boolean {
  const params = new URLSearchParams(window.location.search)
  return KEYS.some((key) => params.has(key))
}

/**
 * The tokens `src/index.css` owns, in its own order. Excludes the `--proto-*`
 * extras, which exist only for the mockups.
 */
const APP_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "radius",
] as const

function blockFor(mode: ModeKey, heading: string): string {
  const root = document.documentElement
  const previous = root.dataset.protoMode
  root.dataset.protoMode = mode
  const computed = getComputedStyle(root)
  const body = APP_TOKENS.map(
    (token) =>
      `  --${token}: ${computed.getPropertyValue(`--${token}`).trim()};`
  )
  if (previous !== undefined) {
    root.dataset.protoMode = previous
  }
  return `${heading} {\n${body.join("\n")}\n}`
}

/** The `index.css` patch for the current identity — the whole fold-in. */
export function tokenBlock(): string {
  const computed = getComputedStyle(document.documentElement)
  const stack = computed.getPropertyValue("--proto-body-font").trim()
  return [
    ":root / .dark for src/index.css. Light first, then dark.",
    "",
    "/* The app pins its base font in `@theme inline`, so a variable override",
    `   cannot reach it. Set --font-sans there to: ${stack}`,
    "   (leave it alone to keep the current monospace.) */",
    "",
    blockFor("light", ":root"),
    "",
    blockFor("dark", ".dark"),
  ].join("\n")
}

/** The walk order for ← / →: every registry theme, then the composable picks. */
type Candidate =
  | { kind: "theme"; key: string }
  | { kind: "composable"; index: number }

const CANDIDATES: readonly Candidate[] = [
  ...REGISTRY_THEMES.map((item) => ({ kind: "theme" as const, key: item.key })),
  ...THEME_IDENTITIES.map((_item, index) => ({
    kind: "composable" as const,
    index,
  })),
]

function candidateIndex(theme: RealTheme): number {
  if (theme.theme !== "") {
    return CANDIDATES.findIndex(
      (item) => item.kind === "theme" && item.key === theme.theme
    )
  }
  return CANDIDATES.findIndex((item) => {
    if (item.kind !== "composable") {
      return false
    }
    const identity = THEME_IDENTITIES[item.index]
    return (
      identity !== undefined &&
      identity.style === theme.style &&
      identity.color === theme.color &&
      identity.mode === theme.mode
    )
  })
}

function labelFor(theme: RealTheme): string {
  if (theme.theme !== "") {
    const match = REGISTRY_THEMES.find((item) => item.key === theme.theme)
    return match?.label ?? theme.theme
  }
  const match = THEME_IDENTITIES.find(
    (item) =>
      item.style === theme.style &&
      item.color === theme.color &&
      item.mode === theme.mode
  )
  return match?.name ?? `${theme.style} × ${theme.color}`
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-14 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-widest opacity-60">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px]",
        on
          ? "bg-background text-foreground"
          : "opacity-70 hover:bg-background/10 hover:opacity-100"
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

export function DevThemeBar() {
  const [theme, setTheme] = useState<RealTheme>(readTheme)
  const [axes, setAxes] = useState<Axes>(activeAxes)
  const [tune, setTune] = useState(false)
  const [copied, setCopied] = useState(false)

  const active = overlayActive()

  useEffect(() => {
    if (active) {
      paint(theme, axes)
    } else {
      unpaint()
    }
  }, [active, axes, theme])

  // ThemeProvider also owns the `.dark` class and re-applies its own preference
  // on mount. While `?mode=` is present, that param is the authority.
  useEffect(() => {
    if (!active || !axes.mode) {
      return
    }
    const root = document.documentElement
    const want = theme.mode === "dark"
    let self = false
    const observer = new MutationObserver(() => {
      if (self) {
        return
      }
      if (root.classList.contains("dark") !== want) {
        self = true
        root.classList.toggle("dark", want)
        self = false
      }
    })
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [active, axes.mode, theme.mode])

  const commit = useCallback((patch: Partial<RealTheme>) => {
    setTheme((current) => {
      const next = { ...current, ...patch }
      const params = new URLSearchParams(window.location.search)
      for (const key of KEYS) {
        const value = next[key]
        if (value === "") {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      window.history.replaceState(null, "", `?${params.toString()}`)
      setAxes(activeAxes())
      return next
    })
  }, [])

  const step = (delta: number) => {
    const index = candidateIndex(theme)
    const base = index === -1 ? 0 : index
    const next =
      CANDIDATES[(base + delta + CANDIDATES.length) % CANDIDATES.length]
    if (!next) {
      return
    }
    if (next.kind === "theme") {
      commit({ theme: next.key })
      return
    }
    const identity = THEME_IDENTITIES[next.index]
    if (identity) {
      commit({
        theme: "",
        style: identity.style,
        color: identity.color,
        mode: identity.mode,
      })
    }
  }

  const copy = () => {
    void navigator.clipboard.writeText(tokenBlock()).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  const stop = () => {
    const params = new URLSearchParams(window.location.search)
    for (const key of KEYS) {
      params.delete(key)
    }
    const query = params.toString()
    window.history.replaceState(null, "", query === "" ? "?" : `?${query}`)
    setAxes(activeAxes())
    setTheme(readTheme())
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[100] flex flex-col items-center gap-2 px-3">
      {tune ? (
        <div className="pointer-events-auto flex max-h-[55svh] w-full max-w-3xl flex-col gap-2 overflow-auto rounded-2xl border border-background/20 bg-foreground px-4 py-3 text-background shadow-2xl">
          <Row label="Registry">
            <Chip
              on={axes.scheme && theme.theme === ""}
              onClick={() => commit({ theme: "" })}
              title="Compose from the style × color axes instead"
            >
              composable
            </Chip>
            {REGISTRY_THEMES.map((item) => (
              <Chip
                key={item.key}
                on={theme.theme === item.key}
                onClick={() => commit({ theme: item.key })}
                title={`${item.label} — radius ${item.radius}${
                  item.fonts.length > 0 ? `, ${item.fonts.length} font(s)` : ""
                }`}
              >
                {item.label}
              </Chip>
            ))}
          </Row>
          <Row label="Style">
            {THEME_STYLES.map((item) => (
              <Chip
                key={item.key}
                on={theme.theme === "" && theme.style === item.key}
                onClick={() => commit({ theme: "", style: item.key })}
                title={item.note}
              >
                {item.name}
              </Chip>
            ))}
          </Row>
          <Row label="Color">
            {THEME_COLORS.map((item) => (
              <Chip
                key={item.key}
                on={theme.theme === "" && theme.color === item.key}
                onClick={() => commit({ theme: "", color: item.key })}
                title={item.note}
              >
                {item.name}
              </Chip>
            ))}
          </Row>
          <Row label="Mode">
            {MODES.map((item) => (
              <Chip
                key={item}
                on={theme.mode === item}
                onClick={() => commit({ mode: item })}
              >
                {item}
              </Chip>
            ))}
          </Row>
          <Row label="Shortlist">
            {THEME_IDENTITIES.map((item) => (
              <Chip
                key={item.key}
                on={
                  theme.theme === "" &&
                  item.style === theme.style &&
                  item.color === theme.color &&
                  item.mode === theme.mode
                }
                onClick={() =>
                  commit({
                    theme: "",
                    style: item.style,
                    color: item.color,
                    mode: item.mode,
                  })
                }
                title={item.note}
              >
                {item.name}
              </Chip>
            ))}
          </Row>
        </div>
      ) : null}
      <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-full border border-background/20 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <span className="hidden pl-2 font-mono text-[10px] uppercase tracking-widest opacity-60 sm:block">
          theme
        </span>
        <button
          aria-label="Previous identity"
          className="grid size-6 place-items-center rounded-full hover:bg-background/15"
          onClick={() => step(-1)}
          type="button"
        >
          <Glyph className="size-3.5" name="chevronLeft" />
        </button>
        <span className="min-w-44 text-center text-xs">
          {active ? (
            <>
              <span className="opacity-60">
                {axes.scheme ? "identity: " : "mode: "}
              </span>
              {axes.scheme ? labelFor(theme) : theme.mode}
            </>
          ) : (
            <span className="opacity-70">app as shipped — pick to start</span>
          )}
        </span>
        <button
          aria-label="Next identity"
          className="grid size-6 place-items-center rounded-full hover:bg-background/15"
          onClick={() => step(1)}
          type="button"
        >
          <Glyph className="size-3.5" name="chevronRight" />
        </button>
        <span className="hidden h-4 w-px bg-background/25 sm:block" />
        <Chip on={tune} onClick={() => setTune((value) => !value)}>
          Tune
        </Chip>
        {active ? (
          <>
            <button
              className="rounded-full bg-background/10 px-2 py-0.5 text-[11px] opacity-80 hover:opacity-100"
              onClick={copy}
              title="Copy the :root / .dark blocks for src/index.css"
              type="button"
            >
              {copied ? "copied" : "copy index.css"}
            </button>
            <button
              className="rounded-full px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100"
              onClick={stop}
              title="Clear every variant param"
              type="button"
            >
              off
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

const container = document.createElement("div")
container.id = "dev-theme-root"
document.body.appendChild(container)
createRoot(container).render(<DevThemeBar />)
