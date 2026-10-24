import { navigate } from "@/hooks/use-pathname"
import { buildGitHubPath, buildProjectPath } from "@/lib/routes"

/**
 * Project-level navigation: the Issue views and the read-only GitHub View are
 * peers (#49). The List/Table/Kanban switcher stays inside the Filters
 * popover; this row is about which surface the URL addresses.
 */
export function ProjectNavTabs({
  workspaceName,
  projectKey,
  current,
}: {
  workspaceName: string
  projectKey: string
  current: "issues" | "github"
}) {
  return (
    <div role="tablist" aria-label="Project views" className="flex gap-1">
      <button
        type="button"
        role="tab"
        aria-selected={current === "issues"}
        onClick={() => {
          if (current === "issues") return
          navigate(buildProjectPath(workspaceName, projectKey))
        }}
        className={`rounded-md px-3 py-1 text-sm ${
          current === "issues"
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
        }`}
      >
        Issues
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "github"}
        onClick={() => {
          if (current === "github") return
          navigate(buildGitHubPath(workspaceName, projectKey))
        }}
        className={`rounded-md px-3 py-1 text-sm ${
          current === "github"
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
        }`}
      >
        GitHub
      </button>
    </div>
  )
}
