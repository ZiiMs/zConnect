/**
 * PROTOTYPE layout A — "Rail + dense list".
 *
 * Linear-style master–detail: a narrow rail owns navigation, the main column
 * owns the issue query, and the detail slides in as a third column instead of
 * replacing anything. Rows are single-line and 28px tall so fourteen issues
 * fit without scrolling.
 */

import { cn } from "cn"
import { useState } from "react"
import type { Issue } from "@/lib/api"
import {
  Avatar,
  categoryTone,
  DueChip,
  Glyph,
  IssueAssignee,
  issueStatus,
  KeyTag,
  LabelChip,
  PriorityMark,
  SectionTitle,
  StatusPill,
} from "../atoms"
import type { ScreenKey } from "../prototype-config"
import {
  activeProject,
  countsByStatus,
  externalLinks,
  focusIssue,
  issuesInStatus,
  labelsOf,
  members,
  pendingInvites,
  people,
  personOf,
  projects,
  relativeTime,
  savedViews,
  statuses,
  subtasksOf,
  topLevelIssues,
  viewer,
  workspace,
} from "../stub-data"
import { protoHref } from "../use-proto-params"

export const meta = {
  key: "A",
  name: "Rail + dense list",
} as const

export function LayoutA({ screen }: { screen: ScreenKey }) {
  const [railOpen, setRailOpen] = useState(true)
  const [selectedId, setSelectedId] = useState(focusIssue.id)
  const selected =
    topLevelIssues.find((item) => item.id === selectedId) ?? focusIssue

  return (
    <div className="proto-shell flex h-svh overflow-hidden">
      {railOpen ? <Rail screen={screen} /> : null}
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onToggleRail={() => setRailOpen((open) => !open)}
          screen={screen}
          title={
            screen === "settings"
              ? "Workspace settings"
              : `${activeProject.name} · Issues`
          }
        />
        {screen === "issues" ? <IssuesScreen /> : null}
        {screen === "board" ? <BoardScreen /> : null}
        {screen === "issue" ? (
          <IssuesScreen
            compact
            onSelect={(issue) => setSelectedId(issue.id)}
            selectedId={selected.id}
          />
        ) : null}
        {screen === "settings" ? <SettingsScreen /> : null}
      </main>
      {screen === "issue" ? <DetailPane issue={selected} /> : null}
    </div>
  )
}

function Rail({ screen }: { screen: ScreenKey }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <button
        className="flex items-center gap-2 px-3 py-3 text-left"
        type="button"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary font-semibold text-[11px] text-primary-foreground">
          NL
        </span>
        <span className="proto-heading truncate font-medium text-sm">
          {workspace.name}
        </span>
        <Glyph className="ml-auto size-3.5 opacity-60" name="chevronDown" />
      </button>

      <div className="px-2 pb-2">
        <button
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border px-2 py-1.5 text-left text-muted-foreground text-xs hover:bg-sidebar-accent"
          type="button"
        >
          <Glyph className="size-3.5" name="search" />
          <span>Search</span>
          <span className="proto-mono ml-auto rounded border px-1 text-[10px]">
            ⌘K
          </span>
        </button>
      </div>

      <nav className="flex flex-col gap-px px-2">
        <RailItem badge={3} glyph="inbox" label="Inbox" />
        <RailItem badge={4} glyph="sparkle" label="My issues" />
        <RailItem
          active={screen === "issues" || screen === "board"}
          badge={topLevelIssues.length}
          glyph="list"
          label="All issues"
        />
      </nav>

      <div className="mt-4 flex flex-col gap-px px-2">
        <SectionTitle className="px-2 pb-1">Projects</SectionTitle>
        {projects.map((project) => {
          const active = project.id === activeProject.id
          return (
            <button
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                active && "bg-sidebar-accent font-medium"
              )}
              key={project.id}
              type="button"
            >
              <span className="proto-mono w-7 shrink-0 text-[10px] text-muted-foreground">
                {project.key}
              </span>
              <span className="truncate">{project.name}</span>
              {active ? (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {topLevelIssues.length}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-px px-2">
        <SectionTitle className="px-2 pb-1">Saved views</SectionTitle>
        {savedViews.map((view) => (
          <button
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground text-xs hover:bg-sidebar-accent"
            key={view.id}
            type="button"
          >
            <Glyph className="size-3.5" name="filter" />
            <span className="truncate">{view.name}</span>
            <span className="ml-auto">{view.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-sidebar-border border-t px-3 py-2">
        <Avatar person={viewer} size={24} />
        <div className="min-w-0">
          <p className="truncate text-xs">{viewer.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {viewer.handle}@{workspace.name.toLowerCase().replace(" ", "")}
          </p>
        </div>
        <a
          aria-label="Workspace settings"
          className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
          href={protoHref({ screen: "settings" })}
          title="Workspace settings"
        >
          <Glyph className="size-3.5" name="sliders" />
        </a>
      </div>
    </aside>
  )
}

function RailItem({
  glyph,
  label,
  badge,
  active,
}: {
  glyph: "inbox" | "sparkle" | "list"
  label: string
  badge: number
  active?: boolean
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent"
      )}
      type="button"
    >
      <Glyph className="size-3.5" name={glyph} />
      <span>{label}</span>
      <span className="ml-auto text-[11px]">{badge}</span>
    </button>
  )
}

function TopBar({
  title,
  screen,
  onToggleRail,
}: {
  title: string
  screen: ScreenKey
  onToggleRail: () => void
}) {
  const views = [
    { key: "issues", glyph: "list", label: "List" },
    { key: "board", glyph: "board", label: "Board" },
  ] as const
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <button
        aria-label="Toggle navigation"
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        onClick={onToggleRail}
        type="button"
      >
        <Glyph className="size-4" name="panel" />
      </button>
      <h1 className="proto-heading truncate font-medium text-sm">{title}</h1>
      <div className="ml-2 flex items-center gap-px rounded-md border p-0.5">
        {views.map((view) => (
          <a
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-xs",
              screen === view.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60"
            )}
            href={protoHref({ screen: view.key })}
            key={view.key}
          >
            <Glyph className="size-3.5" name={view.glyph} />
            {view.label}
          </a>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {people.slice(0, 4).map((person) => (
            <Avatar
              className="ring-2 ring-background"
              key={person.id}
              person={person}
              size={22}
            />
          ))}
        </div>
        <button
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
          type="button"
        >
          <Glyph className="size-3.5" name="filter" />
          Filter
        </button>
        <button
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="plus" />
          New issue
        </button>
      </div>
    </header>
  )
}

function FilterStrip() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">Filters</span>
      {savedViews.slice(0, 2).map((view) => (
        <span
          className="rounded-full border px-2 py-0.5 text-[11px]"
          key={view.id}
        >
          {view.name}
        </span>
      ))}
      <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
        Assignee: me
        <Glyph className="size-2.5 opacity-60" name="close" />
      </span>
      <button
        className="ml-auto text-muted-foreground hover:text-foreground"
        type="button"
      >
        Clear
      </button>
    </div>
  )
}

function IssueRow({
  issue,
  selected,
  onClick,
}: {
  issue: Issue
  selected: boolean
  onClick?: (issue: Issue) => void
}) {
  const content = (
    <div className="grid grid-cols-[1.25rem_3.5rem_1fr_auto_auto_1.5rem] items-center gap-3 px-3 py-1.5">
      <PriorityMark priority={issue.priority} />
      <KeyTag issue={issue} />
      <span className="truncate text-sm">{issue.title}</span>
      <span className="flex items-center gap-1">
        {labelsOf(issue).map((label) => (
          <LabelChip key={label.id} label={label} variant="bare" />
        ))}
      </span>
      <DueChip dueDate={issue.dueDate} />
      <IssueAssignee issue={issue} />
    </div>
  )
  if (onClick) {
    return (
      <button
        className={cn(
          "w-full border-transparent border-l-2 text-left hover:bg-accent/60",
          selected && "border-l-primary bg-accent/70"
        )}
        onClick={() => onClick(issue)}
        type="button"
      >
        {content}
      </button>
    )
  }
  return (
    <a
      className="block border-transparent border-l-2 hover:bg-accent/60"
      href={protoHref({ screen: "issue" })}
    >
      {content}
    </a>
  )
}

function IssuesScreen({
  compact = false,
  selectedId,
  onSelect,
}: {
  compact?: boolean
  selectedId?: string
  onSelect?: (issue: Issue) => void
}) {
  const counts = countsByStatus()
  return (
    <>
      {compact ? null : <FilterStrip />}
      <div className="proto-scroll flex-1 overflow-auto">
        {statuses.map((status) => {
          const group = issuesInStatus(status.id)
          if (compact && group.length === 0) return null
          return (
            <section key={status.id}>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-1.5 backdrop-blur">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: categoryTone(status) }}
                />
                <h2 className="proto-heading font-medium text-xs">
                  {status.name}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {counts[status.id]}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                  {status.category}
                </span>
              </div>
              {group.map((issue) => (
                <IssueRow
                  issue={issue}
                  key={issue.id}
                  onClick={onSelect}
                  selected={issue.id === selectedId}
                />
              ))}
              {compact ? null : (
                <button
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground text-xs hover:bg-accent/40"
                  type="button"
                >
                  <Glyph className="size-3" name="plus" />
                  Add issue to {status.name}
                </button>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}

function BoardScreen() {
  return (
    <>
      <FilterStrip />
      <div className="proto-scroll flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {statuses.map((status) => {
          const group = issuesInStatus(status.id)
          return (
            <section
              className="flex max-h-full w-72 shrink-0 flex-col rounded-lg border bg-[var(--proto-surface)]"
              key={status.id}
            >
              <header className="flex shrink-0 items-center gap-2 px-3 py-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: categoryTone(status) }}
                />
                <h2 className="proto-heading font-medium text-xs">
                  {status.name}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {group.length}
                </span>
                <Glyph className="ml-auto size-3.5 opacity-50" name="more" />
              </header>
              <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {group.map((issue) => (
                  <article
                    className="rounded-md border bg-card p-2 shadow-sm"
                    key={issue.id}
                  >
                    <div className="flex items-center gap-2">
                      <PriorityMark priority={issue.priority} />
                      <KeyTag issue={issue} />
                      <span className="ml-auto">
                        <IssueAssignee issue={issue} />
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{issue.title}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {labelsOf(issue)
                        .slice(0, 2)
                        .map((label) => (
                          <LabelChip key={label.id} label={label} />
                        ))}
                      <span className="ml-auto">
                        <DueChip dueDate={issue.dueDate} />
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

function DetailPane({ issue }: { issue: Issue }) {
  const children = subtasksOf(issue)
  const done = children.filter((child) => child.statusId === "s-done").length
  const updated =
    issue.updatedAt === null || issue.updatedAt === undefined
      ? "recently"
      : relativeTime(issue.updatedAt)
  return (
    <aside className="proto-scroll w-[26rem] shrink-0 overflow-y-auto border-l bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <KeyTag issue={issue} />
        <span className="ml-auto flex items-center gap-1">
          <a
            aria-label="Full page"
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            href={protoHref({ screen: "issue" })}
          >
            <Glyph className="size-3.5" name="expand" />
          </a>
          <a
            aria-label="Close"
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            href={protoHref({ screen: "issues" })}
          >
            <Glyph className="size-3.5" name="close" />
          </a>
        </span>
      </header>
      <div className="flex flex-col gap-4 p-4">
        <h2 className="proto-heading font-semibold text-base">{issue.title}</h2>
        <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-2 gap-y-2 text-xs">
          <span className="text-muted-foreground">Status</span>
          <span>
            <StatusPill status={issueStatus(issue)} />
          </span>
          <span className="text-muted-foreground">Priority</span>
          <PriorityMark priority={issue.priority} withLabel />
          <span className="text-muted-foreground">Assignee</span>
          <span className="flex items-center gap-1.5">
            <Avatar person={personOf(issue.assigneeId)} size={18} />
            {personOf(issue.assigneeId)?.name ?? "Unassigned"}
          </span>
          <span className="text-muted-foreground">Due</span>
          <DueChip dueDate={issue.dueDate} />
          <span className="text-muted-foreground">Labels</span>
          <span className="flex flex-wrap gap-1">
            {labelsOf(issue).map((label) => (
              <LabelChip key={label.id} label={label} variant="outline" />
            ))}
          </span>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {issue.description}
        </p>
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SectionTitle>Subtasks</SectionTitle>
            <span className="text-[11px] text-muted-foreground">
              {done}/{children.length}
            </span>
          </div>
          {children.map((child) => (
            <div
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
              key={child.id}
            >
              <Glyph
                className={cn(
                  "size-3.5",
                  child.statusId === "s-done" && "text-[var(--proto-ok)]"
                )}
                name="check"
              />
              <KeyTag issue={child} />
              <span className="truncate">{child.title}</span>
              <span className="ml-auto">
                <Avatar person={personOf(child.assigneeId)} size={16} />
              </span>
            </div>
          ))}
        </section>
        <section className="flex flex-col gap-2">
          <SectionTitle>Activity</SectionTitle>
          <div className="flex gap-2">
            <Avatar person={viewer} size={20} />
            <div className="flex-1 rounded-md border px-2 py-1.5 text-muted-foreground text-xs">
              Leave a comment…
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Updated {updated} · {externalLinks.length} external links
          </p>
        </section>
      </div>
    </aside>
  )
}

function SettingsScreen() {
  const [tab, setTab] = useState("members")
  const tabs = ["general", "members", "statuses", "labels"] as const
  return (
    <div className="proto-scroll flex flex-1 gap-6 overflow-auto p-6">
      <nav className="flex w-40 shrink-0 flex-col gap-px">
        {tabs.map((item) => (
          <button
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm capitalize",
              tab === item
                ? "bg-accent font-medium"
                : "text-muted-foreground hover:bg-accent/50"
            )}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="flex max-w-2xl flex-1 flex-col gap-5">
        {tab === "members" ? (
          <>
            <div className="rounded-lg border">
              <header className="flex items-center gap-2 border-b px-3 py-2">
                <h2 className="proto-heading font-medium text-sm">Members</h2>
                <span className="text-[11px] text-muted-foreground">
                  {members.length}
                </span>
                <button
                  className="ml-auto rounded-md bg-primary px-2 py-1 text-primary-foreground text-xs"
                  type="button"
                >
                  Invite
                </button>
              </header>
              {people.map((person) => (
                <div
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                  key={person.id}
                >
                  <Avatar person={person} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{person.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {person.handle}@northwind.dev
                    </p>
                  </div>
                  <span className="proto-mono ml-auto rounded border px-1.5 py-0.5 text-[10px]">
                    {person.role}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border">
              <header className="border-b px-3 py-2">
                <h2 className="proto-heading font-medium text-sm">
                  Pending invites
                </h2>
              </header>
              {pendingInvites.map((invite) => (
                <div
                  className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                  key={invite.email}
                >
                  <Glyph
                    className="size-3.5 text-muted-foreground"
                    name="mail"
                  />
                  {invite.email}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {invite.role}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {tab === "general" ? (
          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <label className="flex flex-col gap-1.5 text-xs">
              Workspace name
              <input
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                defaultValue={workspace.name}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              Project key
              <input
                className="proto-mono w-24 rounded-md border bg-background px-2 py-1.5 text-sm"
                defaultValue={activeProject.key}
              />
            </label>
            <div className="border-t pt-3">
              <button
                className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1 text-destructive text-xs"
                type="button"
              >
                <Glyph className="size-3.5" name="trash" />
                Delete project
              </button>
            </div>
          </div>
        ) : null}
        {tab === "statuses" ? (
          <div className="flex flex-col rounded-lg border">
            {statuses.map((status) => (
              <div
                className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                key={status.id}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: categoryTone(status) }}
                />
                <span className="text-sm">{status.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {status.category}
                </span>
                <button
                  className="ml-auto text-muted-foreground text-xs hover:text-destructive"
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {tab === "labels" ? (
          <div className="flex flex-wrap gap-2 rounded-lg border p-4">
            {topLevelIssues
              .flatMap((issue) => labelsOf(issue))
              .filter(
                (label, index, all) =>
                  all.findIndex((item) => item.id === label.id) === index
              )
              .map((label) => (
                <LabelChip key={label.id} label={label} variant="outline" />
              ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
