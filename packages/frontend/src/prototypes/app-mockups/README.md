# App mockups — layout & theme exploration (PROTOTYPE)

**Question this answers:** what should the signed-in app look like? Today every screen is the
same narrow stacked column (`max-w-3xl`, sections stacked top to bottom), which makes the
issue views — the thing the product is for — the least prominent part of the page.

**Throwaway.** Nothing here is imported by `main.tsx`; `prototype.html` is a second Vite entry
that the production build never picks up. Stub data, no mutations, no tests. When a direction
wins, rewrite it properly and delete the rest onto this branch.

## Run it

```
bun run --cwd packages/frontend dev
```

Open **http://localhost:5173/prototype.html** (the real app stays at `/`).

## Axes

| Axis | Keys | How to switch |
| --- | --- | --- |
| Screen | `issues` `board` `issue` `settings` `signin` | chips in the switcher bar, or the in-app nav |
| Nav | `1`–`8` | Tune panel → Nav |
| Issues | `1`–`8` | ← / → on the Issues screen, or Tune panel |
| Board | `1`–`8` | ← / → on the Board screen, or Tune panel |
| Detail | `1`–`8` | ← / → on the Detail screen, or Tune panel |
| Settings | `1`–`8` | ← / → on the Settings screen, or Tune panel |
| Sign in | `1`–`8` | ← / → on the Sign in screen, or Tune panel |
| Style | 8 structural styles | Tune panel → Style |
| Color | 8 palettes | Tune panel → Color |
| Mode | `light` `dark` | Tune panel → Color row |

Everything is in the query string, so any combination is shareable and reload-stable:

```
/prototype.html?screen=issues&nav=1&issues=3&style=mono&color=rose&mode=dark
```

First-round URLs (`?layout=C&theme=mono&signin=S3`) still resolve: `layout` maps onto the
per-surface pickers, `theme` onto style+color, `S3` onto `signin=3`.

### Surfaces (8 variants each, names in `prototype-config.ts`)

- **Nav** — Wide rail, Top bar, Project rail, Icon rail, Double rail, Collapsible, Command
  bar, People-first rail. Keys `2` and `7` are top bars (root stacks vertically); the rest
  are left columns.
- **Issues** — Dense grouped, Roomy cards, Table, Compact rows (working filter), Swimlanes,
  Priority stacks, Timeline, Master–detail (working selection).
- **Board** — Compact, Roomy, Swimlanes by priority, WIP-count header, Minimal, Rich cards,
  Horizontal swimlanes, Grouped by assignee.
- **Detail** — Side pane, Full page, Hero header, Two column, Timeline first, Properties
  rail, Minimal, Split checklist. Each has an issue picker (except Minimal).
- **Settings** — Tabbed form, Top tabs, Master–detail, Setting rows, Cards grid, Sections,
  Dense table, Wizard.
- **Sign in** — Split panel, Centred card, Card over preview, Single column, Prompt, Side
  sheet, Stacked steps, Branded gradient.

### Theme: style × color × mode (8 × 8 × 2, fully independent)

**Styles** (radius/type/grid only, never color): `neutral`, `slate`, `violet`, `sand`
(serif + square grid), `mono` (monospace everything), `rounded` (extra-soft), `compact`
(dense), `minimal` (quiet). **Colors** (every color token): `neutral` (zinc), `blue`,
`violet`, `clay` (warm), `forest` (green), `ocean` (teal), `rose` (pink), `terminal`
(green phosphor). Any style works with any color in either mode — e.g. Terminal style +
Rose color is monospace rose. Tokens live in `themes.css`: `data-proto-style` owns
`--radius`/fonts/grid, `data-proto-color`+`data-proto-mode` owns the palette.

## Files

```
prototype.html                     second Vite entry (never built for production)
src/prototype-main.tsx             boots style/color/mode, mounts PrototypeRoot
src/prototypes/app-mockups/
  prototype-config.ts              axes + the 8-names-per-surface
  use-proto-params.ts              URL as the state store (+ legacy mapping)
  prototype-root.tsx               nav + content composition
  prototype-switcher.tsx           pill bar + Tune panel (dev-only)
  themes.css                       8 styles + 8 colors × light/dark
  atoms.tsx                        inline-SVG glyphs + domain marks only
  stub-data.ts                     fixtures in `@/lib/api` shapes
  variants/navs.tsx                Nav1–Nav8
  variants/issues-panels.tsx       Issues1–Issues8
  variants/boards.tsx              Board1–Board8
  variants/details.tsx             Detail1–Detail8
  variants/settings-panels.tsx     Settings1–Settings8
  variants/signins.tsx             Signin1–Signin8
```

Shared on purpose: the glyphs and the small domain marks (priority, label, status, assignee,
due chip). Everything structural is owned by each variant, so variants are free to disagree
about hierarchy rather than converge on one grid. (First-round monoliths A–D live in this
branch's history before the composable rewrite.)

One side effect while this branch lives: Tailwind scans all of `src`, so utilities used only
by the prototypes also land in the app's production CSS build. Harmless, and it disappears
with the branch.

## When a variant wins

1. Capture the answer where the next reader will look for it — which nav + surface variants,
   which style, which color, and what tipped it — on the implementation issue.
2. Fold the winner into the real code: rewrite it against real data (`useProjects`,
   `api.listIssues`), the real `Button`, real mutations. Nothing here was written to
   production standards.
3. Delete the losers, the switcher, `prototype.html` and `src/prototype-main.tsx` from
   `main`. Keep the full set of variants on this branch as the primary source.

## Verdict (2026-10-15, user pick)

Nav **1** (Wide rail) · Issues **1** (Dense grouped) · Board **2** (Roomy) · Detail **4**
(Two column) · Settings **2** (Top tabs) · Sign in **2** (Centred card) · Style **terminal** ·
Color **neutral** · Mode **dark** (mode was unspecified; dark assumed as terminal's native —
say the word if light was meant).

Shareable entry points (all other axes pinned):

```
/prototype.html?screen=issues&nav=1&issues=1&board=2&detail=4&settings=2&signin=2&style=terminal&color=neutral&mode=dark
```

Swap `screen=` for `board` / `issue` / `settings` / `signin` to review each picked
surface. Fold-in has NOT happened yet: the real app still renders its current design;
rewriting the real components against this verdict is the next step when confirmed.

## Not decided yet

- Whether nav and content are picked independently (assumed yes here) or curated as pairs.
- Whether the board deserves to be the home screen or a view you switch to.
- Whether the detail should be a pane or a page (now both exist as Detail1 vs Detail2–4).
- The switcher bar covers the bottom ~40px of every variant. Judge bottom-anchored content
  with that in mind.
