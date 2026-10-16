/**
 * PROTOTYPE (throwaway) — navigation chrome variants Nav1–Nav8.
 *
 * Contract: each variant receives the active `screen` and owns nothing else.
 * Content variants render beside/below it. Navigate with `protoHref`.
 * Full-bleed top bars (2, 7) render horizontally; the root stacks them
 * vertically. All others render as a left column (fixed width, full height).
 */

import { cn } from "cn"
import { useState } from "react"
import { Avatar, Glyph, Meter, SectionTitle } from "../atoms"
import type { ScreenKey, VariantKey } from "../prototype-config"
import {
  activeProject,
  countsByStatus,
  issues,
  labels,
  people,
  projects,
  savedViews,
  statuses,
  topLevelIssues,
  viewer,
  workspace,
} from "../stub-data"
import { protoHref } from "../use-proto-params"

export type NavProps = { screen: ScreenKey }

const NAV_LINKS = [
  { key: "issues", label: "Issues", glyph: "inbox" },
  { key: "board", label: "Board", glyph: "board" },
  { key: "issue", label: "Detail", glyph: "list" },
  { key: "settings", label: "Settings", glyph: "sliders" },
] as const

function ScreenLink({
  target,
  active,
  children,
  className,
}: {
  target: ScreenKey
  active: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <a
      className={cn(className, active && "bg-sidebar-accent font-medium")}
      href={protoHref({ screen: target })}
    >
      {children}
    </a>
  )
}

function WorkspaceMark({ size = "size-7" }: { size?: string }) {
  return (
    <span
      className={cn(
        size,
        "grid shrink-0 place-items-center rounded-md bg-primary",
        "font-semibold text-[11px] text-primary-foreground"
      )}
    >
      NL
    </span>
  )
}

function ViewerFooter() {
  return (
    <div className="mt-auto flex items-center gap-2 border-sidebar-border border-t px-3 py-2.5">
      <Avatar person={viewer} size={24} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-xs">
          {viewer.name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          @{viewer.handle}
        </span>
      </span>
    </div>
  )
}

/** 1. Wide rail — the full sidebar: search, counts, projects, views. */
function Nav1WideRail({ screen }: NavProps) {
  const open = topLevelIssues.filter((item) => item.statusId !== "s-done")
  const subtasks = issues.length - topLevelIssues.length
  const links = [
    { key: "issues", label: "Issues", count: topLevelIssues.length },
    { key: "board", label: "Board", count: open.length },
    { key: "issue", label: "Detail", count: subtasks },
    { key: "settings", label: "Settings", count: people.length },
  ] as const
  return (
    <aside className="flex w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pt-3">
        <WorkspaceMark />
        <span className="proto-heading truncate font-medium text-sm">
          {workspace.name}
        </span>
        <Glyph
          className="ml-auto size-3.5 text-muted-foreground"
          name="chevronDown"
        />
      </div>
      <div className="px-2 pt-2">
        <button
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border px-2 py-1.5 text-muted-foreground text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="search" />
          Search
          <span className="proto-mono ml-auto text-[10px]">⌘K</span>
        </button>
      </div>
      <nav className="flex flex-col gap-px px-2 pt-2 text-sm">
        {links.map((link) => (
          <ScreenLink
            active={screen === link.key}
            className="flex items-center rounded-md px-2 py-1.5"
            key={link.key}
            target={link.key}
          >
            {link.label}
            <span className="ml-auto text-muted-foreground text-xs">
              {link.count}
            </span>
          </ScreenLink>
        ))}
      </nav>
      <SectionTitle className="px-4 pt-4">Projects</SectionTitle>
      <div className="flex flex-col gap-px px-2 pt-1">
        {projects.map((project) => (
          <span
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              project.id === activeProject.id
                ? "bg-sidebar-accent font-medium"
                : "text-muted-foreground"
            )}
            key={project.id}
          >
            <span className="rounded bg-muted px-1 py-px font-semibold text-[10px]">
              {project.key}
            </span>
            <span className="truncate">{project.name}</span>
          </span>
        ))}
      </div>
      <SectionTitle className="px-4 pt-4">Saved views</SectionTitle>
      <div className="flex flex-col gap-px px-2 pt-1">
        {savedViews.map((view) => (
          <span
            className="flex items-center rounded-md px-2 py-1 text-[13px] text-muted-foreground"
            key={view.id}
          >
            {view.name}
            <span className="ml-auto text-[11px]">{view.count}</span>
          </span>
        ))}
      </div>
      <ViewerFooter />
    </aside>
  )
}

/** 2. Top bar — project pills, search, bell, avatar, New issue. */
function Nav2TopBar({ screen }: NavProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-border border-b bg-card px-4">
      <WorkspaceMark />
      <span className="proto-heading truncate font-semibold text-sm">
        {workspace.name}
      </span>
      <nav className="flex items-center gap-0.5 rounded-full bg-muted p-0.5 text-xs">
        {NAV_LINKS.map((link) => (
          <a
            className={cn(
              "rounded-full px-3 py-1 text-muted-foreground",
              screen === link.key &&
                "bg-card font-medium text-card-foreground shadow-sm"
            )}
            href={protoHref({ screen: link.key })}
            key={link.key}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="hidden items-center gap-1 xl:flex">
        {projects.map((project) => (
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px]",
              project.id === activeProject.id
                ? "border-transparent bg-primary font-medium text-primary-foreground"
                : "border-border text-muted-foreground"
            )}
            key={project.id}
            title={project.name}
          >
            {project.key}
          </span>
        ))}
      </div>
      <button
        className="ml-auto hidden w-44 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-muted-foreground text-xs md:flex"
        type="button"
      >
        <Glyph className="size-3.5" name="search" />
        Search
        <span className="proto-mono ml-auto text-[10px]">⌘K</span>
      </button>
      <button
        aria-label="Notifications"
        className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        type="button"
      >
        <Glyph className="size-4" name="bell" />
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" />
      </button>
      <Avatar person={viewer} size={28} />
      <button
        className="hidden shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs sm:flex"
        type="button"
      >
        <Glyph className="size-3.5" name="plus" />
        New issue
      </button>
    </header>
  )
}

/** 3. Project rail — narrower, project-first: workflow meters + labels. */
function Nav3ProjectRail({ screen }: NavProps) {
  const counts = countsByStatus()
  const total = topLevelIssues.length
  return (
    <aside className="flex w-52 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-sidebar-border border-b px-3 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-bold text-[10px] text-primary-foreground">
          {activeProject.key}
        </span>
        <span className="min-w-0">
          <span className="proto-heading block truncate font-medium text-sm">
            {activeProject.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {workspace.name}
          </span>
        </span>
      </div>
      <nav className="flex flex-col gap-px px-2 pt-2 text-[13px]">
        {NAV_LINKS.map((link) => (
          <ScreenLink
            active={screen === link.key}
            className="flex items-center gap-2 rounded-md px-2 py-1.5"
            key={link.key}
            target={link.key}
          >
            <Glyph
              className="size-3.5 text-muted-foreground"
              name={link.glyph}
            />
            {link.label}
          </ScreenLink>
        ))}
      </nav>
      <SectionTitle className="px-4 pt-4">Workflow</SectionTitle>
      <div className="flex flex-col gap-2 px-3 pt-1.5">
        {statuses.map((status) => (
          <div className="flex flex-col gap-1" key={status.id}>
            <div className="flex items-baseline text-xs">
              <span className="truncate">{status.name}</span>
              <span className="ml-auto pl-2 text-muted-foreground">
                {counts[status.id]}
              </span>
            </div>
            <Meter max={total} value={counts[status.id]} />
          </div>
        ))}
      </div>
      <SectionTitle className="px-4 pt-4">Labels</SectionTitle>
      <div className="flex flex-col gap-px px-2 pt-1">
        {labels.map((label) => (
          <span
            className="flex items-center gap-2 rounded px-2 py-1 text-muted-foreground text-xs"
            key={label.id}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            {label.name}
          </span>
        ))}
      </div>
      <div className="mt-auto border-sidebar-border border-t px-3 py-2 text-[11px] text-muted-foreground">
        {counts["s-done"]} of {total} done
      </div>
    </aside>
  )
}

/** 4. Icon rail — 56px, tooltips, avatar pinned to the bottom. */
function Nav4IconRail({ screen }: NavProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-sidebar-border border-r bg-sidebar py-3 text-sidebar-foreground">
      <span
        className="mb-1 grid size-8 place-items-center rounded-lg bg-primary font-semibold text-[11px] text-primary-foreground"
        title={workspace.name}
      >
        NL
      </span>
      <button
        aria-label="New issue"
        className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        title="New issue"
        type="button"
      >
        <Glyph className="size-4" name="plus" />
      </button>
      {NAV_LINKS.map((item) => (
        <a
          className={cn(
            "grid size-10 place-items-center rounded-lg",
            screen === item.key
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
          href={protoHref({ screen: item.key })}
          key={item.key}
          title={item.label}
        >
          <Glyph className="size-4" name={item.glyph} />
        </a>
      ))}
      <Avatar className="mt-auto" person={viewer} size={28} />
    </nav>
  )
}

/** 5. Double rail — workspace switcher strip + project column. */
function Nav5DoubleRail({ screen }: NavProps) {
  const marks = [
    { mark: "NL", name: workspace.name, current: true },
    { mark: "AC", name: "Acme Corp", current: false },
    { mark: "PE", name: "Personal", current: false },
  ]
  const done = countsByStatus()["s-done"]
  return (
    <div className="flex shrink-0">
      <nav
        aria-label="Workspaces"
        className="flex w-12 flex-col items-center gap-1.5 border-sidebar-border border-r bg-sidebar py-3"
      >
        {marks.map((item) => (
          <span
            className={cn(
              "grid size-8 place-items-center rounded-lg font-semibold text-[10px]",
              item.current
                ? "bg-primary text-primary-foreground"
                : "bg-sidebar-accent text-muted-foreground"
            )}
            key={item.mark}
            title={item.name}
          >
            {item.mark}
          </span>
        ))}
        <button
          aria-label="Add workspace"
          className="mt-auto grid size-8 place-items-center rounded-lg border border-sidebar-border border-dashed text-muted-foreground"
          title="Add workspace"
          type="button"
        >
          <Glyph className="size-3.5" name="plus" />
        </button>
      </nav>
      <aside className="flex w-48 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
        <div className="px-3 pt-3">
          <p className="proto-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            {activeProject.key}
          </p>
          <p className="proto-heading truncate font-medium text-sm">
            {activeProject.name}
          </p>
          <p className="pt-1.5 text-[11px] text-muted-foreground">
            {done} of {topLevelIssues.length} done
          </p>
          <div className="pt-1">
            <Meter max={topLevelIssues.length} value={done} />
          </div>
        </div>
        <nav className="flex flex-col gap-px px-2 pt-2 text-sm">
          {NAV_LINKS.map((link) => (
            <ScreenLink
              active={screen === link.key}
              className="rounded-md px-2 py-1.5"
              key={link.key}
              target={link.key}
            >
              {link.label}
            </ScreenLink>
          ))}
        </nav>
        <SectionTitle className="px-4 pt-4">Saved views</SectionTitle>
        <div className="flex flex-col gap-px px-2 pt-1 text-[13px] text-muted-foreground">
          {savedViews.map((view) => (
            <span className="flex items-center px-2 py-1" key={view.id}>
              {view.name}
              <span className="ml-auto text-[11px]">{view.count}</span>
            </span>
          ))}
        </div>
        <ViewerFooter />
      </aside>
    </div>
  )
}

/** 6. Collapsible — wide rail with a working toggle to an icon strip. */
function Nav6Collapsible({ screen }: NavProps) {
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-sidebar-border border-r bg-sidebar py-3 text-sidebar-foreground">
        <button
          aria-label="Expand navigation"
          className="mb-1 grid size-8 place-items-center rounded-lg hover:bg-sidebar-accent"
          onClick={() => setOpen(true)}
          title="Expand"
          type="button"
        >
          <Glyph className="size-4" name="panel" />
        </button>
        {NAV_LINKS.map((item) => (
          <a
            className={cn(
              "grid size-10 place-items-center rounded-lg",
              screen === item.key
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
            href={protoHref({ screen: item.key })}
            key={item.key}
            title={item.label}
          >
            <Glyph className="size-4" name={item.glyph} />
          </a>
        ))}
        <Avatar className="mt-auto" person={viewer} size={26} />
      </div>
    )
  }
  return (
    <aside className="flex w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pt-3">
        <WorkspaceMark />
        <span className="proto-heading truncate font-medium text-sm">
          {workspace.name}
        </span>
        <button
          aria-label="Collapse navigation"
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => setOpen(false)}
          title="Collapse"
          type="button"
        >
          <Glyph className="size-3.5" name="chevronLeft" />
        </button>
      </div>
      <nav className="flex flex-col gap-px px-2 pt-2 text-sm">
        {NAV_LINKS.map((link) => (
          <ScreenLink
            active={screen === link.key}
            className="flex items-center gap-2 rounded-md px-2 py-1.5"
            key={link.key}
            target={link.key}
          >
            <Glyph
              className="size-3.5 text-muted-foreground"
              name={link.glyph}
            />
            {link.label}
          </ScreenLink>
        ))}
      </nav>
      <SectionTitle className="px-4 pt-4">Projects</SectionTitle>
      <div className="flex flex-col gap-px px-2 pt-1">
        {projects.map((project) => (
          <span
            className="truncate rounded-md px-2 py-1.5 text-muted-foreground text-sm"
            key={project.id}
          >
            {project.key} · {project.name}
          </span>
        ))}
      </div>
      <ViewerFooter />
    </aside>
  )
}

/** 7. Command bar — command-first top bar built around a ⌘K input. */
function Nav7CommandBar({ screen }: NavProps) {
  const open = topLevelIssues.filter((item) => item.statusId !== "s-done")
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-border border-b bg-card px-4">
      <WorkspaceMark size="size-7" />
      <nav className="flex items-center gap-0.5 text-[13px]">
        {NAV_LINKS.map((link) => (
          <a
            className={cn(
              "rounded-md px-2 py-1",
              screen === link.key
                ? "font-medium text-foreground underline decoration-2 decoration-primary underline-offset-8"
                : "text-muted-foreground hover:text-foreground"
            )}
            href={protoHref({ screen: link.key })}
            key={link.key}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <button
        className="mx-auto flex w-full max-w-md items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-left text-muted-foreground text-xs"
        type="button"
      >
        <Glyph className="size-3.5" name="command" />
        <span className="truncate">
          Search issues, jump to a view, or run a command…
        </span>
        <span className="proto-mono ml-auto shrink-0 rounded border border-border px-1 text-[10px]">
          ⌘K
        </span>
      </button>
      <span className="hidden shrink-0 text-[11px] text-muted-foreground md:block">
        {open.length} open
      </span>
      <Avatar person={viewer} size={28} />
    </header>
  )
}

/** 8. People-first rail — presence list up top, nav as a tab grid. */
function Nav8PeopleRail({ screen }: NavProps) {
  const online = people.filter((person) => person.online)
  const assigned = (id: string) =>
    topLevelIssues.filter((item) => item.assigneeId === id).length
  return (
    <aside className="flex w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <SectionTitle className="px-4 pt-3">
        Team · {online.length} online
      </SectionTitle>
      <ul className="flex flex-col gap-px px-2 pt-1.5">
        {people.map((person) => (
          <li
            className="flex items-center gap-2 rounded-md px-2 py-1.5"
            key={person.id}
            title={person.online ? "Online" : "Away"}
          >
            <Avatar person={person} size={24} />
            <span className="min-w-0 truncate text-[13px]">{person.name}</span>
            <span
              className="ml-auto shrink-0 rounded-full bg-sidebar-accent px-1.5 py-px text-[10px] text-muted-foreground"
              title={`${assigned(person.id)} assigned`}
            >
              {assigned(person.id)}
            </span>
          </li>
        ))}
      </ul>
      <SectionTitle className="px-4 pt-3">Saved views</SectionTitle>
      <div className="flex flex-col gap-px px-2 pt-1 text-[13px] text-muted-foreground">
        {savedViews.map((view) => (
          <span className="flex items-center px-2 py-1" key={view.id}>
            {view.name}
            <span className="ml-auto text-[11px]">{view.count}</span>
          </span>
        ))}
      </div>
      <nav className="mt-auto grid grid-cols-2 gap-1.5 border-sidebar-border border-t p-2.5">
        {NAV_LINKS.map((link) => (
          <ScreenLink
            active={screen === link.key}
            className="flex flex-col items-center gap-1 rounded-lg border border-sidebar-border px-2 py-2.5 text-[11px]"
            key={link.key}
            target={link.key}
          >
            <Glyph className="size-4" name={link.glyph} />
            {link.label}
          </ScreenLink>
        ))}
      </nav>
    </aside>
  )
}

export const NAVS: Record<VariantKey, (props: NavProps) => React.ReactNode> = {
  "1": Nav1WideRail,
  "2": Nav2TopBar,
  "3": Nav3ProjectRail,
  "4": Nav4IconRail,
  "5": Nav5DoubleRail,
  "6": Nav6Collapsible,
  "7": Nav7CommandBar,
  "8": Nav8PeopleRail,
}
