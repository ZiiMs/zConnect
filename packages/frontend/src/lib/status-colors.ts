import type { Status } from "@/lib/api"

/**
 * Default Status colors for the seven seeded workflow steps. New projects
 * seed these verbatim from the backend roster; the map here keeps custom
 * UI (create form defaults, category fallbacks) in sync without another
 * round-trip.
 */
export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  Backlog: "#bec2c8",
  Todo: "#e2e2e2",
  "In Progress": "#f2c94c",
  "In Review": "#0f783c",
  Done: "#5e6ad2",
  Canceled: "#95a2b3",
  Duplicate: "#95a2b3",
}

export const FALLBACK_STATUS_COLOR = "#94a3b8"

export function statusColor(status: Pick<Status, "name" | "color">): string {
  if (
    typeof status.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(status.color)
  ) {
    return status.color
  }
  return DEFAULT_STATUS_COLORS[status.name] ?? FALLBACK_STATUS_COLOR
}

export function defaultColorForStatusName(name: string): string {
  return DEFAULT_STATUS_COLORS[name.trim()] ?? FALLBACK_STATUS_COLOR
}
