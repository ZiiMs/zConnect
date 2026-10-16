/**
 * PROTOTYPE (throwaway) — floating variant switcher.
 *
 * Ten axes now (screen + six per-surface pickers + style + color + mode), so
 * the bar is two-tier: a slim pill (arrows, screen chips, tune toggle) and
 * an expandable tune panel with a row per axis. High-contrast pill so it
 * never reads as part of a design being judged. Dev-only.
 */

import { cn } from "cn"
import { useState } from "react"
import { Glyph } from "./atoms"
import {
  BOARD_VARIANTS,
  DETAIL_VARIANTS,
  ISSUES_VARIANTS,
  NAV_VARIANTS,
  SETTINGS_VARIANTS,
  SIGNIN_VARIANTS,
  THEME_COLORS,
  THEME_STYLES,
  type VariantKey,
} from "./prototype-config"
import { REGISTRY_THEMES } from "./registry-themes"
import {
  activeVariantKey,
  type ProtoState,
  stepVariant,
} from "./use-proto-params"

/** Representative swatches for each color (light-mode primary). */
const SWATCH: Record<string, string> = {
  neutral: "oklch(0.21 0.006 285.885)",
  graphite: "oklch(0.175 0.01 265)",
  oat: "oklch(0.3 0.022 78)",
  blue: "oklch(0.51 0.16 262)",
  indigo: "oklch(0.46 0.19 272)",
  violet: "oklch(0.54 0.22 296)",
  clay: "oklch(0.5 0.12 45)",
  forest: "oklch(0.46 0.14 155)",
  ocean: "oklch(0.52 0.13 222)",
  rose: "oklch(0.55 0.2 12)",
  terminal: "oklch(0.45 0.12 155)",
}

const SCREENS = [
  { key: "issues", name: "Issues" },
  { key: "board", name: "Board" },
  { key: "issue", name: "Detail" },
  { key: "settings", name: "Settings" },
  { key: "signin", name: "Sign in" },
] as const

function variantName(axis: string, key: VariantKey): string {
  const table: Record<string, readonly { key: string; name: string }[]> = {
    nav: NAV_VARIANTS,
    issues: ISSUES_VARIANTS,
    board: BOARD_VARIANTS,
    detail: DETAIL_VARIANTS,
    settings: SETTINGS_VARIANTS,
    signin: SIGNIN_VARIANTS,
  }
  return table[axis]?.find((item) => item.key === key)?.name ?? key
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="proto-mono w-16 shrink-0 text-[10px] uppercase tracking-widest opacity-60">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

function VariantButtons({
  axis,
  current,
  onChange,
}: {
  axis: "nav" | "issues" | "board" | "detail" | "settings" | "signin"
  current: VariantKey
  onChange: (patch: Partial<ProtoState>) => void
}) {
  const table = {
    nav: NAV_VARIANTS,
    issues: ISSUES_VARIANTS,
    board: BOARD_VARIANTS,
    detail: DETAIL_VARIANTS,
    settings: SETTINGS_VARIANTS,
    signin: SIGNIN_VARIANTS,
  }[axis]
  return (
    <>
      {table.map((item) => (
        <button
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px]",
            current === item.key
              ? "bg-background text-foreground"
              : "opacity-70 hover:bg-background/10 hover:opacity-100"
          )}
          key={item.key}
          onClick={() => onChange({ [axis]: item.key } as Partial<ProtoState>)}
          title={`${item.key} · ${item.name}`}
          type="button"
        >
          {item.key}
        </button>
      ))}
      <span className="px-1 text-[11px] opacity-70">
        {variantName(axis, current)}
      </span>
    </>
  )
}

export function PrototypeSwitcher({
  state,
  onChange,
}: {
  state: ProtoState
  onChange: (patch: Partial<ProtoState>) => void
}) {
  const [tune, setTune] = useState(false)
  const axis = activeVariantKey(state)
  const axisLabel =
    axis === "issues"
      ? "Issues"
      : axis === "board"
        ? "Board"
        : axis === "detail"
          ? "Detail"
          : axis === "settings"
            ? "Settings"
            : "Sign in"

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 px-3">
      {tune ? (
        <div className="pointer-events-auto flex max-h-[40svh] w-full max-w-2xl flex-col gap-2 overflow-auto rounded-2xl border border-background/20 bg-foreground px-4 py-3 text-background shadow-2xl">
          <Row label="Nav">
            <VariantButtons
              axis="nav"
              current={state.nav}
              onChange={onChange}
            />
          </Row>
          <Row label={axisLabel}>
            <VariantButtons
              axis={
                axis as "issues" | "board" | "detail" | "settings" | "signin"
              }
              current={state[axis] as VariantKey}
              onChange={onChange}
            />
          </Row>
          <Row label="Registry">
            <button
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                state.theme === ""
                  ? "bg-background text-foreground"
                  : "opacity-70 hover:bg-background/10 hover:opacity-100"
              )}
              onClick={() => onChange({ theme: "" })}
              title="Compose from the style × color axes instead"
              type="button"
            >
              composable
            </button>
            {REGISTRY_THEMES.map((item) => (
              <button
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  state.theme === item.key
                    ? "bg-background text-foreground"
                    : "opacity-70 hover:bg-background/10 hover:opacity-100"
                )}
                key={item.key}
                onClick={() => onChange({ theme: item.key })}
                title={`${item.label} — radius ${item.radius}`}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </Row>
          <Row label="Style">
            {THEME_STYLES.map((item) => (
              <button
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  state.style === item.key
                    ? "bg-background text-foreground"
                    : "opacity-70 hover:bg-background/10 hover:opacity-100"
                )}
                key={item.key}
                onClick={() => onChange({ style: item.key })}
                title={item.note}
                type="button"
              >
                {item.name}
              </button>
            ))}
          </Row>
          <Row label="Color">
            {THEME_COLORS.map((item) => (
              <button
                aria-label={`Color: ${item.name}`}
                className={cn(
                  "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]",
                  state.color === item.key
                    ? "bg-background/15"
                    : "opacity-70 hover:opacity-100"
                )}
                key={item.key}
                onClick={() => onChange({ color: item.key })}
                title={`${item.name} — ${item.note}`}
                type="button"
              >
                <span
                  className="size-3.5 rounded-full border border-background/40"
                  style={{ backgroundColor: SWATCH[item.key] }}
                />
                {state.color === item.key ? item.name : null}
              </button>
            ))}
            <span className="flex items-center gap-1 pl-1">
              {(["light", "dark"] as const).map((mode) => (
                <button
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] capitalize",
                    state.mode === mode
                      ? "bg-background text-foreground"
                      : "opacity-70 hover:opacity-100"
                  )}
                  key={mode}
                  onClick={() => onChange({ mode })}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </span>
          </Row>
        </div>
      ) : null}
      <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-full border border-background/20 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <span className="proto-mono hidden pl-2 text-[10px] uppercase tracking-widest opacity-60 sm:block">
          prototype
        </span>
        <button
          aria-label={`Previous ${axisLabel.toLowerCase()} variant`}
          className="grid size-6 place-items-center rounded-full hover:bg-background/15"
          onClick={() => onChange(stepVariant(state, -1))}
          type="button"
        >
          <Glyph className="size-3.5" name="chevronLeft" />
        </button>
        <span className="min-w-40 text-center text-xs">
          <span className="opacity-60">{axisLabel}: </span>
          {state[axis]} · {variantName(axis, state[axis] as VariantKey)}
        </span>
        <button
          aria-label={`Next ${axisLabel.toLowerCase()} variant`}
          className="grid size-6 place-items-center rounded-full hover:bg-background/15"
          onClick={() => onChange(stepVariant(state, 1))}
          type="button"
        >
          <Glyph className="size-3.5" name="chevronRight" />
        </button>
        <span className="hidden h-4 w-px bg-background/25 sm:block" />
        <div className="flex items-center gap-0.5 rounded-full bg-background/10 p-0.5">
          {SCREENS.map((screen) => {
            const active =
              state.screen === screen.key ||
              (screen.key === "issue" && state.screen === "issue")
            return (
              <button
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  active
                    ? "bg-background text-foreground"
                    : "opacity-70 hover:opacity-100"
                )}
                key={screen.key}
                onClick={() =>
                  onChange({
                    screen: screen.key as ProtoState["screen"],
                  })
                }
                type="button"
              >
                {screen.name}
              </button>
            )
          })}
        </div>
        <button
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px]",
            tune ? "bg-background text-foreground" : "opacity-70"
          )}
          onClick={() => setTune((value) => !value)}
          type="button"
        >
          Tune
        </button>
        <a
          className="flex items-center gap-1 rounded-full bg-background/10 px-2 py-0.5 text-[11px] opacity-80 hover:opacity-100"
          href="/index.html"
          title="Leave the prototype and open the real app"
        >
          <Glyph className="size-3" name="logOut" />
          app
        </a>
      </div>
    </div>
  )
}
