import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/dialog"
import { api, type GitHubItemKind, type Issue } from "@/lib/api"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The Issue body seeded from a GitHub Item (#53): the GitHub URL is the
 * durable reference, followed by the synced description excerpt when there is
 * one. No trailing blank line for items without a body.
 */
export function composeGitHubItemBody(
  url: string,
  bodyExcerpt: string | null
): string {
  const excerpt = bodyExcerpt?.trim() ?? ""
  return excerpt.length > 0 ? `${url}\n\n${excerpt}` : url
}

/**
 * Create dialog (#53): a prefilled, editable composer for the Issue that will
 * carry the GitHub Item's External Link. The backend resolves the snapshot and
 * the project's default Status; the dialog only submits the item identity.
 */
export function GitHubCreateDialog({
  open,
  onOpenChange,
  projectId,
  kind,
  repositoryId,
  number,
  title,
  url,
  bodyExcerpt,
  repository,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  kind: GitHubItemKind
  repositoryId: string
  number: number
  /** Snapshot title, used as the editable draft and the source line. */
  title: string
  /** Snapshot URL, the first paragraph of the drafted body. */
  url: string
  bodyExcerpt: string | null
  /** Repository full name (`owner/name`), shown as the source. */
  repository: string
  onCreated: (issue: Issue) => void
}) {
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftBody, setDraftBody] = useState(() =>
    composeGitHubItemBody(url, bodyExcerpt)
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Reopening on another row starts from that row's prefill.
    setDraftTitle(title)
    setDraftBody(composeGitHubItemBody(url, bodyExcerpt))
    setSending(false)
    setError(null)
  }, [open, title, url, bodyExcerpt])

  async function handleCreate() {
    if (sending || draftTitle.trim() === "") return
    setSending(true)
    setError(null)
    try {
      // The server derives title/body/Status from the snapshot; the dialog is
      // the review step, so it submits only the item identity.
      const issue = await api.createIssueFromGitHubItem(projectId, {
        kind,
        repositoryId,
        number,
      })
      onCreated(issue)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating the issue failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create Issue"
      description={`From ${repository} #${number}`}
    >
      <div className="flex flex-col gap-3">
        <p className="truncate text-muted-foreground text-sm">{title}</p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            type="text"
            aria-label="Issue title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <textarea
            aria-label="Issue description"
            rows={5}
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={sending || draftTitle.trim() === ""}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm disabled:opacity-50"
          >
            {sending ? "Creating…" : "Create Issue"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
