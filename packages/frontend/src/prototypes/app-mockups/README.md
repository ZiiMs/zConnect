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
  Horizontal swimlanes, Grouped by assignee. The real Issue card this board previously carried
  has folded into the app; see *Card density* below.
- **Detail** — Side pane, Full page, Hero header, Two column, Timeline first, Properties
  rail, Minimal, Split checklist. Each has an issue picker (except Minimal).
- **Settings** — Tabbed form, Top tabs, Master–detail, Setting rows, Cards grid, Sections,
  Dense table, Wizard.
- **Sign in** — Split panel, Centred card, Card over preview, Single column, Prompt, Side
  sheet, Stacked steps, Branded gradient.

### Theme: style × color × mode (8 × 11 × 2, fully independent)

**Styles** (radius/type/grid only, never color): `neutral`, `slate`, `violet`, `sand`
(serif headings + square grid), `mono` (monospace everything), `rounded` (extra-soft),
`compact` (dense), `minimal` (quiet). **Colors** (every color token): `neutral` (zinc),
`graphite` (cool near-black, high contrast), `oat` (low-chroma warm paper), `blue`,
`indigo` (deep brand indigo), `violet`, `clay` (warm), `forest` (green), `ocean` (teal),
`rose` (pink), `terminal` (green phosphor). Any style works with any color in either mode —
e.g. Terminal style + Rose color is monospace rose. Tokens live in `themes.css`:
`data-proto-style` owns `--radius`/fonts/grid, `data-proto-color`+`data-proto-mode` owns
the palette.

**Fonts are style-owned and applied to `body`.** The app pins its base font in
`@theme inline` (`--font-sans`), and `inline` means `.font-sans` carries that literal
stack — so re-pointing the variable cannot change it. When the terminal fold-in set
`--font-sans` to the Cascadia Mono stack, the type half of the style axis went inert:
every style rendered monospace. `themes.css` now sets `--proto-body-font` per style and
applies it to `html[data-proto-style] body` (unlayered, so it beats `@layer base`).
Components using an explicit `font-sans`/`font-mono` utility still take the pinned stack.

`THEME_IDENTITIES` in `prototype-config.ts` narrows the 176 to the seven identities
actually worth judging, with the shipped one first.

### Registry themes: 42 real ones, from tweakcn

`themes.css` and `THEME_COLORS` are ours, and hand-made palettes only ever vary
colour. The registry is the opposite: **42 themes published by
[tweakcn](https://tweakcn.com), the shadcn theme editor**, taken whole — each one
carries its own palette, radius, font stack and letter-spacing, because that is
what makes it recognisable (Claude's serif, Vercel's Geist, Vintage Paper's Libre
Baskerville, Neo Brutalism's 0rem).

| File | Role |
| --- | --- |
| `scripts/generate-registry.ts` | fetches the presets, resolves Google Fonts, writes the two files below |
| `themes.registry.css` | GENERATED — one block per theme, light + dark |
| `registry-themes.ts` | GENERATED — the list: key, label, radius, font URLs |
| `theme-fonts.ts` | swaps in the active theme's own Google Fonts, lazily |

Source is pinned by commit in the generated header (currently tweakcn
`a3b47b37`). The output is committed, so the prototype never touches the network
at dev time. Regenerate with:

```
bun run packages/frontend/scripts/generate-registry.ts
```

Font URLs are pre-resolved at generation time by probing Google Fonts, so a
family that is not available — Signifier, in Sage Garden — is excluded there
rather than failing in the browser.

**`theme` and `style`/`color` are alternatives, not layers.** A registry theme
owns radius and fonts as well as colour, so the root carries exactly one of
`data-proto-theme` or `data-proto-style` + `data-proto-color`. Both hooks set the
same custom properties at the same specificity, so the composable axes are kept
in the URL while a theme is active, ready for when you switch back.

```
/prototype.html?screen=issues&theme=violet-bloom&mode=light
http://localhost:5173/?theme=catppuccin&mode=dark
```

## Files

```
prototype.html                     second Vite entry (never built for production)
src/prototype-main.tsx             boots style/color/mode, mounts PrototypeRoot
src/prototypes/app-mockups/
  prototype-config.ts              axes + the 8-names-per-surface
  use-proto-params.ts              URL as the state store (+ legacy mapping)
  prototype-root.tsx               nav + content composition
  prototype-switcher.tsx           pill bar + Tune panel (dev-only)
  real-theme.tsx                   sub-shape A: themes the real app via ?theme / ?style/?color/?mode
  themes.css                       8 styles + 11 colors × light/dark (hand-made)
  themes.registry.css              GENERATED — 42 tweakcn themes × light/dark
  registry-themes.ts               GENERATED — registry list (key, label, radius, fonts)
  theme-fonts.ts                   loads the active theme's Google Fonts
  atoms.tsx                        inline-SVG glyphs + domain marks only
  stub-data.ts                     fixtures in `@/lib/api` shapes
  variants/navs.tsx                Nav1–Nav8
  variants/issues-panels.tsx       Issues1–Issues8
  variants/boards.tsx              Board1–Board8
  variants/details.tsx             Detail1–Detail8
  variants/settings-panels.tsx     Settings1–Settings8
  variants/signins.tsx             Signin1–Signin8
```

The registry generator is not listed above because it lives outside `src/`, at
`packages/frontend/scripts/generate-registry.ts`: it is node tooling, and
`tsconfig.app.json` covers `src` with `vite/client` types only, so a script using
`node:fs` there breaks the production build. `tsconfig.node.json` covers it instead.

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

## Verdict (2026-10-15, user pick) — FOLDED IN

Nav **1** (Wide rail) · Issues **1** (Dense grouped) · Board **2** (Roomy) · Detail **4**
(Two column) · Settings **2** (Top tabs) · Sign in **2** (Centred card) · Style **mono**
(the config's "Terminal" — square radii + monospace) · Color **neutral** · Mode **dark**.

This landed in `1f3f7bd` ("fold in app-mockup verdict"): `--radius: 0`, `--font-sans`
switched to the Cascadia Mono stack, dark default, plus the rail / dense list / roomy
board / two-column detail / top-tab settings / centred sign-in rewrites. An earlier
version of this section said fold-in had not happened; that was stale.

## Folded in: Darkmatter, expanded (2026-10-16)

`index.css` now ships **Darkmatter**, folded in from the registry and *expanded*
— so `?theme=darkmatter` shows upstream's published values, not what the app
renders. Deliberate divergences:

- **Three surfaces, two values.** Upstream light has `--card` identical to
  `--background`, and dark has them one step apart. The ramp is `--sidebar` (the app
  frame; also the Kanban column well) < `--background` (the app panel) = `--card`.
  Cards sit flush with the panel and are defined by their border, not by a value step.
- `--card` is written as `var(--background)` rather than a copied hex, so the two
  cannot drift apart.
- `--border` and `--accent` lifted so hover states and outlines survive on a card
  that shares the panel's surface.
- Dark `--destructive` is a red; upstream sets it to the same teal as `--secondary`.
- Base font is Geist Mono (`@fontsource-variable/geist-mono`), via `@theme inline`,
  since a variable override cannot reach the inlined stack.

`THEME_IDENTITIES` and the registry shortlists are untouched, so both are still
available for comparison.

## Round 2 (2026-10-16) — the theme, on the real app

**Question:** which identity should the app wear, now that the first pick has shipped?

The gallery answers a *structural* question on hand-built mockups. For an identity-only
question where the layouts stay, the mockups are the wrong surface: nothing in
`variants/*` is a real component. So this round is **sub-shape A** — the variants live on
the real screens.

```
bun run --cwd packages/frontend dev
http://localhost:5173/?theme=catppuccin&mode=dark
```

`real-theme.tsx` pushes `?theme=` (or `?style=` `?color=` `?mode=`) onto
`document.documentElement` as `data-proto-*`. `themes.css` and
`themes.registry.css` target `html[data-proto-*]` (specificity 0,1,1) which beats
the app's own `:root` and `.dark` blocks, so the whole app re-skins with **no
component changes**. Dev-only: `main.tsx` imports it behind `import.meta.env.DEV`,
so the module, its CSS and its fonts are dropped from the production build.

- Arrows walk all 42 registry themes, then the `THEME_IDENTITIES` shortlist.
- **Tune** opens every axis: registry (42), style (8), color (11), mode (2), shortlist (7).
- **copy index.css** prints the `:root` / `.dark` token blocks to paste over `src/index.css`.
- **off** clears the params and returns the app to its shipped theme.
- It does nothing until a param is present, so ordinary dev sessions are untouched.
- While active it wins the `.dark` class from `ThemeProvider`; a MutationObserver keeps
  `?mode=` authoritative.

## Rail: borderless, on the app frame (2026-10-16)

Five rail treatments were built as a `?sidebar=` axis and reviewed on the real app.
**Flat** won — and then the structure around it changed, so the rail stopped being a
panel at all and became the app's *chrome*, with the content promoted to the app.

The shape now: the shell is `bg-sidebar` (the frame), the rail sits on it with **no
surface and no borders of its own**, and the content is a `rounded-lg bg-background`
panel inset 8px on all sides — so the app reads as a rounded window inside the frame.
Dropping the rail's hairlines was part of the same move: the panel's own edge does that
work now, which is why the rail needs nothing.

| | dark | light |
| --- | --- | --- |
| frame (`--sidebar`) | `#08080a` | `#e4e4e8` |
| app panel (`--background`) | `#131315` | `#f5f5f6` |
| panel inset / radius | 8px / 12px | same |

`--sidebar` therefore now means two things, both of them "recessed": the frame the rail
sits on, and the Kanban column well inside the panel. That naming mismatch is still open.

The `?sidebar=` axis, its variant CSS and the three `data-rail` hooks were all deleted
once this shipped, so the design is expressed directly in `App.tsx`. The losing variants
are recorded here because the prototype CSS was deleted rather than committed (values
tuned for dark; no light pass was done):

| key | rail | inside | radius | hairline |
| --- | --- | --- | --- | --- |
| `now` | `#0b0b0c` | `#202024` | 0.75rem | — |
| `well` | `#0f0f10` | `#08080a` | 0.75rem | — |
| `flat` | `#131315` | — | 0 | `#26262b` |
| `tint` | `#1a1410` | — | 0 | `#2e231a` |
| `hollow` | `#0f0f10` | — | 0 | — |

Every variant padded its inner region `px-4`, so head, rows and foot all align at 16px.

## Card density — the Kanban Issue card (2026-10-16) — FOLDED IN

**Question:** which Kanban Issue card density should ship — A compact, B balanced or
C roomy? The card *layout* was locked before this round (2-line clamped title, icon-only
PriorityMark after the identifier, labels capped at two plus `+n`, footer with the status
menu left and due right). Density was the open axis, and padding and gap were the only
things that changed in the round.

Host was **Board 9**, a throwaway board that carried the real dnd-kit sensors
(`distance: 8`), `useDraggable`/`useDroppable` and the board's own `resolveKanbanDrop`,
with the real `PropertyMenu` for the status and assignee menus, over local stub state. Its
fixture stressed the card: a title needing both lines, three- and four-label issues (so `+n`
appeared), one unbreakable-token title, `None` priority, no labels, overdue and future due,
assigned and unassigned.

**Verdict: B balanced** — `p-3 · gap-1.5`. Everything else on the card was accepted as
specced, and two follow-up rounds settled the accent:

- *"the background prio color"* turned out to mean the **priority icon's tone**, not a
  background wash. The icon is softened in `@/lib/priority-icons.tsx`: the same four tones
  (`Urgent` red, `High` amber, `Medium` blue, `Low`/`None` grey), each mixed 60% toward
  `--muted-foreground` **in `oklab`** so the hue survives (an `oklch` mix dragged `High`'s
  amber far enough toward red to collide with `Urgent`). `Low` and `None` already sat on
  `--muted-foreground` and are unchanged. The shipped Darkmatter palette has no amber or
  blue, so `--priority-high` and `--priority-medium` were added to `index.css`, light and
  dark. (The prototype palettes in `themes.css` predate them, so under a `?style=` /
  `?color=` / `?theme=` preview on the real app the High and Medium marks fall back to the
  inherited colour.)
- *"the status color on the sides"* was the 4px `borderLeft` rail in `status.color`, and the
  follow-up also rejected the `color-mix` tint wash. The card therefore carries **no status
  colour at all**: plain `--card`, status reading only from the footer's mark and name.

**What the round settled beyond density**

- The title clamps at two lines with `break-words`. The prototype's finding was that one
  unbreakable token was clipped, and in the real board's `min-w-72` column would stretch the
  column and push content off-screen; the real card now breaks it instead.
- The rail and the tint existed only in the prototype copy, so the real card never had them.

Folded into `packages/frontend/src/components/kanban-card.tsx` alongside the new
`@/lib/priority-icons.tsx`; Board 9, the `cards` axis and `variants/card-densities.tsx` were
deleted in the same pass. `kanban-board.test.tsx` gained assertions for the Priority mark,
the label cap, and the accentless surface.

## Still not decided

- Whether two lines of title is enough — the clamp itself was accepted and shipped with the
  card.

- Whether the mono base font survives the review (`sans-baseline` and `graphite` in the
  shortlist are the direct alternatives).
- Whether nav and content are picked independently (assumed yes here) or curated as pairs.
- Whether the board deserves to be the home screen or a view you switch to.
- Whether the detail should be a pane or a page (now both exist as Detail1 vs Detail2–4).
- No contrast/AA readout yet — the fold-in is unguarded against a palette that loses
  contrast. Cheapest next step if the round comes down to two close candidates.
- The switcher bar covers the bottom ~40px of every variant. Judge bottom-anchored content
  with that in mind.
