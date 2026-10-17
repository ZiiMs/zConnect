import { Archive, ArchiveRestore, Trash2 } from "lucide-react"
import { useState } from "react"
import { api, type Issue } from "@/lib/api"

/**
 * T5 archive lifecycle actions for one Issue row. Archiving is recoverable
 * (Restore flips it back); permanent deletion is offered to Owner/Admin
 * callers only — the server still enforces the role.
 */
export function IssueActions({
  issue,
  canAdmin,
  onChanged,
  onDeleted,
}: {
  issue: Issue
  canAdmin: boolean
  onChanged: (issue: Issue) => void
  onDeleted: (issue: Issue) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {issue.archived ? (
        <button
          type="button"
          aria-label="Restore"
          title="Restore"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              onChanged(
                await api.updateIssue(issue.identifier, { archived: false })
              )
            )
          }
        >
          <ArchiveRestore aria-hidden="true" size={14} />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Archive"
          title="Archive"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              onChanged(
                await api.updateIssue(issue.identifier, { archived: true })
              )
            )
          }
        >
          <Archive aria-hidden="true" size={14} />
        </button>
      )}
      {canAdmin && (
        <button
          type="button"
          aria-label="Delete permanently"
          title="Delete permanently"
          className="rounded-md p-1.5 text-destructive hover:bg-accent disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.deleteIssue(issue.identifier)
              onDeleted(issue)
            })
          }
        >
          <Trash2 aria-hidden="true" size={14} />
        </button>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
