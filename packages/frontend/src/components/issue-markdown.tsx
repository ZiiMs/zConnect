import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

/**
 * Safe Markdown read view (§5 read path): GFM formatted, raw HTML dropped,
 * `javascript:` URLs dead. Plain-text bodies render unchanged with single
 * newlines preserved (remark-breaks). Never mounts an editor.
 */
export function IssueMarkdown({ markdown }: { markdown: string }) {
  return (
    <div
      data-testid="issue-markdown"
      className="text-sm leading-relaxed break-words"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
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
