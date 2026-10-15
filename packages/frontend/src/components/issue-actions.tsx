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
    <div className="flex items-center gap-2">
      {issue.archived ? (
        <button
          type="button"
          className="rounded-md border border-input px-2 py-1 text-xs"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              onChanged(
                await api.updateIssue(issue.identifier, { archived: false })
              )
            )
          }
        >
          Restore
        </button>
      ) : (
        <button
          type="button"
          className="rounded-md border border-input px-2 py-1 text-xs"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              onChanged(
                await api.updateIssue(issue.identifier, { archived: true })
              )
            )
          }
        >
          Archive
        </button>
      )}
      {canAdmin && (
        <button
          type="button"
          className="rounded-md border border-destructive px-2 py-1 text-destructive text-xs"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.deleteIssue(issue.identifier)
              onDeleted(issue)
            })
          }
        >
          Delete permanently
        </button>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
