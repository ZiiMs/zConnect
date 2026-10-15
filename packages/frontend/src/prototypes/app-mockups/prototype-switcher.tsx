/**
 * PROTOTYPE (throwaway) — floating variant switcher.
 *
 * One bar, three axes: the arrows walk the primary axis (layout, or the
 * sign-in variant on that screen), and the chips jump straight to a screen or
 * a theme. Deliberately high-contrast and pill-shaped so it never reads as
 * part of a design being judged. Dev-only.
 */
import { cn } from "cn"
import { useEffect } from "react"
import { Glyph } from "./atoms"
import {
  LAYOUTS,
  MODES,
  SCREENS,
  SIGNIN_VARIANTS,
  THEMES,
  type ThemeKey,
} from "./prototype-config"
import { type ProtoState, stepVariant } from "./use-proto-params"

/** Representative swatches, mirroring each theme's --primary. */
const SWATCH: Record<ThemeKey, string> = {
  neutral: "oklch(0.21 0.006 285.885)",
  slate: "oklch(0.51 0.16 262)",
  violet: "oklch(0.54 0.22 296)",
  sand: "oklch(0.5 0.12 45)",
  mono: "oklch(0.78 0.17 150)",
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return (
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  )
}

export function PrototypeSwitcher({
  state,
  onChange,
}: {
  state: ProtoState
  onChange: (patch: Partial<ProtoState>) => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      if (event.key === "ArrowRight") {
        event.preventDefault()
        onChange(stepVariant(state, 1))
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        onChange(stepVariant(state, -1))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [state, onChange])

  const onSignin = state.screen === "signin"
  const variantLabel = onSignin
    ? `${state.signin} · ${SIGNIN_VARIANTS.find((item) => item.key === state.signin)?.name}`
    : `${state.layout} · ${LAYOUTS.find((item) => item.key === state.layout)?.name}`
  const axisName = onSignin ? "Sign-in variant" : "Layout"

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-full border border-background/20 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <span className="proto-mono hidden pl-2 text-[10px] uppercase tracking-widest opacity-60 sm:block">
          prototype
        </span>
        <button
          aria-label={`Previous ${axisName.toLowerCase()}`}
          className="grid size-6 place-items-center rounded-full hover:bg-background/15"
          onClick={() => onChange(stepVariant(state, -1))}
          type="button"
        >
          <Glyph className="size-3.5" name="chevronLeft" />
        </button>
        <span className="min-w-40 text-center text-xs">
          <span className="opacity-60">{axisName}: </span>
          {variantLabel}
        </span>
        <button
          aria-label={`Next ${axisName.toLowerCase()}`}
          className="grid size-6 place-items-center rounded-full hover:bg-background/15"
          onClick={() => onChange(stepVariant(state, 1))}
          type="button"
        >
          <Glyph className="size-3.5" name="chevronRight" />
        </button>

        <span className="hidden h-4 w-px bg-background/25 sm:block" />

        <div className="flex items-center gap-0.5 rounded-full bg-background/10 p-0.5">
          {SCREENS.map((screen) => (
            <button
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                state.screen === screen.key
                  ? "bg-background text-foreground"
                  : "opacity-70 hover:opacity-100"
              )}
              key={screen.key}
              onClick={() => onChange({ screen: screen.key })}
              type="button"
            >
              {screen.name}
            </button>
          ))}
        </div>

        <span className="hidden h-4 w-px bg-background/25 sm:block" />

        <div className="flex items-center gap-1 pr-1">
          {THEMES.map((theme) => (
            <button
              aria-label={`Theme: ${theme.name}`}
              className={cn(
                "size-4 rounded-full border",
                state.theme === theme.key
                  ? "border-background"
                  : "border-background/30"
              )}
              key={theme.key}
              onClick={() => onChange({ theme: theme.key })}
              style={{ backgroundColor: SWATCH[theme.key] }}
              title={`${theme.name} — ${theme.note}`}
              type="button"
            />
          ))}
          <span className="px-1 text-[10px] opacity-70">
            {THEMES.find((theme) => theme.key === state.theme)?.name}
          </span>
          {MODES.map((mode) => (
            <button
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] capitalize",
                state.mode === mode
                  ? "bg-background text-foreground"
                  : "opacity-70"
              )}
              key={mode}
              onClick={() => onChange({ mode })}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>

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
