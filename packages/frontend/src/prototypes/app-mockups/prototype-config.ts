/**
 * PROTOTYPE (throwaway) — the axes the mockups are reviewed on.
 *
 *   screen                  which surface (issues, board, detail, settings, signin)
 *   nav/issues/board/detail/settings/signin   per-surface variant, 8 each (1-8)
 *   style                   structural theme style, 8 keys (radius/type/grid only)
 *   color                   palette, 8 keys (all color tokens)
 *   mode                    light / dark
 *
 * Style and color are fully independent: any style composes with any color in
 * either mode (8 × 8 × 2 = 128 combos). Style owns radius, type and grid;
 * color owns every color token. See `themes.css`.
 */

export const SCREENS = [
  { key: "issues", name: "Issues" },
  { key: "board", name: "Board" },
  { key: "issue", name: "Issue detail" },
  { key: "settings", name: "Settings" },
  { key: "signin", name: "Sign in" },
] as const

export type ScreenKey = (typeof SCREENS)[number]["key"]

/** Per-surface variant keys: "1".."8" for every pickable surface. */
const VARIANT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const

export type VariantKey = (typeof VARIANT_KEYS)[number]

export const VARIANTS: readonly {
  key: VariantKey
  name: string
}[] = [
  { key: "1", name: "1" },
  { key: "2", name: "2" },
  { key: "3", name: "3" },
  { key: "4", name: "4" },
  { key: "5", name: "5" },
  { key: "6", name: "6" },
  { key: "7", name: "7" },
  { key: "8", name: "8" },
]

export const NAV_VARIANTS: readonly { key: VariantKey; name: string }[] = [
  { key: "1", name: "Wide rail" },
  { key: "2", name: "Top bar" },
  { key: "3", name: "Project rail" },
  { key: "4", name: "Icon rail" },
  { key: "5", name: "Double rail" },
  { key: "6", name: "Collapsible" },
  { key: "7", name: "Command bar" },
  { key: "8", name: "Bottom tabs" },
]

export const ISSUES_VARIANTS: readonly { key: VariantKey; name: string }[] = [
  { key: "1", name: "Dense grouped" },
  { key: "2", name: "Roomy cards" },
  { key: "3", name: "Table" },
  { key: "4", name: "Compact rows" },
  { key: "5", name: "Kanban-ish swimlanes" },
  { key: "6", name: "Priority stacks" },
  { key: "7", name: "Timeline" },
  { key: "8", name: "Master–detail" },
]

export const BOARD_VARIANTS: readonly { key: VariantKey; name: string }[] = [
  { key: "1", name: "Compact" },
  { key: "2", name: "Roomy" },
  { key: "3", name: "Swimlanes by priority" },
  { key: "4", name: "WIP-count header" },
  { key: "5", name: "Minimal cards" },
  { key: "6", name: "Rich cards" },
  { key: "7", name: "Horizontal swimlanes" },
  { key: "8", name: "Grouped by assignee" },
]

export const DETAIL_VARIANTS: readonly { key: VariantKey; name: string }[] = [
  { key: "1", name: "Side pane" },
  { key: "2", name: "Full page" },
  { key: "3", name: "Hero header" },
  { key: "4", name: "Two column" },
  { key: "5", name: "Timeline first" },
  { key: "6", name: "Properties rail" },
  { key: "7", name: "Minimal" },
  { key: "8", name: "Split checklist" },
]

export const SETTINGS_VARIANTS: readonly { key: VariantKey; name: string }[] = [
  { key: "1", name: "Tabbed form" },
  { key: "2", name: "Top tabs" },
  { key: "3", name: "Master–detail" },
  { key: "4", name: "Setting rows" },
  { key: "5", name: "Cards grid" },
  { key: "6", name: "Sidebar sections" },
  { key: "7", name: "Dense table" },
  { key: "8", name: "Wizard" },
]

export const SIGNIN_VARIANTS: readonly { key: VariantKey; name: string }[] = [
  { key: "1", name: "Split panel" },
  { key: "2", name: "Centred card" },
  { key: "3", name: "Card over preview" },
  { key: "4", name: "Single column" },
  { key: "5", name: "Prompt" },
  { key: "6", name: "Side sheet" },
  { key: "7", name: "Stacked steps" },
  { key: "8", name: "Branded gradient" },
]

export const THEME_STYLES = [
  { key: "neutral", name: "Neutral", note: "base radius, Inter, no grid" },
  { key: "slate", name: "Slate", note: "tight radii, dotted grid" },
  { key: "violet", name: "Violet", note: "soft radii, tight tracking" },
  { key: "sand", name: "Paper", note: "serif headings, square grid" },
  { key: "mono", name: "Terminal", note: "monospace, square, line grid" },
  { key: "rounded", name: "Rounded", note: "extra-soft radii, airy" },
  { key: "compact", name: "Compact", note: "small radii, dense" },
  { key: "minimal", name: "Minimal", note: "quiet, thin, almost borderless" },
] as const

export type ThemeStyleKey = (typeof THEME_STYLES)[number]["key"]

export const THEME_COLORS = [
  { key: "neutral", name: "Neutral", note: "zinc" },
  { key: "blue", name: "Blue", note: "cool SaaS blue" },
  { key: "violet", name: "Violet", note: "deep indigo" },
  { key: "clay", name: "Clay", note: "warm paper" },
  { key: "forest", name: "Forest", note: "green" },
  { key: "ocean", name: "Ocean", note: "teal cyan" },
  { key: "rose", name: "Rose", note: "pink red" },
  { key: "terminal", name: "Terminal", note: "green phosphor" },
] as const

export type ThemeColorKey = (typeof THEME_COLORS)[number]["key"]

export const MODES = ["light", "dark"] as const

export type ModeKey = (typeof MODES)[number]

export const DEFAULT_SCREEN: ScreenKey = "issues"
export const DEFAULT_NAV: VariantKey = "1"
export const DEFAULT_ISSUES: VariantKey = "1"
export const DEFAULT_BOARD: VariantKey = "2"
export const DEFAULT_DETAIL: VariantKey = "1"
export const DEFAULT_SETTINGS: VariantKey = "1"
export const DEFAULT_SIGNIN: VariantKey = "1"
export const DEFAULT_STYLE: ThemeStyleKey = "neutral"
export const DEFAULT_COLOR: ThemeColorKey = "neutral"
export const DEFAULT_MODE: ModeKey = "light"
