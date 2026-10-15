/**
 * PROTOTYPE (throwaway) — the three axes the mockups are reviewed on.
 *
 *   layout  A–D   four structurally different shells for the signed-in app
 *   screen        which surface inside that shell (four in-app + sign-in)
 *   theme   ×2    five token sets, each light and dark
 *
 * Sign-in has its own five variants (`SIGNIN_VARIANTS`), because a
 * signed-out screen has no rail, board or detail pane for a layout to own.
 */

export const LAYOUTS = [
  {
    key: "A",
    name: "Rail + dense list",
    blurb:
      "Narrow left rail, master–detail list, detail slides in on the right. Highest information density, closest to the app today.",
  },
  {
    key: "B",
    name: "Top bar + board first",
    blurb:
      "Horizontal nav, no rail, the board is the home screen. Wide columns, full-bleed content, generous hit areas.",
  },
  {
    key: "C",
    name: "Three panes",
    blurb:
      "Project rail, a wide data table, and a detail pane that is always open. Spreadsheet energy; nothing is hidden behind a click.",
  },
  {
    key: "D",
    name: "Dashboard first",
    blurb:
      "Icon rail, stat tiles, 'needs attention' and an activity timeline. Answers what is on fire before showing the list.",
  },
] as const

export type LayoutKey = (typeof LAYOUTS)[number]["key"]

export const SCREENS = [
  { key: "issues", name: "Issues" },
  { key: "board", name: "Board" },
  { key: "issue", name: "Issue detail" },
  { key: "settings", name: "Settings" },
  { key: "signin", name: "Sign in" },
] as const

export type ScreenKey = (typeof SCREENS)[number]["key"]

export const THEMES = [
  { key: "neutral", name: "Neutral", note: "the app as it ships today" },
  { key: "slate", name: "Slate Blue", note: "cool SaaS blue, tighter radii" },
  { key: "violet", name: "Violet", note: "deep indigo, soft radii" },
  { key: "sand", name: "Paper & Clay", note: "warm, serif headings" },
  { key: "mono", name: "Terminal", note: "monospace, square, green" },
] as const

export type ThemeKey = (typeof THEMES)[number]["key"]

export const MODES = ["light", "dark"] as const

export type ModeKey = (typeof MODES)[number]

export const SIGNIN_VARIANTS = [
  { key: "S1", name: "Split panel", blurb: "Copy left, form right." },
  {
    key: "S2",
    name: "Centred card",
    blurb: "One centred card, quiet background.",
  },
  {
    key: "S3",
    name: "Card over preview",
    blurb: "Form floats over a faded app screenshot.",
  },
  {
    key: "S4",
    name: "Single column",
    blurb: "Borderless, inline labels, no card at all.",
  },
  { key: "S5", name: "Prompt", blurb: "Terminal-style provider buttons." },
] as const

export type SigninKey = (typeof SIGNIN_VARIANTS)[number]["key"]

export const DEFAULT_LAYOUT: LayoutKey = "A"
export const DEFAULT_SCREEN: ScreenKey = "issues"
export const DEFAULT_THEME: ThemeKey = "neutral"
export const DEFAULT_MODE: ModeKey = "light"
export const DEFAULT_SIGNIN: SigninKey = "S1"
