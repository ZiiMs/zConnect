import {
  Box,
  Compass,
  File,
  Flag,
  Folder,
  Globe,
  Heart,
  Layers,
  type LucideIcon,
  Rocket,
  Star,
  Target,
  Zap,
} from "lucide-react"

/**
 * Curated project marks. Names mirror the backend `PROJECT_ICONS`
 * allowlist; the create form offers exactly these, rendered from lucide.
 */
export const PROJECT_ICONS = [
  "Folder",
  "File",
  "Rocket",
  "Globe",
  "Star",
  "Zap",
  "Target",
  "Layers",
  "Box",
  "Compass",
  "Flag",
  "Heart",
] as const

export type ProjectIconName = (typeof PROJECT_ICONS)[number]

const ICONS: Record<ProjectIconName, LucideIcon> = {
  Folder,
  File,
  Rocket,
  Globe,
  Star,
  Zap,
  Target,
  Layers,
  Box,
  Compass,
  Flag,
  Heart,
}

export const DEFAULT_PROJECT_ICON: ProjectIconName = "Folder"
export const DEFAULT_PROJECT_COLOR = "#94a3b8"

/**
 * Fixed swatch row for the picker, plus a custom tile backed by the
 * native color input. Gray leads so the default is one click away.
 */
export const PROJECT_COLOR_SWATCHES: { name: string; value: string }[] = [
  { name: "Gray", value: "#94a3b8" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8b6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
]

export function projectIconColor(color: string | undefined): string {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : DEFAULT_PROJECT_COLOR
}

/** Project mark: the picked lucide icon tinted with the project color. */
export function ProjectIcon({
  icon,
  color,
  size = 14,
}: {
  icon: string | undefined
  color: string | undefined
  size?: number
}) {
  const name =
    typeof icon === "string" &&
    (PROJECT_ICONS as readonly string[]).includes(icon)
      ? (icon as ProjectIconName)
      : DEFAULT_PROJECT_ICON
  const Glyph = ICONS[name]
  return (
    <Glyph
      data-testid={`project-icon-${name}`}
      aria-hidden="true"
      size={size}
      style={{ color: projectIconColor(color) }}
      className="shrink-0"
    />
  )
}
