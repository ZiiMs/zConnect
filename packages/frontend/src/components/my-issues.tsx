import { useEffect, useState } from "react"
import { api, type MyIssue } from "@/lib/api"
import { PriorityMark } from "@/lib/priority-icons"
import { ProjectIcon } from "@/lib/project-icons"
import { formatRelativeTime } from "@/lib/relative-time"
import { StatusIcon } from "@/lib/status-icons"

type MyIssuesTab = "assigned" | "created" | "watched"

const TABS: {
  id: MyIssuesTab
  label: string
  empty: string
}[] = [
  { id: "assigned", label: "Assigned", empty: "Nothing assigned to you." },
  {
    id: "created",
    label: "Created",
    empty: "You have not created any issues.",
  },
  {
    id: "watched",
    label: "Watched",
    empty: "You are not watching any issues.",
  },
]

/**
 * Cross-workspace My Issues: Assigned / Created / Watched, newest update
 * first. Rows carry the project and status context the API joins in, so the
 * list needs no extra workspace fetch before it can render.
 */
export function MyIssues({
  onOpenIssue,
}: {
  onOpenIssue: (issue: MyIssue) => void
}) {
  const [tab, setTab] = useState<MyIssuesTab>("assigned")
  const [issues, setIssues] = useState<MyIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setIssues([])
    api
      .listMyIssues(tab)
      .then((loaded) => {
        if (!cancelled) setIssues(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load issues")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  const emptyMessage =
    TABS.find((option) => option.id === tab)?.empty ?? "No issues yet."

  return (
    <section aria-label="My Issues" className="flex max-w-3xl flex-col gap-4">
      <header>
        <h2 className="font-medium">My Issues</h2>
        <p className="text-muted-foreground text-sm">
          Every issue assigned to you, created by you, or watched by you across
          your workspaces.
        </p>
      </header>

      <div role="tablist" aria-label="My Issues filter" className="flex gap-1">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`rounded-md border px-3 py-1 text-sm ${
              tab === option.id ? "bg-accent font-medium" : ""
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading issues…</p>
      ) : issues.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                onClick={() => onOpenIssue(issue)}
                className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-accent"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <PriorityMark
                      priority={issue.priority}
                      label={`Priority: ${issue.priority}`}
                    />
                    <span className="shrink-0 font-mono text-muted-foreground text-xs">
                      {issue.identifier}
                    </span>
                    <span className="truncate text-sm">{issue.title}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                    <ProjectIcon
                      icon={issue.projectIcon}
                      color={issue.projectColor}
                      size={12}
                    />
                    <span className="truncate">{issue.projectName}</span>
                    <span aria-hidden="true">·</span>
                    <StatusIcon
                      status={{
                        name: issue.statusName,
                        category: issue.statusCategory,
                        color: issue.statusColor,
                      }}
                      size={12}
                    />
                    <span className="truncate">{issue.statusName}</span>
                  </span>
                </span>
                <time
                  dateTime={issue.updatedAt ?? issue.createdAt ?? undefined}
                  title={issue.updatedAt ?? issue.createdAt ?? undefined}
                  className="shrink-0 text-muted-foreground text-xs"
                >
                  {formatRelativeTime(issue.updatedAt ?? issue.createdAt ?? "")}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
