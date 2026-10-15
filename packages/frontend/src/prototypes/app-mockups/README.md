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

## Three axes

| Axis | Keys | How to switch |
| --- | --- | --- |
| Layout | `A` `B` `C` `D` | ← / → arrows, or the switcher label |
| Screen | `issues` `board` `issue` `settings` `signin` | chips in the switcher, or the in-app nav |
| Theme | `neutral` `slate` `violet` `sand` `mono` × light/dark | swatches and mode buttons in the switcher |

Everything is in the query string, so any combination is shareable and reload-stable:

```
/prototype.html?layout=C&screen=issue&theme=mono&mode=dark
```

On the **Sign in** screen the arrows walk `S1`–`S5` instead of the layouts: a signed-out screen
has no rail, board or detail pane for a layout to own, so it carries five variants of its own.

### Layouts

- **A — Rail + dense list.** Linear-ish master–detail. Rail owns nav, the main column owns the
  query, detail slides in as a third column. Single-line 28px rows.
- **B — Top bar + board first.** No rail; horizontal nav and the board *as* the home screen.
  Roomy cards, two-line list rows, full-bleed content.
- **C — Three panes.** Project rail, wide data table, detail pane that never closes, plus a
  status bar. Spreadsheet energy; nothing hides behind a click.
- **D — Dashboard first.** Icon rail, stat tiles, needs-attention, team load, activity timeline.
  Settings becomes a setting-rows list instead of a tabbed form grid.

### Themes

`neutral` is the app as it ships today (the baseline). The other four move more than colour —
`mono` swaps the base font to monospace, `sand` uses serif headings, `violet` softens radii,
`slate` tightens them. Tokens live in `themes.css`, scoped to `html[data-proto-theme=…]`, so the
real `index.css` is untouched.

## Files

```
prototype.html                     second Vite entry (never built for production)
src/prototype-main.tsx             boots the theme, mounts PrototypeRoot
src/prototypes/app-mockups/
  prototype-config.ts              the three axes and their labels
  use-proto-params.ts              URL as the state store
  prototype-root.tsx               axis → component
  prototype-switcher.tsx           floating dev-only switcher bar
  themes.css                       5 themes × light/dark
  atoms.tsx                        inline-SVG glyphs + domain marks only
  stub-data.ts                     fixtures in `@/lib/api` shapes
  variants/layout-{a,b,c,d}-*.tsx  the four shells
  variants/signin-variants.tsx     S1–S5
```

Shared on purpose: the glyphs and the small domain marks (priority, label, status, assignee,
due chip). Everything structural is owned by each variant, so the layouts are free to disagree
about hierarchy rather than converge on one grid.

## When a variant wins

1. Capture the answer where the next reader will look for it — which layout, which theme, and
   what tipped it — on the implementation issue.
2. Fold the winner into the real code: rewrite it against real data (`useProjects`,
   `api.listIssues`), the real `Button`, real mutations. Nothing here was written to production
   standards.
3. Delete the losers, the switcher, `prototype.html` and `src/prototype-main.tsx` from `main`.
   Keep the full set of variants on this branch as the primary source for what was considered.

## Not decided yet

- Whether the layout axis and the theme axis are independent choices (assumed yes here) or a
  single pick like "Linear-style dark".
- Whether the board deserves to be the home screen (B) or a view you switch to (A, C, D).
- Whether the detail should be a pane (A, C) or a page (B, D).
- The switcher bar covers the bottom ~40px of every variant, which is exactly where C puts its
  status bar. Judge C with that in mind.
