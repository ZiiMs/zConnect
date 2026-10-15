/**
 * PROTOTYPE layout B — "Top bar + board first".
 *
 * No rail at all: navigation is a single horizontal bar, the board is the
 * home screen rather than a view you switch to, and content runs full-bleed
 * with generous hit areas. Where A is dense, B is roomy — the bet is that a
 * board people can actually read beats a list people can only scan.
 */

import { cn } from "cn"
import type { ReactNode } from "react"
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
  Meter,
  PriorityMark,
  SectionTitle,
  StatusPill,
} from "../atoms"
import type { ScreenKey } from "../prototype-config"
import {
  activeProject,
  activity,
  externalLinks,
  focusIssue,
  issuesInStatus,
  labels,
  labelsOf,
  members,
  pendingInvites,
  people,
  personOf,
  projectProgress,
  projects,
  relativeTime,
  statuses,
  subtasksOf,
  topLevelIssues,
  viewer,
  workspace,
} from "../stub-data"
import { protoHref } from "../use-proto-params"

export const meta = {
  key: "B",
  name: "Top bar + board first",
} as const

export function LayoutB({ screen }: { screen: ScreenKey }) {
  const [selectedId, setSelectedId] = useState(focusIssue.id)
  const selected =
    topLevelIssues.find((item) => item.id === selectedId) ?? focusIssue
  return (
    <div className="proto-shell flex h-svh flex-col overflow-hidden">
      <TopBar screen={screen} />
      {screen === "settings" ? null : <Toolbar screen={screen} />}
      {screen === "board" ? <BoardScreen /> : null}
      {screen === "issues" ? <ListScreen /> : null}
      {screen === "issue" ? (
        <DetailScreen
          issue={selected}
          onSelect={(next) => setSelectedId(next.id)}
        />
      ) : null}
      {screen === "settings" ? <SettingsScreen /> : null}
    </div>
  )
}

function TopBar({ screen }: { screen: ScreenKey }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-primary font-semibold text-[11px] text-primary-foreground">
          NL
        </span>
        <span className="proto-heading font-semibold text-sm">
          {workspace.name}
        </span>
      </div>
      <nav className="flex items-center gap-1">
        {projects.map((project) => {
          const active = project.id === activeProject.id
          return (
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
              key={project.id}
              type="button"
            >
              <span className="proto-mono text-[10px] opacity-70">
                {project.key}
              </span>
              {project.name}
            </button>
          )
        })}
        <button
          aria-label="Add project"
          className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent"
          type="button"
        >
          <Glyph className="size-3.5" name="plus" />
        </button>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button
          className="flex w-56 items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-left text-muted-foreground text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="search" />
          Search issues
          <span className="proto-mono ml-auto text-[10px]">⌘K</span>
        </button>
        <button
          aria-label="Notifications"
          className="relative grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent"
          type="button"
        >
          <Glyph className="size-4" name="bell" />
          <span
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
            style={{ backgroundColor: "var(--destructive)" }}
          />
        </button>
        <a
          aria-label="Workspace settings"
          className={cn(
            "grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent",
            screen === "settings" && "bg-accent text-accent-foreground"
          )}
          href={protoHref({ screen: "settings" })}
        >
          <Glyph className="size-4" name="sliders" />
        </a>
        <Avatar person={viewer} size={28} />
        <button
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="plus" />
          New issue
        </button>
      </div>
    </header>
  )
}

function Toolbar({ screen }: { screen: ScreenKey }) {
  const views = [
    { key: "board", glyph: "board", label: "Board" },
    { key: "issues", glyph: "list", label: "List" },
  ] as const
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b px-5">
      <nav className="flex items-center gap-1 text-xs">
        <button
          className="text-muted-foreground hover:text-foreground"
          type="button"
        >
          Projects
        </button>
        <Glyph className="size-3 opacity-50" name="chevronRight" />
        <span className="font-medium">{activeProject.name}</span>
      </nav>
      <span className="h-4 w-px bg-border" />
      <div className="flex items-center gap-0.5 rounded-full border p-0.5">
        {views.map((view) => (
          <a
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs",
              screen === view.key
                ? "bg-primary font-medium text-primary-foreground"
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
      <div className="flex items-center gap-1.5">
        <button
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="filter" />
          Filters
          <span className="rounded-full bg-accent px-1.5 text-[10px]">2</span>
        </button>
        <button
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="users" />
          Assignee
        </button>
        <button
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-muted-foreground text-xs"
          type="button"
        >
          <Glyph className="size-3.5" name="sliders" />
          Group: Status
        </button>
      </div>
      <div className="ml-auto flex items-center gap-3 text-muted-foreground text-xs">
        <span>{topLevelIssues.length} issues</span>
        <span className="flex -space-x-1.5">
          {people.slice(0, 5).map((person) => (
            <Avatar
              className="ring-2 ring-card"
              key={person.id}
              person={person}
              size={22}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

function BoardScreen() {
  return (
    <div className="proto-scroll proto-grid-bg flex flex-1 gap-4 overflow-x-auto p-5">
      {statuses.map((status) => {
        const group = issuesInStatus(status.id)
        const urgent = group.filter(
          (issue) => issue.priority === "Urgent"
        ).length
        return (
          <section
            className="flex max-h-full w-80 shrink-0 flex-col rounded-xl border bg-card"
            key={status.id}
          >
            <span
              className="h-1 w-full shrink-0 rounded-t-xl"
              style={{ backgroundColor: categoryTone(status) }}
            />
            <header className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <h2 className="proto-heading font-semibold text-sm">
                  {status.name}
                </h2>
                <span className="rounded-full bg-accent px-1.5 text-[11px]">
                  {group.length}
                </span>
                <Glyph className="ml-auto size-4 opacity-50" name="more" />
              </div>
              <Meter
                max={topLevelIssues.length}
                tone={categoryTone(status)}
                value={group.length}
              />
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                {status.category}
                {urgent > 0 ? ` · ${urgent} urgent` : ""}
              </p>
            </header>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
              {group.map((issue) => (
                <article
                  className="rounded-lg border bg-background p-3 shadow-sm transition-shadow hover:shadow-md"
                  key={issue.id}
                >
                  <div className="flex items-center gap-2">
                    <KeyTag issue={issue} />
                    <span className="ml-auto">
                      <PriorityMark priority={issue.priority} />
                    </span>
                  </div>
                  <p className="mt-1.5 font-medium text-sm leading-snug">
                    {issue.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {issue.description ?? "No description yet."}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {labelsOf(issue).map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 border-t pt-2">
                    <IssueAssignee issue={issue} />
                    <span className="text-[11px] text-muted-foreground">
                      {personOf(issue.assigneeId)?.name.split(" ")[0] ??
                        "Unassigned"}
                    </span>
                    <span className="ml-auto">
                      <DueChip dueDate={issue.dueDate} />
                    </span>
                  </div>
                </article>
              ))}
              <button
                className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-xs hover:bg-accent/40"
                type="button"
              >
                <Glyph className="size-3.5" name="plus" />
                Add issue
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ListScreen() {
  return (
    <div className="proto-scroll flex-1 overflow-auto px-5 py-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        {statuses.map((status) => {
          const group = issuesInStatus(status.id)
          return (
            <section className="flex flex-col gap-2" key={status.id}>
              <header className="flex items-center gap-2 pt-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: categoryTone(status) }}
                />
                <h2 className="proto-heading font-semibold text-sm">
                  {status.name}
                </h2>
                <span className="text-muted-foreground text-xs">
                  {group.length}
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {group.map((issue) => (
                  <a
                    className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-ring"
                    href={protoHref({ screen: "issue" })}
                    key={issue.id}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <KeyTag issue={issue} />
                        <PriorityMark priority={issue.priority} />
                      </span>
                      <span className="truncate font-medium text-sm">
                        {issue.title}
                      </span>
                      <span className="line-clamp-1 text-muted-foreground text-xs">
                        {issue.description ?? "No description yet."}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {labelsOf(issue).map((label) => (
                        <LabelChip key={label.id} label={label} />
                      ))}
                    </span>
                    <DueChip dueDate={issue.dueDate} />
                    <IssueAssignee issue={issue} />
                  </a>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function DetailScreen({
  issue,
  onSelect,
}: {
  issue: Issue
  onSelect: (issue: Issue) => void
}) {
  const children = subtasksOf(issue)
  const done = children.filter((child) => child.statusId === "s-done").length
  return (
    <div className="proto-scroll flex-1 overflow-auto">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_20rem] gap-8 px-5 py-6">
        <div className="flex min-w-0 flex-col gap-5">
          <nav className="flex items-center gap-1 text-xs">
            <a
              className="text-muted-foreground hover:text-foreground"
              href={protoHref({ screen: "board" })}
            >
              Board
            </a>
            <Glyph className="size-3 opacity-50" name="chevronRight" />
            <KeyTag issue={issue} />
          </nav>
          <h1 className="proto-heading font-semibold text-2xl leading-tight">
            {issue.title}
          </h1>
          <div className="flex items-center gap-2">
            <StatusPill status={issueStatus(issue)} />
            <PriorityMark priority={issue.priority} withLabel />
            <span className="text-muted-foreground text-xs">
              opened by {personOf("u-6")?.name}
            </span>
          </div>
          <p className="text-sm leading-relaxed">
            {issue.description ?? "No description yet."}
          </p>

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <SectionTitle>Subtasks</SectionTitle>
              <span className="text-muted-foreground text-xs">
                {done} of {children.length} done
              </span>
              <div className="ml-auto w-32">
                <Meter max={children.length} value={done} />
              </div>
            </div>
            {children.map((child) => (
              <button
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent/50"
                key={child.id}
                onClick={() => onSelect(child)}
                type="button"
              >
                <Glyph
                  className={cn(
                    "size-4",
                    child.statusId === "s-done"
                      ? "text-[var(--proto-ok)]"
                      : "text-muted-foreground"
                  )}
                  name="check"
                />
                <KeyTag issue={child} />
                <span className="truncate">{child.title}</span>
                <span className="ml-auto">
                  <StatusPill status={issueStatus(child)} withDot={false} />
                </span>
              </button>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>Activity</SectionTitle>
            <div className="flex gap-3 rounded-xl border bg-card p-3">
              <Avatar person={viewer} size={28} />
              <div className="flex-1 rounded-lg border px-3 py-2 text-muted-foreground text-sm">
                Leave a comment…
              </div>
            </div>
            {activity.map((entry) => {
              const actor = personOf(entry.actorId)
              return (
                <div className="flex gap-3" key={entry.id}>
                  <Avatar person={actor} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{actor?.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {entry.summary}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {entry.issueIdentifier} · {relativeTime(entry.at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <SectionTitle>Properties</SectionTitle>
            <Field label="Status">
              <StatusPill status={issueStatus(issue)} />
            </Field>
            <Field label="Assignee">
              <span className="flex items-center gap-2 text-sm">
                <Avatar person={personOf(issue.assigneeId)} size={22} />
                {personOf(issue.assigneeId)?.name ?? "Unassigned"}
              </span>
            </Field>
            <Field label="Priority">
              <PriorityMark priority={issue.priority} withLabel />
            </Field>
            <Field label="Due date">
              {issue.dueDate ? (
                <DueChip dueDate={issue.dueDate} />
              ) : (
                <span className="text-muted-foreground text-xs">Not set</span>
              )}
            </Field>
            <Field label="Labels">
              <span className="flex flex-wrap gap-1.5">
                {labelsOf(issue).map((label) => (
                  <LabelChip key={label.id} label={label} variant="outline" />
                ))}
              </span>
            </Field>
          </section>
          <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <SectionTitle>External links</SectionTitle>
            {externalLinks.map((link) => (
              <a
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-accent/50"
                href={link.url}
                key={link.id}
              >
                <Glyph className="size-3.5 text-muted-foreground" name="link" />
                <span className="proto-mono">{link.label}</span>
                <span className="ml-auto text-muted-foreground">
                  {link.meta}
                </span>
              </a>
            ))}
          </section>
          <button
            className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 px-3 py-2 text-destructive text-xs"
            type="button"
          >
            <Glyph className="size-3.5" name="trash" />
            Archive issue
          </button>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  )
}

function SettingsScreen() {
  const [tab, setTab] = useState<"general" | "members" | "labels">("members")
  return (
    <div className="proto-scroll flex-1 overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-6">
        <div>
          <h1 className="proto-heading font-semibold text-2xl">
            Workspace settings
          </h1>
          <p className="text-muted-foreground text-sm">
            {workspace.name} · {members.length} members · {projects.length}{" "}
            projects
          </p>
        </div>
        <div className="flex gap-1 border-b">
          {(["general", "members", "labels"] as const).map((item) => (
            <button
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm capitalize",
                tab === item
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              key={item}
              onClick={() => setTab(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "members" ? (
          <div className="grid grid-cols-2 gap-4">
            {people.map((person) => (
              <article
                className="flex items-center gap-3 rounded-xl border bg-card p-4"
                key={person.id}
              >
                <Avatar person={person} size={40} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{person.name}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {person.handle}@northwind.dev
                  </p>
                </div>
                <span className="proto-mono ml-auto rounded-full border px-2 py-0.5 text-[10px]">
                  {person.role}
                </span>
              </article>
            ))}
            <article className="col-span-2 flex flex-col gap-3 rounded-xl border border-dashed p-4">
              <SectionTitle>Pending invites</SectionTitle>
              <div className="flex flex-col gap-2">
                {pendingInvites.map((invite) => (
                  <div
                    className="flex items-center gap-2 text-sm"
                    key={invite.email}
                  >
                    <Glyph
                      className="size-4 text-muted-foreground"
                      name="mail"
                    />
                    {invite.email}
                    <span className="ml-auto text-muted-foreground text-xs">
                      {invite.role}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : null}
        {tab === "general" ? (
          <div className="grid grid-cols-2 gap-4">
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <SectionTitle>Workspace</SectionTitle>
              <Field label="Name">
                <input
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                  defaultValue={workspace.name}
                />
              </Field>
              <Field label="Project key">
                <input
                  className="proto-mono w-24 rounded-lg border bg-background px-3 py-2 text-sm"
                  defaultValue={activeProject.key}
                />
              </Field>
              <button
                className="self-start rounded-full bg-primary px-3 py-1.5 text-primary-foreground text-xs"
                type="button"
              >
                Save changes
              </button>
            </section>
            <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <SectionTitle>Workflow</SectionTitle>
              {statuses.map((status) => (
                <div
                  className="flex items-center gap-2 text-sm"
                  key={status.id}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: categoryTone(status) }}
                  />
                  {status.name}
                  <span className="ml-auto text-muted-foreground text-xs">
                    {issuesInStatus(status.id).length} issues
                  </span>
                </div>
              ))}
              <p className="text-muted-foreground text-xs">
                {projectProgress.done} of {projectProgress.total} issues are
                done.
              </p>
            </section>
          </div>
        ) : null}
        {tab === "labels" ? (
          <div className="grid grid-cols-2 gap-4">
            {labels.map((label) => (
              <article
                className="flex items-center gap-3 rounded-xl border bg-card p-4"
                key={label.id}
              >
                <LabelChip label={label} variant="outline" />
                <span
                  className="ml-auto size-5 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="proto-mono text-[11px] text-muted-foreground">
                  {label.color}
                </span>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
