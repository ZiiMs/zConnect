/**
 * PROTOTYPE (throwaway) — the axes the mockups are reviewed on.
 *
 *   screen                  which surface (issues, board, detail, settings, signin)
 *   nav/issues/board/detail/settings/signin   per-surface variant, 8 each ("9" = the
 *                           Board's real-card board)
 *   cards                   Kanban Issue card density (A/B/C/all), on board "9"
 *   style                   structural theme style, 8 keys (radius/type/grid only)
 *   color                   palette, 11 keys (all color tokens)
 *   mode                    light / dark
 *
 * Style and color are fully independent: any style composes with any color in
 * either mode (8 × 11 × 2 = 176 combos). Style owns radius, type and grid;
 * color owns every color token. See `themes.css`. `THEME_IDENTITIES` narrows
 * the grid to the handful actually worth judging.
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

/** Board "9" is the real-card board, whose density is the `cards` axis. */
export type BoardKey = VariantKey | "9"

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

export const BOARD_VARIANTS: readonly { key: BoardKey; name: string }[] = [
  { key: "1", name: "Compact" },
  { key: "2", name: "Roomy" },
  { key: "3", name: "Swimlanes by priority" },
  { key: "4", name: "WIP-count header" },
  { key: "5", name: "Minimal cards" },
  { key: "6", name: "Rich cards" },
  { key: "7", name: "Horizontal swimlanes" },
  { key: "8", name: "Grouped by assignee" },
  { key: "9", name: "Issue cards (real, density toggle)" },
]

/**
 * The `cards` axis: the three Kanban Issue card densities under review
 * (handoff 2026-10-16, Q5 — density is the only axis), plus `all` to see
 * them side by side. Plugged into board "9". Pad/gap/tint are the whole
 * difference between the three; the card layout itself is the locked spec.
 */
export type DensityKey = "A" | "B" | "C"

export type CardKey = DensityKey | "all"

export const CARD_DENSITIES: readonly {
  key: DensityKey
  name: string
  pad: string
  gap: string
  tint: number
}[] = [
  { key: "A", name: "compact", pad: "p-2", gap: "gap-1", tint: 8 },
  { key: "B", name: "balanced", pad: "p-3", gap: "gap-1.5", tint: 12 },
  { key: "C", name: "roomy", pad: "p-4", gap: "gap-2", tint: 16 },
]

export const CARD_VARIANTS: readonly { key: CardKey; name: string }[] = [
  ...CARD_DENSITIES,
  { key: "all", name: "all three, side by side" },
]

/** Board key whose density comes from the `cards` axis. */
export const REAL_CARDS_BOARD: BoardKey = "9"

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
  { key: "graphite", name: "Graphite", note: "cool near-black, high contrast" },
  { key: "oat", name: "Oat", note: "low-chroma warm paper" },
  { key: "blue", name: "Blue", note: "cool SaaS blue" },
  { key: "indigo", name: "Indigo", note: "deep brand indigo" },
  { key: "violet", name: "Violet", note: "soft purple" },
  { key: "clay", name: "Clay", note: "warm terracotta" },
  { key: "forest", name: "Forest", note: "green" },
  { key: "ocean", name: "Ocean", note: "teal cyan" },
  { key: "rose", name: "Rose", note: "pink red" },
  { key: "terminal", name: "Terminal", note: "green phosphor" },
] as const

export type ThemeColorKey = (typeof THEME_COLORS)[number]["key"]

export const MODES = ["light", "dark"] as const

export type ModeKey = (typeof MODES)[number]

/**
 * The curated shortlist — the identities actually worth judging, picked from
 * the 11 × 11 × 2 grid. The first entry is what ships today, so the arrows
 * always start from the incumbent rather than a neutral baseline.
 */
export const THEME_IDENTITIES: readonly {
  key: string
  name: string
  note: string
  style: ThemeStyleKey
  color: ThemeColorKey
  mode: ModeKey
}[] = [
  {
    key: "incumbent",
    name: "Today",
    note: "Mono × Neutral, dark — what is folded in now",
    style: "mono",
    color: "neutral",
    mode: "dark",
  },
  {
    key: "sans-baseline",
    name: "Sans baseline",
    note: "Neutral × Neutral, dark — drop the mono, keep zinc",
    style: "neutral",
    color: "neutral",
    mode: "dark",
  },
  {
    key: "graphite",
    name: "Graphite",
    note: "Neutral × Graphite, dark — colder and higher contrast",
    style: "neutral",
    color: "graphite",
    mode: "dark",
  },
  {
    key: "mono-graphite",
    name: "Mono graphite",
    note: "Mono × Graphite, dark — the incumbent in colder ink",
    style: "mono",
    color: "graphite",
    mode: "dark",
  },
  {
    key: "mono-oat",
    name: "Mono oat",
    note: "Mono × Oat, dark — the incumbent with warmth",
    style: "mono",
    color: "oat",
    mode: "dark",
  },
  {
    key: "compact-indigo",
    name: "Compact indigo",
    note: "Compact × Indigo, dark — small radii, brand colour",
    style: "compact",
    color: "indigo",
    mode: "dark",
  },
  {
    key: "paper",
    name: "Paper",
    note: "Sand × Oat, light — serif headings, warm paper",
    style: "sand",
    color: "oat",
    mode: "light",
  },
]

export const DEFAULT_SCREEN: ScreenKey = "issues"
export const DEFAULT_NAV: VariantKey = "1"
export const DEFAULT_ISSUES: VariantKey = "1"
export const DEFAULT_BOARD: VariantKey = "2"
export const DEFAULT_DETAIL: VariantKey = "1"
export const DEFAULT_SETTINGS: VariantKey = "1"
export const DEFAULT_SIGNIN: VariantKey = "1"
export const DEFAULT_CARDS: CardKey = "B"
export const DEFAULT_STYLE: ThemeStyleKey = "neutral"
export const DEFAULT_COLOR: ThemeColorKey = "neutral"
export const DEFAULT_MODE: ModeKey = "light"
