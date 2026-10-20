import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

/**
 * Default sanitize schema plus the `mention:` protocol only. Nothing else is
 * relaxed: raw HTML still drops and `javascript:` URLs stay dead. Comments
 * carry mentions as markdown links (`[@Name](mention:<userId>)`).
 */
const mentionSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "mention"],
  },
}

export interface Mentionable {
  userId: string
  name?: string
}

/**
 * Safe Markdown read view (§5 read path): GFM formatted, raw HTML dropped,
 * `javascript:` URLs dead. Plain-text bodies render unchanged with single
 * newlines preserved (remark-breaks). Never mounts an editor.
 *
 * With `mentionable`, a `mention:` link whose id is in the roster renders as
 * a non-navigating chip; every other mention renders as plain text so an
 * unauthorized id is never linked or leaked.
 */
export function IssueMarkdown({
  markdown,
  mentionable,
}: {
  markdown: string
  mentionable?: Mentionable[]
}) {
  return (
    <div
      data-testid="issue-markdown"
      className="text-sm leading-relaxed break-words"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, mentionSchema]]}
        urlTransform={(url) =>
          url.startsWith("mention:") ? url : defaultUrlTransform(url)
        }
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("mention:")) {
              const userId = href.slice("mention:".length)
              const member = mentionable?.find(
                (candidate) => candidate.userId === userId
              )
              if (!member) return <>{children}</>
              return (
                <span
                  data-testid="mention-chip"
                  className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary"
                >
                  {member.name ? `@${member.name}` : children}
                </span>
              )
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline underline-offset-2"
              >
                {children}
              </a>
            )
          },
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-[13px]">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>
          ),
          h1: ({ children }) => (
            <h1 className="mt-2 mb-1 font-semibold text-xl">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2 mb-1 font-semibold text-lg">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 font-semibold text-base">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
