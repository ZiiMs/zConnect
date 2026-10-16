/**
 * PROTOTYPE (throwaway) — generator for the registry themes.
 *
 * Pulls the preset themes out of tweakcn (the shadcn theme editor) and writes two
 * files into `src/prototypes/app-mockups/`:
 *
 *   themes.registry.css   one block per theme, light + dark
 *   registry-themes.ts    the list the switchers read (key, label, radius, fonts)
 *
 * Run from the repo root:  bun run packages/frontend/scripts/generate-registry.ts
 *
 * The output is committed, so the prototype itself never touches the network.
 * Re-run this only when you want to pick up upstream theme changes.
 *
 * This lives in `scripts/`, not under `src/`, on purpose: it is build tooling that
 * uses node builtins, and `tsconfig.app.json` covers `src` with `vite/client` types
 * only. `tsconfig.node.json` covers it instead, which is why the build type-checks
 * it and the app project does not.
 */
import { unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const REPO = "jnsahaj/tweakcn"
const SRC = "utils/theme-presets.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "..", "src", "prototypes", "app-mockups")
const REGEN = "bun run packages/frontend/scripts/generate-registry.ts"

/** Generic/system stacks that are never worth a Google Fonts request. */
const SYSTEM_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "system-ui",
  "georgia",
  "times new roman",
  "courier new",
  "menlo",
  "monaco",
  "consolas",
  "liberation mono",
  "sfmono-regular",
  "cascadia mono",
  "arial",
  "helvetica",
])

type Tokens = Record<string, string>

interface Preset {
  label: string
  createdAt?: string
  styles: { light: Tokens; dark: Tokens }
}

interface PresetSource {
  [key: string]: Preset
}

async function head(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Resolve a font family to a Google Fonts stylesheet URL, preferring a full
 * weight range and degrading for families that carry only a couple of weights.
 */
async function resolveFont(family: string): Promise<string | null> {
  const query = family.replace(/ /g, "+")
  const candidates = [
    `https://fonts.googleapis.com/css2?family=${query}:wght@400;500;600;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${query}:wght@400;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${query}&display=swap`,
  ]
  for (const url of candidates) {
    if (await head(url)) {
      return url
    }
  }
  return null
}

function firstFamily(stack: string | undefined): string | null {
  if (!stack) {
    return null
  }
  const name = stack
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "")
  return name && name.length > 0 ? name : null
}

function cssBlock(selector: string, tokens: Tokens, indent = "  "): string {
  const lines = Object.entries(tokens).map(
    ([token, value]) => `${indent}--${token}: ${value};`
  )
  return `${selector} {\n${lines.join("\n")}\n}`
}

async function main() {
  const commit = (await (
    await fetch(`https://api.github.com/repos/${REPO}/commits/main`)
  ).json()) as { sha: string }

  const source = await (
    await fetch(
      `https://raw.githubusercontent.com/${REPO}/${commit.sha}/${SRC}`
    )
  ).text()

  // The source is a typed module; strip the import and evaluate it via a
  // temporary sibling so we do not have to hand-parse 3,600 lines. The path is a
  // variable, so TypeScript does not try to resolve a file that only exists here
  // at runtime.
  const scratch = join(HERE, "theme-presets.scratch.ts")
  writeFileSync(scratch, source.replace(/^import .*$/m, ""))
  const { defaultPresets } = (await import(pathToFileURL(scratch).href)) as {
    defaultPresets: PresetSource
  }

  const keys = Object.keys(defaultPresets)
  const css: string[] = [
    "/**",
    " * PROTOTYPE (throwaway) — GENERATED. Do not edit by hand.",
    " *",
    ` * Source: https://github.com/${REPO} @ ${commit.sha}`,
    ` *         ${SRC} — ${keys.length} preset themes from the shadcn theme editor.`,
    ` * Regenerate: ${REGEN}`,
    " *",
    ' * Selector: html[data-proto-theme="<key>"] for light, plus',
    ' * [data-proto-mode="dark"]. Specificity (0,1,1) is the same as',
    " * html[data-proto-style], so `theme` is an alternative to the style/color",
    " * axes rather than an override of them — the root sets exactly one.",
    " */",
    "",
  ]

  const list: string[] = [
    "/**",
    " * PROTOTYPE (throwaway) — GENERATED. Do not edit by hand.",
    " *",
    ` * See themes.registry.css. Source: ${REPO} @ ${commit.sha.slice(0, 8)}.`,
    " */",
    "",
    "export interface RegistryTheme {",
    "  key: string",
    "  label: string",
    "  radius: string",
    "  /** Google Fonts stylesheet URLs, injected while the theme is active. */",
    "  fonts: readonly string[]",
    "}",
    "",
    "export const REGISTRY_THEMES: readonly RegistryTheme[] = [",
  ]

  const cache = new Map<string, string | null>()

  for (const key of keys) {
    const preset = defaultPresets[key]
    if (!preset) {
      continue
    }
    const { light, dark } = preset.styles

    // Many presets only spell radius/fonts/tracking out in `light`.
    const radius = light.radius ?? dark.radius ?? "0.5rem"
    const tracking = light["letter-spacing"] ?? dark["letter-spacing"]
    const fontSans = firstFamily(light["font-sans"] ?? dark["font-sans"])
    const fontMono = firstFamily(light["font-mono"] ?? dark["font-mono"])

    const toCss = (tokens: Tokens): Tokens => {
      const out: Tokens = {}
      for (const [token, value] of Object.entries(tokens)) {
        if (token.startsWith("shadow-") || token === "radius") {
          continue
        }
        if (token.startsWith("font-") || token === "letter-spacing") {
          continue
        }
        out[token] = value
      }
      out.radius = radius
      if (light["font-sans"]) {
        out["proto-body-font"] = light["font-sans"]
        out["proto-heading-font"] = light["font-sans"]
      }
      if (light["font-mono"]) {
        out["proto-mono-font"] = light["font-mono"]
      }
      if (tracking) {
        out["proto-tracking"] = tracking
        out["proto-heading-tracking"] = tracking
      }
      return out
    }

    css.push(cssBlock(`html[data-proto-theme="${key}"]`, toCss(light)))
    css.push("")
    css.push(
      cssBlock(
        `html[data-proto-theme="${key}"][data-proto-mode="dark"]`,
        toCss(dark)
      )
    )
    css.push("")

    // Resolve every family the theme names, skipping generics and system stacks.
    const families = [
      fontSans,
      firstFamily(light["font-serif"] ?? dark["font-serif"]),
      fontMono,
    ].filter((name): name is string => name !== null)

    const urls: string[] = []
    for (const family of families) {
      const lower = family.toLowerCase()
      if (SYSTEM_FONTS.has(lower)) {
        continue
      }
      if (!cache.has(family)) {
        cache.set(family, await resolveFont(family))
      }
      const url = cache.get(family)
      if (url && !urls.includes(url)) {
        urls.push(url)
        console.log(`  font ok   ${key}: ${family}`)
      } else if (!url) {
        console.log(`  font skip ${key}: ${family} (not on Google Fonts)`)
      }
    }

    list.push("  {")
    list.push(`    key: ${JSON.stringify(key)},`)
    list.push(`    label: ${JSON.stringify(preset.label)},`)
    list.push(`    radius: ${JSON.stringify(radius)},`)
    list.push(
      `    fonts: [${urls.map((url) => JSON.stringify(url)).join(", ")}],`
    )
    list.push("  },")
  }

  list.push("]")
  list.push("")

  writeFileSync(join(OUT, "themes.registry.css"), css.join("\n"))
  writeFileSync(join(OUT, "registry-themes.ts"), list.join("\n"))
  console.log(
    `\nwrote ${keys.length} themes (tweakcn @ ${commit.sha.slice(0, 8)})`
  )
}

await main()

// The scratch copy only exists so Bun can evaluate the upstream module.
unlinkSync(join(HERE, "theme-presets.scratch.ts"))
