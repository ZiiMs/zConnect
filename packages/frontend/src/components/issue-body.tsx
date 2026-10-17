import type { Editor } from "@tiptap/core"
import { Extension } from "@tiptap/core"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import Link from "@tiptap/extension-link"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import { Markdown } from "@tiptap/markdown"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { common, createLowlight } from "lowlight"
import { Check, Copy, Settings } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { IssueMarkdown } from "@/components/issue-markdown"
import type { BodySaveState } from "@/hooks/use-autosave-issue"

/**
 * TipTap body (§4 + §5): always-on doc surface. The editor stays mounted
 * whenever `canEdit` is true — clicking anywhere in the doc just places the
 * cursor, with no read/edit swap and no hover wash. Formatting is
 * slash-command driven: typing "/" opens a popover with the block types
 * (headings, lists, task list, quote, code block). Inline marks (bold /
 * italic / strikethrough / code / link) work through the standard keybinds
 * (Mod-B, Mod-I, …), markdown input rules (**bold**, # heading, - list, …),
 * paste/autolink — no toolbar. Typing autosaves; blur flushes; Esc reverts
 * to the last saved value without unmounting. Read mode (`canEdit=false`)
 * never mounts an editor.
 */

type SlashRange = { from: number; to: number }

type SlashItem = {
  title: string
  hint: string
  keywords: string
  group: (typeof SLASH_GROUPS)[number]
  run: (editor: Editor, range: SlashRange) => void
}

/** Menu sections in display order: headings, lists, quote/code, link. */
const SLASH_GROUPS = ["Text", "Lists", "Quote & code", "Link"] as const

/**
 * Shared lowlight instance: the `common` bundle (~37 languages) highlights
 * fenced code blocks. A full LSP (hover/completion/diagnostics) is out of
 * scope for the editor — highlighting plus a language picker is the v1.
 */
const lowlight = createLowlight(common)

/**
 * Shorthand fence names (` ```ts `) are not registered languages on their
 * own — without these aliases the highlighter falls back to auto-detect and
 * the picker has no matching option to display.
 */
const CODE_ALIASES: Record<string, string[]> = {
  arduino: ["ino"],
  bash: ["sh", "zsh"],
  c: ["h"],
  cpp: ["c++", "cc", "cxx", "h++", "hh", "hpp", "hxx"],
  csharp: ["c#", "cs"],
  diff: ["patch"],
  go: ["golang"],
  graphql: ["gql"],
  ini: ["cfg", "prefs", "toml"],
  java: ["jsp"],
  javascript: ["cjs", "js", "jsx", "mjs"],
  json: ["jsonc"],
  kotlin: ["kt", "kts"],
  makefile: ["mak", "make", "mk"],
  markdown: ["md", "mkd", "mkdown"],
  objectivec: ["m", "mm", "objc"],
  perl: ["pl", "pm"],
  php: ["php3", "php4", "php5", "php6", "php7", "php8", "phtml"],
  "php-template": ["blade"],
  plaintext: ["plain", "text", "txt"],
  python: ["gyp", "py"],
  "python-repl": ["pycon"],
  ruby: ["gemspec", "podspec", "rb", "thor"],
  rust: ["rs"],
  sql: ["mysql", "pgsql", "postgres"],
  typescript: ["cts", "mts", "ts", "tsx"],
  vbnet: ["vb"],
  xml: ["atom", "html", "plist", "rss", "svg", "xhtml", "xsd", "xsl"],
  yaml: ["yml"],
}
lowlight.registerAlias(CODE_ALIASES)

const CODE_LANGUAGES = [
  "plaintext",
  ...new Set([
    ...lowlight.listLanguages().filter((l) => l !== "plaintext"),
    ...Object.values(CODE_ALIASES).flat(),
  ]).values(),
].sort()

const lineNumbersKey = new PluginKey("zconnect-line-numbers")

/**
 * Line-number gutter for fenced code blocks: one aria-hidden widget per
 * source line. Wrapping is visual only — numbers track real lines, and the
 * widgets are `contenteditable=false` so copying the block skips them.
 */
const LineNumbers = Extension.create({
  name: "zLineNumbers",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: lineNumbersKey,
        props: {
          decorations(state) {
            const widgets: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "codeBlock") return
              const lines = node.textContent.split("\n")
              let offset = 0
              lines.forEach((line, i) => {
                if (i === lines.length - 1 && line === "" && lines.length > 1) {
                  return
                }
                const el = document.createElement("span")
                el.className = "code-line-number"
                el.textContent = String(i + 1)
                el.setAttribute("aria-hidden", "true")
                el.setAttribute("contenteditable", "false")
                widgets.push(
                  Decoration.widget(pos + 1 + offset, el, {
                    side: -1,
                    key: `ln-${pos}-${i}`,
                  })
                )
                offset += line.length + 1
              })
            })
            return widgets.length > 0
              ? DecorationSet.create(state.doc, widgets)
              : DecorationSet.empty
          },
        },
      }),
    ]
  },
})

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Heading 1",
    hint: "Big section heading",
    keywords: "h1 heading title",
    group: "Text",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 1 })
        .run()
    },
  },
  {
    title: "Heading 2",
    hint: "Medium section heading",
    keywords: "h2 heading subtitle",
    group: "Text",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run()
    },
  },
  {
    title: "Heading 3",
    hint: "Small section heading",
    keywords: "h3 heading subtitle",
    group: "Text",
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 3 })
        .run()
    },
  },
  {
    title: "Bullet list",
    hint: "Unordered list",
    keywords: "ul bullet unordered dash",
    group: "Lists",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: "Numbered list",
    hint: "Ordered list",
    keywords: "ol numbered ordered 1.",
    group: "Lists",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: "Task list",
    hint: "Checkboxes",
    keywords: "task todo checkbox check",
    group: "Lists",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: "Quote",
    hint: "Blockquote",
    keywords: "quote blockquote cite",
    group: "Quote & code",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: "Code block",
    hint: "Fenced code",
    keywords: "code block pre fence",
    group: "Quote & code",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: "Link",
    hint: "Attach a URL to the selection",
    keywords: "link url href",
    group: "Link",
    run: (editor, range) => {
      const { empty } = editor.state.selection
      editor.chain().focus().deleteRange(range).run()
      const prev = editor.getAttributes("link").href as string | undefined
      const url = window.prompt("Link URL", prev ?? "https://")
      if (url === null || url === "") return
      if (empty) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: url,
            marks: [{ type: "link", attrs: { href: url } }],
          })
          .run()
      } else {
        editor.chain().focus().setLink({ href: url }).run()
      }
    },
  },
]

/** A trailing "/query" in the current block opens the slash menu. */
function matchSlash(editor: Editor): {
  query: string
  range: SlashRange
} | null {
  try {
    const { $from } = editor.state.selection
    if ($from.parent.type.name === "codeBlock") return null
    const textBefore = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      "￼"
    )
    const m = /\/([a-zA-Z0-9-]*)$/.exec(textBefore)
    if (!m) return null
    return {
      query: m[1] ?? "",
      range: { from: $from.pos - m[0].length, to: $from.pos },
    }
  } catch {
    return null
  }
}

function filterSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) =>
    `${item.title} ${item.keywords}`.toLowerCase().includes(q)
  )
}

export function IssueBody({
  identifier,
  markdown,
  saveState,
  saveError,
  canEdit,
  onChange,
  onFlush,
  onCancel,
  onRetry,
}: {
  identifier: string
  markdown: string
  saveState: BodySaveState
  saveError: string | null
  canEdit: boolean
  onChange: (next: string) => void
  onFlush: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  const [slash, setSlash] = useState<{
    query: string
    range: SlashRange
  } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashPos, setSlashPos] = useState<{
    top: number
    left: number
  } | null>(null)
  // Bumped on content changes so the hover toolbar position stays fresh and
  // the empty-placeholder overlay re-evaluates (`editor.isEmpty`).
  const [, setSelTick] = useState(0)
  // Code-block display prefs for this editor: wrapping and gutter numbers.
  const [wrapLines, setWrapLines] = useState(false)
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  // Hovered fence (<pre>) driving the floating combo block, if any.
  const [hoverPre, setHoverPre] = useState<HTMLElement | null>(null)
  const [codeSettingsOpen, setCodeSettingsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Last markdown echoed out via onChange. The sync effect below resets the
  // editor only when the incoming prop differs from this (an external reset:
  // issue switch, Load-latest, Esc) — never for our own keystroke echo,
  // which may lag a keystroke behind under fast typing.
  const lastSentRef = useRef(markdown)
  // Refs mirror state for the editor's keydown handler, which closes over
  // the first render's values otherwise.
  const slashRef = useRef<{ query: string; range: SlashRange } | null>(null)
  slashRef.current = slash
  const slashIndexRef = useRef(0)
  slashIndexRef.current = slashIndex
  const runSlashRef = useRef<(item: SlashItem) => void>(() => {})
  runSlashRef.current = (item: SlashItem) => {
    if (!editor || !slashRef.current) return
    item.run(editor, slashRef.current.range)
    setSlash(null)
    setSlashIndex(0)
    editor.commands.focus()
  }

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: false,
          link: false,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          defaultLanguage: "plaintext",
        }),
        LineNumbers,
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({ openOnClick: false, autolink: true }),
        Markdown,
      ],
      content: markdown,
      contentType: "markdown",
      editable: canEdit,
      editorProps: {
        attributes: {
          // Doc surface: no border in either state, tall enough to feel like
          // a page when empty. Clicking padding is handled by the container
          // (focus end) so the whole block is type-ready. Native spellcheck
          // squiggles off: this is a doc/code surface, not a form field.
          class:
            "min-h-48 cursor-text px-2 py-2 text-sm break-words outline-none",
          "aria-label": `Description for ${identifier}`,
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        },
        handleKeyDown: (_view, event) => {
          const current = slashRef.current
          if (current) {
            const items = filterSlashItems(current.query)
            const count = Math.max(1, items.length)
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setSlashIndex((i) => (i + 1) % count)
              return true
            }
            if (event.key === "ArrowUp") {
              event.preventDefault()
              setSlashIndex((i) => (i - 1 + count) % count)
              return true
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault()
              const item = items[slashIndexRef.current] ?? items[0]
              if (item) runSlashRef.current(item)
              return true
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setSlash(null)
              return true
            }
          }
          if (event.key === "Escape") {
            event.preventDefault()
            // Doc stays mounted: revert to the last saved value in place.
            // The sync effect below resets the editor content once the
            // parent draft snaps back; focus stays where it was.
            onCancel()
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        try {
          const md = editor.getMarkdown()
          lastSentRef.current = md
          onChange(md)
        } catch {
          const text = editor.getText()
          lastSentRef.current = text
          onChange(text)
        }
        refreshSlash(editor)
        // Content moved: reposition the hover combo block.
        setSelTick((t) => t + 1)
      },
      onSelectionUpdate: ({ editor }) => {
        refreshSlash(editor)
      },
      onBlur: ({ event }) => {
        // Always flush on blur, but the doc stays mounted. Focus moving
        // inside the editor chrome (slash menu, language picker) is still
        // the same editing session — nothing to close either way.
        onFlush()
        const related = (event as FocusEvent).relatedTarget
        if (
          related instanceof Node &&
          containerRef.current?.contains(related)
        ) {
          return
        }
      },
    },
    [identifier]
  )

  const filtered = filterSlashItems(slash?.query ?? "")

  /**
   * The fenced block under the hover, resolved by DOM identity (not cursor):
   * the hovered <pre> is matched to its document node, so the combo block
   * always acts on the fence being pointed at.
   */
  function hoveredCodeBlock(): {
    pos: number
    language: string
    text: string
    top: number
    right: number
  } | null {
    if (!editor || !hoverPre || !containerRef.current) return null
    if (!containerRef.current.contains(hoverPre)) return null
    try {
      let found: number | null = null
      editor.state.doc.descendants((node, pos) => {
        if (found !== null) return false
        if (
          node.type.name === "codeBlock" &&
          editor.view.nodeDOM(pos) === hoverPre
        ) {
          found = pos
          return false
        }
      })
      if (found === null) return null
      const node = editor.state.doc.nodeAt(found)
      if (node?.type.name !== "codeBlock") return null
      const box = containerRef.current.getBoundingClientRect()
      const r = hoverPre.getBoundingClientRect()
      return {
        pos: found + 1,
        language: (node.attrs.language as string | undefined) ?? "plaintext",
        text: node.textContent,
        top: r.top - box.top + 4,
        right: box.right - r.right + 4,
      }
    } catch {
      // Detached mid-update: no toolbar this frame.
      return null
    }
  }

  /**
   * Cursor fallback so the combo block stays keyboard-reachable: when the
   * caret sits inside (or hugs the edge of) a fence, that block drives the
   * toolbar even without a hover.
   */
  function cursorCodeBlock(): {
    pos: number
    language: string
    text: string
  } | null {
    if (!editor) return null
    try {
      const { $from } = editor.state.selection
      for (let d = $from.depth; d > 0; d -= 1) {
        const node = $from.node(d)
        if (node.type.name === "codeBlock") {
          return {
            pos: $from.pos,
            language:
              (node.attrs.language as string | undefined) ?? "plaintext",
            text: node.textContent,
          }
        }
      }
      const near = $from.nodeAfter ?? $from.nodeBefore
      if (near?.type.name === "codeBlock") {
        const pos = $from.nodeAfter ? $from.pos + 1 : $from.pos - 1
        return {
          pos,
          language: (near.attrs.language as string | undefined) ?? "plaintext",
          text: near.textContent,
        }
      }
    } catch {
      return null
    }
    return null
  }

  function cursorToolbarPos(): { top: number; right: number } | null {
    if (!editor || !containerRef.current) return null
    try {
      const coords = editor.view.coordsAtPos(editor.state.selection.$from.pos)
      const box = containerRef.current.getBoundingClientRect()
      return {
        top: coords.bottom - box.top + 4,
        right: Math.max(4, box.right - coords.left + 4),
      }
    } catch {
      return { top: 4, right: 4 }
    }
  }

  const hovered = hoveredCodeBlock()
  const cursorFallback = hovered === null ? cursorCodeBlock() : null
  const cursorPos = cursorFallback !== null ? cursorToolbarPos() : null
  const toolbar =
    hovered ??
    (cursorFallback !== null && cursorPos !== null
      ? { ...cursorFallback, top: cursorPos.top, right: cursorPos.right }
      : null)

  function setCodeLanguage(language: string) {
    if (!editor || toolbar === null) return
    editor
      .chain()
      .focus()
      .setTextSelection(toolbar.pos)
      .updateAttributes("codeBlock", { language })
      .run()
    editor.commands.focus()
  }

  async function copyHoveredCode() {
    if (!toolbar) return
    let ok = false
    try {
      await navigator.clipboard.writeText(toolbar.text)
      ok = true
    } catch {
      try {
        const ta = document.createElement("textarea")
        ta.value = toolbar.text
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand("copy")
        ta.remove()
      } catch {
        ok = false
      }
    }
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(false), 1500)
  }

  function handleContainerMouseOver(e: React.MouseEvent) {
    const el = e.target as HTMLElement | null
    const pre = el?.closest?.("pre") ?? null
    if (pre && containerRef.current?.contains(pre)) {
      setCopied(false)
      setHoverPre((current) => (current === pre ? current : pre))
    }
  }

  function handleContainerMouseOut(e: React.MouseEvent) {
    const related = e.relatedTarget
    if (related instanceof Node && containerRef.current?.contains(related)) {
      const el = related as HTMLElement
      if (el.closest?.("pre") || el.closest?.("[data-code-toolbar]")) return
    }
    setHoverPre(null)
    setCodeSettingsOpen(false)
  }

  function handleContainerFocus(e: React.FocusEvent) {
    const el = e.target as HTMLElement | null
    const pre = el?.closest?.("pre") ?? null
    if (pre && containerRef.current?.contains(pre)) {
      setCopied(false)
      setHoverPre((current) => (current === pre ? current : pre))
    }
  }

  function handleContainerBlur(e: React.FocusEvent) {
    const related = e.relatedTarget
    if (related instanceof Node && containerRef.current?.contains(related)) {
      const el = related as HTMLElement
      if (el.closest?.("pre") || el.closest?.("[data-code-toolbar]")) return
    }
    setHoverPre(null)
    setCodeSettingsOpen(false)
  }

  function refreshSlash(nextEditor: Editor) {
    const hit = matchSlash(nextEditor)
    setSlash(hit)
    setSlashIndex(0)
    if (hit && containerRef.current) {
      try {
        const coords = nextEditor.view.coordsAtPos(hit.range.to)
        const box = containerRef.current.getBoundingClientRect()
        setSlashPos({
          top: coords.bottom - box.top + 4,
          left: Math.max(0, coords.left - box.left),
        })
      } catch {
        setSlashPos(null)
      }
    } else {
      setSlashPos(null)
    }
  }

  function runSlash(item: SlashItem) {
    runSlashRef.current(item)
  }

  // Keep the editor in sync when the draft resets externally (Load-latest,
  // remote applied to a clean editor, Esc revert). While typing, the editor
  // owns the content: the prop echo of our own keystrokes (lastSentRef)
  // never triggers a reset, and un-echoed keystrokes (editor ahead of
  // lastSent) skip the reset for this round rather than clobbering them.
  useEffect(() => {
    if (!editor) return
    if (markdown === lastSentRef.current) return
    let current: string
    try {
      current =
        typeof editor.getMarkdown === "function"
          ? editor.getMarkdown()
          : editor.getText()
    } catch {
      return
    }
    if (current !== lastSentRef.current) return
    try {
      editor.commands.setContent(markdown, {
        contentType: "markdown",
      } as never)
      lastSentRef.current = markdown
    } catch {
      // Best-effort sync; typing stays authoritative.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, editor])

  // A scroll moves the hovered fence out from under the combo block, so
  // drop the hover instead of showing a stale floating toolbar.
  useEffect(() => {
    const clear = () => {
      setHoverPre(null)
      setCodeSettingsOpen(false)
    }
    window.addEventListener("scroll", clear, true)
    window.addEventListener("resize", clear)
    return () => {
      window.removeEventListener("scroll", clear, true)
      window.removeEventListener("resize", clear)
    }
  }, [])

  /**
   * Doc click: the whole block is type-ready. Clicks inside ProseMirror
   * place the cursor naturally; clicks on padding/placeholder focus the end
   * so empty space still types. Interactive chrome (toolbar, slash menu,
   * links, buttons) is left alone.
   */
  function handleDocClick(e: React.MouseEvent) {
    if (!editor?.isEditable) return
    const el = e.target as HTMLElement | null
    if (
      el?.closest?.(
        'button, a, select, input, textarea, [role="listbox"], [data-code-toolbar]'
      )
    ) {
      return
    }
    if (editor.isFocused) return
    if (el?.closest?.(".tiptap")) return
    e.preventDefault()
    editor.commands.focus("end")
  }

  if (!canEdit) {
    if (!markdown) {
      return (
        <p className="text-sm text-muted-foreground">No description yet.</p>
      )
    }
    return <IssueMarkdown markdown={markdown} />
  }

  const isEmpty = editor ? editor.isEmpty : markdown.trim() === ""

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Description</span>
        <StatusDot state={saveState} onRetry={onRetry} />
      </div>
      {saveError && (
        <p className="mb-1 text-destructive text-xs">
          Couldn&apos;t save —{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: doc surface focuses the editor on click; keyboard users tab directly into ProseMirror. Hover only positions the toolbar. */}
      <div
        ref={containerRef}
        className={`relative cursor-text rounded-md${wrapLines ? " code-wrap" : ""}${
          showLineNumbers ? "" : " hide-line-numbers"
        }`}
        onClick={handleDocClick}
        onMouseOver={handleContainerMouseOver}
        onMouseOut={handleContainerMouseOut}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
      >
        {editor && toolbar && (
          <div
            data-code-toolbar
            className="absolute z-10 flex max-w-full flex-col rounded-md border bg-popover p-1 shadow-md"
            style={{ top: toolbar.top, right: toolbar.right }}
          >
            <div className="flex items-center gap-0.5">
              <select
                aria-label="Code block language"
                value={toolbar.language}
                onChange={(e) => setCodeLanguage(e.target.value)}
                className="max-w-28 rounded bg-transparent px-1 py-0.5 text-xs outline-none hover:bg-accent"
              >
                {CODE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCodeSettingsOpen((open) => !open)}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Code block settings"
                aria-expanded={codeSettingsOpen}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Settings aria-hidden="true" size={14} />
              </button>
              <button
                type="button"
                onClick={() => void copyHoveredCode()}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Copy code"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {copied ? (
                  <Check aria-hidden="true" size={14} />
                ) : (
                  <Copy aria-hidden="true" size={14} />
                )}
              </button>
            </div>
            {codeSettingsOpen && (
              <fieldset className="flex flex-col gap-1 border-t border-border p-2">
                <legend className="sr-only">Code block display</legend>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={wrapLines}
                    onChange={(e) => setWrapLines(e.target.checked)}
                  />
                  Wrap lines
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showLineNumbers}
                    onChange={(e) => setShowLineNumbers(e.target.checked)}
                  />
                  Line numbers
                </label>
              </fieldset>
            )}
          </div>
        )}
        <EditorContent editor={editor} />
        {isEmpty && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-2 text-sm text-muted-foreground"
          >
            Write a description…
          </div>
        )}
        {editor && slash && filtered.length > 0 && (
          <div
            role="listbox"
            aria-label="Slash commands"
            className="absolute z-10 w-64 rounded-md border bg-popover p-1 shadow-md"
            style={
              slashPos
                ? { top: slashPos.top, left: slashPos.left }
                : { top: "100%", left: 0 }
            }
          >
            {SLASH_GROUPS.map((group) => {
              const items = filtered.filter((item) => item.group === group)
              if (items.length === 0) return null
              const firstIndex = filtered.indexOf(items[0] as SlashItem)
              return (
                <div key={group}>
                  {firstIndex > 0 && (
                    <hr className="mx-1 my-1 border-t border-border" />
                  )}
                  {items.map((item) => {
                    const i = filtered.indexOf(item)
                    return (
                      <button
                        key={item.title}
                        type="button"
                        role="option"
                        aria-selected={i === slashIndex}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => runSlash(item)}
                        onMouseEnter={() => setSlashIndex(i)}
                        className={`flex w-full flex-col rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                          i === slashIndex ? "bg-accent" : ""
                        }`}
                      >
                        <span className="font-medium">{item.title}</span>
                        <span className="text-muted-foreground text-xs">
                          {item.hint}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        Click anywhere to type. Type / for commands.
      </p>
    </div>
  )
}

function StatusDot({
  state,
  onRetry,
}: {
  state: BodySaveState
  onRetry: () => void
}) {
  if (state === "saved") {
    return <span className="text-muted-foreground text-xs">Saved</span>
  }
  if (state === "saving") {
    return <span className="text-muted-foreground text-xs">Saving…</span>
  }
  if (state === "error") {
    return (
      <span className="text-destructive text-xs">
        Couldn&apos;t save —{" "}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </span>
    )
  }
  return <span className="text-muted-foreground text-xs">Editing…</span>
}
