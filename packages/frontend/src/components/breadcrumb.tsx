export interface BreadcrumbItem {
  label: string
  /** Every crumb navigates, the current page included (it re-opens itself). */
  onClick: () => void
  /** Issue identifiers read in the mono face. */
  mono?: boolean
  /** Marks the page the user is already on. */
  current?: boolean
}

/**
 * Breadcrumb trail for the Issues screen: `{Project} › Issues[ › View]`,
 * extending to `› WEB-123` on Detail (ADR-0001). Rendered by the container so
 * it survives the swap between a View and the Detail it opens; see
 * `project-issues`.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-1">
            {index > 0 && (
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
            )}
            <button
              type="button"
              aria-current={item.current ? "page" : undefined}
              onClick={item.onClick}
              className={`rounded px-1 py-0.5 hover:bg-accent ${
                item.current
                  ? "font-medium"
                  : "text-muted-foreground hover:text-accent-foreground"
              } ${item.mono ? "font-mono" : ""}`}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
