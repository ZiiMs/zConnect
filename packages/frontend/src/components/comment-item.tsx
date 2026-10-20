import { useState } from "react"
import { CommentEditor } from "@/components/comment-composer"
import { IssueMarkdown } from "@/components/issue-markdown"
import { UserAvatar } from "@/components/user-avatar"
import {
  api,
  type Comment,
  findMember,
  type MemberRef,
  memberName,
} from "@/lib/api"
import { formatRelativeTime } from "@/lib/relative-time"

/**
 * One timeline comment: author header, safe Markdown body, reply reference,
 * and the author/owner controls. Soft-deleted rows stay in place as a
 * tombstone so the conversation keeps its shape.
 */
export function CommentItem({
  comment,
  parentAuthorName = null,
  members,
  currentUserId,
  canWrite,
  canAdmin,
  onReply,
  onUpdated,
  onDeleted,
}: {
  comment: Comment
  parentAuthorName?: string | null
  members: MemberRef[]
  currentUserId: string | null
  canWrite: boolean
  canAdmin: boolean
  onReply: (comment: Comment) => void
  onUpdated: (comment: Comment) => void
  onDeleted: (comment: Comment) => void
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const author = findMember(members, comment.authorId)
  const authorName = memberName(author, comment.authorId)
  const isDeleted = comment.deletedAt !== null
  const isReply = comment.parentId !== null
  const isAuthor = currentUserId !== null && comment.authorId === currentUserId

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setError(null)
    try {
      const deleted = await api.deleteComment(comment.id)
      onDeleted(deleted)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't delete the comment."
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      data-testid={`comment-${comment.id}`}
      className={isReply ? "ml-6 border-l pl-3" : undefined}
    >
      <div className="flex items-center gap-2">
        <UserAvatar name={authorName} image={author?.image} size={20} />
        <span className="font-medium text-sm">{authorName}</span>
        <time
          dateTime={comment.createdAt}
          title={new Date(comment.createdAt).toLocaleString()}
          className="text-muted-foreground text-xs"
        >
          {formatRelativeTime(comment.createdAt)}
        </time>
        {comment.editedAt !== null && !isDeleted && (
          <span className="text-muted-foreground text-xs">edited</span>
        )}
      </div>
      {isDeleted ? (
        <p className="mt-1 text-muted-foreground text-sm italic">
          This comment was deleted.
        </p>
      ) : (
        <>
          {isReply && (
            <p className="mt-0.5 text-muted-foreground text-xs">
              {parentAuthorName
                ? `Replying to @${parentAuthorName}`
                : "Replying to a deleted comment"}
            </p>
          )}
          <div className="mt-1">
            {editing ? (
              <CommentEditor
                label="Edit comment"
                initialMarkdown={comment.body}
                submitLabel="Save"
                onSubmit={async (body) => {
                  const updated = await api.updateComment(comment.id, body)
                  onUpdated(updated)
                  setEditing(false)
                }}
                onCancel={() => {
                  setEditing(false)
                  setError(null)
                }}
              />
            ) : (
              <IssueMarkdown
                markdown={comment.body}
                mentionable={members.map(({ userId, name }) => ({
                  userId,
                  name,
                }))}
              />
            )}
          </div>
          {!editing && canWrite && (
            <div className="mt-1 flex items-center gap-2">
              {!isReply && (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="text-muted-foreground text-xs hover:text-foreground"
                >
                  Reply
                </button>
              )}
              {isAuthor && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-muted-foreground text-xs hover:text-foreground"
                >
                  Edit
                </button>
              )}
              {(isAuthor || canAdmin) && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="text-muted-foreground text-xs hover:text-destructive disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
