import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

/**
 * Static guard for ADR-0002: the browser has no direct database access.
 * Split so this file's own source cannot trip the scan.
 */
const SUPABASE_CLIENT = ["@supabase", "supabase-js"].join("/")
const BROWSER_CLIENT_MODULE = ["@/lib", "supabase"].join("/")

const repoRoot = resolve(import.meta.dir, "../../..")
const packages = ["packages/backend", "packages/frontend"] as const
const MANIFEST_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue
      files.push(...sourceFiles(path))
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

function importPattern(moduleName: string): RegExp {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(|\\bimport\\s+|\\brequire\\s*\\()\\s*["']${escaped}["']`
  )
}

describe("browser database access", () => {
  test.each(packages)("%s does not depend on the Supabase client", (pkg) => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, pkg, "package.json"), "utf8")
    ) as Record<string, Record<string, string> | undefined>

    for (const section of MANIFEST_SECTIONS) {
      expect(manifest[section]?.[SUPABASE_CLIENT]).toBeUndefined()
    }
  })

  test("no source imports the Supabase client or the browser client module", () => {
    const patterns = [
      importPattern(SUPABASE_CLIENT),
      importPattern(BROWSER_CLIENT_MODULE),
    ]
    const offenders: string[] = []

    for (const pkg of packages) {
      for (const file of sourceFiles(join(repoRoot, pkg, "src"))) {
        const source = readFileSync(file, "utf8")
        if (patterns.some((pattern) => pattern.test(source))) {
          offenders.push(relative(repoRoot, file))
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test("the old browser database modules are deleted", () => {
    const deleted = [
      "packages/frontend/src/lib/supabase.ts",
      "packages/frontend/src/hooks/use-realtime.ts",
      "packages/frontend/src/hooks/use-issue-subscription.ts",
      "packages/backend/src/lib/supabase.ts",
    ]

    for (const file of deleted) {
      expect(existsSync(join(repoRoot, file))).toBe(false)
    }
  })
})
