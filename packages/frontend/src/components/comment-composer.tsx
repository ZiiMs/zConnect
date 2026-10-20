import type { Editor } from "@tiptap/core"
import Link from "@tiptap/extension-link"
import { Markdown } from "@tiptap/markdown"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Send, X } from "lucide-react"
import { useRef, useState } from "react"
import {
  api,
  type Comment,
  findMember,
  type Member,
  memberName,
} from "@/lib/api"

/** A member shaped for mention matching; email is optional. */
export interface MentionCandidate {
  userId: string
  name?: string
  email?: string
}

export interface MentionQuery {
  /** Text typed after `@` (may be empty). */
  query: string
  /** Text index of the `@`. */
  from: number
  /** Text index of the caret. */
  to: number
}

/**
 * Detect an `@mention` query ending at `caret` in the editor's plain text.
 * The `@` must start a word (start of text or after whitespace/bracket), the
 * query may be empty, and it ends at the caret. Trailing whitespace or
 * sentence punctuation closes the query so the list does not reopen after a
 * token is inserted.
 */
export function findMentionQuery(
  text: string,
  caret: number = text.length
): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length))
  if (end === 0) return null
  const at = text.lastIndexOf("@", end - 1)
  if (at === -1) return null
  const before = at === 0 ? "" : text[at - 1]
  if (before !== "" && !/[\s([{>]/.test(before)) return null
  const query = text.slice(at + 1, end)
  if (query.includes("@") || /[\n\r]/.test(query)) return null
  if (query !== "" && /\s$/.test(query)) return null
  if (/[)\]},;:!?]/.test(query)) return null
  return { query, from: at, to: end }
}

/**
 * Workspace Members eligible for autocomplete: those with a display name,
 * matched case-insensitively on name or email (prefix or substring), capped
 * at `limit`. Order follows the roster so results stay stable while typing.
 */
export function matchMentionMembers<T extends MentionCandidate>(
  members: T[],
  query: string,
  limit = 8
): T[] {
  const needle = query.trim().toLowerCase()
  return members
    .filter(
      (member) =>
        typeof member.name === "string" && member.name.trim().length > 0
    )
    .filter((member) => {
      if (needle === "") return true
      const name = (member.name ?? "").toLowerCase()
      const email = member.email?.toLowerCase() ?? ""
      return name.includes(needle) || email.includes(needle)
    })
    .slice(0, limit)
}

interface ActiveMention {
  items: Member[]
  activeIndex: number
  rangeFrom: number
  rangeTo: number
}

/**
 * Compact Markdown comment surface shared by the composer and inline comment
 * editing. TipTap owns the text, Markdown converts it on submit, Enter+Mod
 * sends, Shift+Enter stays a newline. No toolbar: the same Markdown input
 * rules as the issue body apply (**bold**, `code`, lists, …).
 *
 * With `members`, typing `@` opens a listbox above the editor and selecting a
 * member inserts `[@Display Name](mention:<userId>)` followed by a space.
 */
export function CommentEditor({
  label,
  initialMarkdown = "",
  placeholder = "Write a comment…",
  submitLabel = "Send",
  members,
  onSubmit,
  onCancel,
}: {
  label: string
  initialMarkdown?: string
  placeholder?: string
  submitLabel?: string
  members?: Member[]
  onSubmit: (markdown: string) => Promise<void> | void
  onCancel?: () => void
}) {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [editorKey, setEditorKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [mention, setMention] = useState<ActiveMention | null>(null)

  const mentionRef = useRef<ActiveMention | null>(null)
  const membersRef = useRef<Member[]>(members ?? [])
  const editorRef = useRef<Editor | null>(null)
  const submitRef = useRef<() => void>(() => {})

  membersRef.current = members ?? []

  function setActiveMention(next: ActiveMention | null) {
    mentionRef.current = next
    setMention(next)
  }

  function selectMention(member: Member) {
    const active = mentionRef.current
    const currentEditor = editorRef.current
    if (!active || !currentEditor) return
    const name = member.name?.trim() || member.userId
    setActiveMention(null)
    currentEditor
      .chain()
      .focus()
      .deleteRange({ from: active.rangeFrom, to: active.rangeTo })
      .insertContent([
        {
          type: "text",
          text: `@${name}`,
          marks: [
            {
              type: "link",
              attrs: { href: `mention:${member.userId}` },
            },
          ],
        },
        { type: "text", text: " " },
      ])
      .run()
  }

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: false }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          protocols: ["mention"],
        }),
        Markdown,
      ],
      content: initialMarkdown,
      contentType: "markdown",
      editorProps: {
        attributes: {
          class:
            "min-h-16 cursor-text px-2 py-1.5 text-sm break-words outline-none",
          "aria-label": label,
        },
        handleKeyDown: (_view, event) => {
          const active = mentionRef.current
          if (active && active.items.length > 0) {
            const last = active.items.length - 1
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActiveMention({
                ...active,
                activeIndex:
                  active.activeIndex >= last ? 0 : active.activeIndex + 1,
              })
              return true
            }
            if (event.key === "ArrowUp") {
              event.preventDefault()
              setActiveMention({
                ...active,
                activeIndex:
                  active.activeIndex <= 0 ? last : active.activeIndex - 1,
              })
              return true
            }
            if (
              (event.key === "Enter" && !event.shiftKey) ||
              (event.key === "Tab" && !event.shiftKey)
            ) {
              event.preventDefault()
              selectMention(active.items[active.activeIndex] ?? active.items[0])
              return true
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setActiveMention(null)
              return true
            }
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submitRef.current()
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor: current }) => {
        let next: string
        try {
          next = current.getMarkdown()
        } catch {
          next = current.getText()
        }
        setMarkdown(next)
        if (next.trim() !== "") setError(null)

        const roster = membersRef.current
        if (roster.length === 0) {
          if (mentionRef.current) setActiveMention(null)
          return
        }
        const caret = current.state.selection.from
        const text = current.state.doc.textBetween(0, caret, "\n", "\n")
        const query = findMentionQuery(text, text.length)
        if (!query) {
          if (mentionRef.current) setActiveMention(null)
          return
        }
        const items = matchMentionMembers(roster, query.query)
        if (items.length === 0) {
          if (mentionRef.current) setActiveMention(null)
          return
        }
        setActiveMention({
          items,
          activeIndex: 0,
          rangeFrom: caret - (text.length - query.from),
          rangeTo: caret,
        })
      },
    },
    [editorKey]
  )

  editorRef.current = editor

  const isEmpty = markdown.trim() === ""

  async function submit() {
    if (submitting) return
    const body = markdown.trim()
    if (body === "") {
      setError("Comment cannot be empty.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(body)
      setMarkdown("")
      setActiveMention(null)
      setEditorKey((key) => key + 1)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save the comment."
      )
    } finally {
      setSubmitting(false)
    }
  }
  submitRef.current = () => void submit()

  return (
    <div data-testid="comment-editor" className="relative flex flex-col gap-1">
      {mention && mention.items.length > 0 && (
        <div
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute bottom-full left-0 z-20 mb-1 flex w-full max-w-xs flex-col overflow-hidden rounded-md border bg-popover p-1 shadow-lg"
        >
          {mention.items.map((member, index) => (
            <button
              key={member.userId}
              type="button"
              role="option"
              aria-selected={index === mention.activeIndex}
              data-testid={`mention-option-${member.userId}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMention(member)}
              className={`flex w-full items-center rounded px-2 py-1 text-left text-sm ${
                index === mention.activeIndex ? "bg-accent" : ""
              }`}
            >
              <span className="truncate">
                {memberName(member, member.userId)}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="relative rounded-md border border-input bg-background">
        <EditorContent editor={editor} />
        {isEmpty && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 left-2 text-muted-foreground text-sm"
          >
            {placeholder}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-input px-2 py-1 text-xs"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs disabled:opacity-50"
        >
          <Send aria-hidden="true" size={12} />
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

/** Top-level comment composer; `parent` switches it into reply mode. */
export function CommentComposer({
  issueIdentifier,
  parent,
  members = [],
  onCreated,
  onCancelReply,
}: {
  issueIdentifier: string
  parent: Comment | null
  members?: Member[]
  onCreated: (comment: Comment) => void
  onCancelReply: () => void
}) {
  const parentAuthor = parent
    ? memberName(findMember(members, parent.authorId), parent.authorId)
    : null

  return (
    <div data-testid="comment-composer" className="mt-3 flex flex-col gap-1">
      {parent && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
            Replying to @{parentAuthor}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="inline-flex items-center gap-0.5 text-muted-foreground text-xs hover:text-foreground"
          >
            <X aria-hidden="true" size={12} />
            Cancel
          </button>
        </div>
      )}
      <CommentEditor
        label="Comment body"
        placeholder={parent ? `Reply to @${parentAuthor}…` : "Write a comment…"}
        members={members}
        onSubmit={async (body) => {
          const created = await api.createComment(issueIdentifier, {
            body,
            parentId: parent?.id ?? null,
          })
          onCreated(created)
        }}
      />
    </div>
  )
}
