import type { ExternalLink } from "@/lib/external-links"
import { cn } from "@/lib/utils"

const stateLabel: Record<string, string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
}

const stateClass: Record<string, string> = {
  open: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  merged:
    "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  closed: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
}

/**
 * Badge for one External Link: the cached PR state (Open/Merged/Closed) or
 * a neutral marker before any webhook state arrives. Merge never moves
 * Issue Status — the badge is display-only.
 */
export function ExternalLinkBadge({ link }: { link: ExternalLink }) {
  const label = link.state ? (stateLabel[link.state] ?? link.state) : "Linked"
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={link.title ?? link.url}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-xs",
        link.state
          ? (stateClass[link.state] ?? "")
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      <span aria-hidden="true">{link.kind === "pr" ? "PR" : link.kind}</span>
      <span>{label}</span>
    </a>
  )
}
