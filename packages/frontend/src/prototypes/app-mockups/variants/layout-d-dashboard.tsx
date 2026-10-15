/**
 * PROTOTYPE layout D — "Dashboard first".
 *
 * The home screen answers "what is on fire" before it shows a list: stat
 * tiles, needs-attention, who is loaded, and an activity timeline. Settings
 * is a plain setting-rows list rather than a form grid. Heaviest layout;
 * the bet is that a team lead opens this first every morning.
 */

import { cn } from "cn"
import type { ReactNode } from "react"
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
  countsByStatus,
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
  key: "D",
  name: "Dashboard first",
} as const

export function LayoutD({ screen }: { screen: ScreenKey }) {
  const selected = focusIssue
  return (
    <div className="proto-shell flex h-svh overflow-hidden">
      <IconRail screen={screen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {workspace.name}
            </p>
            <h1 className="proto-heading font-semibold text-base leading-tight">
              {screen === "settings"
                ? "Settings"
                : screen === "board"
                  ? `${activeProject.name} · Board`
                  : screen === "issue"
                    ? "Issue"
                    : "Overview"}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="flex w-64 items-center gap-2 rounded-lg border bg-[var(--proto-surface)] px-3 py-2 text-left text-muted-foreground text-xs"
              type="button"
            >
              <Glyph className="size-3.5" name="search" />
              Search or type a command
              <span className="proto-mono ml-auto text-[10px]">⌘K</span>
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-xs"
              type="button"
            >
              <Glyph className="size-3.5" name="plus" />
              New issue
            </button>
          </div>
        </header>
        {screen === "issues" ? <DashboardScreen /> : null}
        {screen === "board" ? <BoardScreen /> : null}
        {screen === "issue" ? <IssueScreen issue={selected} /> : null}
        {screen === "settings" ? <SettingsList /> : null}
      </div>
    </div>
  )
}

function IconRail({ screen }: { screen: ScreenKey }) {
  const items = [
    { key: "issues", glyph: "inbox", label: "Overview" },
    { key: "board", glyph: "board", label: "Board" },
    { key: "issue", glyph: "list", label: "Issue" },
    { key: "settings", glyph: "sliders", label: "Settings" },
  ] as const
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-sidebar-border border-r bg-sidebar py-3">
      <span className="mb-2 grid size-8 place-items-center rounded-lg bg-primary font-semibold text-[11px] text-primary-foreground">
        NL
      </span>
      {items.map((item) => (
        <a
          className={cn(
            "grid size-9 place-items-center rounded-lg",
            screen === item.key
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent"
          )}
          href={protoHref({ screen: item.key })}
          key={item.key}
          title={item.label}
        >
          <Glyph className="size-4" name={item.glyph} />
        </a>
      ))}
      <div className="mt-auto flex flex-col items-center gap-3">
        <Glyph className="size-4 text-muted-foreground" name="bell" />
        <Avatar person={viewer} size={28} />
      </div>
    </nav>
  )
}

const BAR_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const

function StatTile({
  label,
  value,
  hint,
  tone,
  bars,
}: {
  label: string
  value: string
  hint: string
  tone: string
  bars: number[]
}) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: tone }}
        />
        {label}
      </span>
      <span className="proto-heading font-semibold text-2xl">{value}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
      <span className="mt-1 flex h-6 items-end gap-1">
        {BAR_DAYS.map((day, index) => {
          const bar = bars[index] ?? 0
          return (
            <span
              className="flex-1 rounded-sm"
              key={`${label}-${day}`}
              style={{
                backgroundColor: tone,
                height: `${Math.max(12, bar)}%`,
                opacity: 0.25 + index * 0.12,
              }}
            />
          )
        })}
      </span>
    </article>
  )
}

function DashboardScreen() {
  const attention = topLevelIssues.filter(
    (issue) => issue.priority === "Urgent" || issue.dueDate !== null
  )
  const byPerson = people
    .map((person) => ({
      person,
      count: topLevelIssues.filter((issue) => issue.assigneeId === person.id)
        .length,
    }))
    .sort((a, b) => b.count - a.count)
  const maxLoad = Math.max(1, ...byPerson.map((row) => row.count))
  const counts = countsByStatus()

  return (
    <div className="proto-scroll proto-grid-bg flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="grid grid-cols-4 gap-4">
          <StatTile
            bars={[40, 55, 48, 70, 62, 88, 74]}
            hint={`${projectProgress.total} total in ${activeProject.key}`}
            label="Open issues"
            tone="var(--proto-info)"
            value={`${projectProgress.total - projectProgress.done}`}
          />
          <StatTile
            bars={[20, 30, 25, 45, 60, 52, 66]}
            hint="2 overdue, 1 due today"
            label="Urgent"
            tone="var(--destructive)"
            value={`${projectProgress.urgent}`}
          />
          <StatTile
            bars={[80, 62, 70, 44, 38, 30, 22]}
            hint="Worth assigning before Friday"
            label="Unassigned"
            tone="var(--proto-warn)"
            value={`${projectProgress.unassigned}`}
          />
          <StatTile
            bars={[15, 24, 38, 42, 58, 70, 82]}
            hint="Three closed by Farah"
            label="Done this week"
            tone="var(--proto-ok)"
            value={`${projectProgress.done}`}
          />
        </div>

        <div className="grid grid-cols-[1.6fr_1fr] gap-4">
          <section className="flex flex-col rounded-xl border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <h2 className="proto-heading font-semibold text-sm">
                Needs attention
              </h2>
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                {attention.length}
              </span>
              <a
                className="ml-auto text-muted-foreground text-xs hover:text-foreground"
                href={protoHref({ screen: "board" })}
              >
                View board
              </a>
            </header>
            <div className="flex flex-col">
              {attention.map((issue) => (
                <a
                  className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-accent/40"
                  href={protoHref({ screen: "issue" })}
                  key={issue.id}
                >
                  <PriorityMark priority={issue.priority} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <KeyTag issue={issue} />
                      <StatusPill status={issueStatus(issue)} withDot={false} />
                    </span>
                    <span className="truncate text-sm">{issue.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <DueChip dueDate={issue.dueDate} />
                    <IssueAssignee issue={issue} />
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section className="flex flex-col rounded-xl border bg-card">
            <header className="border-b px-4 py-3">
              <h2 className="proto-heading font-semibold text-sm">Activity</h2>
            </header>
            <ol className="flex flex-col gap-3 p-4">
              {activity.map((entry) => {
                const actor = personOf(entry.actorId)
                return (
                  <li className="flex gap-3" key={entry.id}>
                    <Avatar person={actor} size={24} />
                    <div className="min-w-0">
                      <p className="text-xs">
                        <span className="font-medium">{actor?.name}</span>{" "}
                        <span className="text-muted-foreground">
                          {entry.summary}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {entry.issueIdentifier} · {relativeTime(entry.at)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <SectionTitle>Workflow</SectionTitle>
            {statuses.map((status) => (
              <div className="flex items-center gap-3" key={status.id}>
                <span className="w-24 text-xs">{status.name}</span>
                <div className="flex-1">
                  <Meter
                    max={topLevelIssues.length}
                    value={counts[status.id] ?? 0}
                  />
                </div>
                <span className="w-6 text-right text-muted-foreground text-xs">
                  {counts[status.id]}
                </span>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <SectionTitle>Team load</SectionTitle>
            {byPerson.map((row) => (
              <div className="flex items-center gap-3" key={row.person.id}>
                <Avatar person={row.person} size={22} />
                <span className="w-24 truncate text-xs">{row.person.name}</span>
                <div className="flex-1">
                  <Meter max={maxLoad} value={row.count} />
                </div>
                <span className="w-6 text-right text-muted-foreground text-xs">
                  {row.count}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

function BoardScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b px-6 py-3">
        {statuses.map((status) => (
          <span className="flex items-center gap-2 text-xs" key={status.id}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: categoryTone(status) }}
            />
            {status.name}
            <span className="text-muted-foreground">
              {issuesInStatus(status.id).length}
            </span>
          </span>
        ))}
        <span className="ml-auto text-muted-foreground text-xs">
          Drag to change status · changes sync live
        </span>
      </div>
      <div className="proto-scroll flex min-h-0 flex-1 gap-4 overflow-x-auto p-6">
        {statuses.map((status) => (
          <section
            className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-[var(--proto-surface)] p-2"
            key={status.id}
          >
            <header className="flex shrink-0 items-center gap-2 px-2 py-1.5">
              <h2 className="font-medium text-xs">{status.name}</h2>
              <span className="text-[11px] text-muted-foreground">
                {issuesInStatus(status.id).length}
              </span>
              <Glyph className="ml-auto size-3.5 opacity-50" name="plus" />
            </header>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {issuesInStatus(status.id).map((issue) => (
                <article
                  className="flex flex-col gap-1.5 rounded-lg border border-transparent bg-card p-3 shadow-sm hover:border-ring"
                  key={issue.id}
                >
                  <div className="flex items-center gap-2">
                    <KeyTag issue={issue} />
                    <PriorityMark priority={issue.priority} />
                  </div>
                  <p className="text-sm leading-snug">{issue.title}</p>
                  <div className="flex items-center gap-1.5">
                    {labelsOf(issue)
                      .slice(0, 1)
                      .map((label) => (
                        <LabelChip key={label.id} label={label} />
                      ))}
                    <span className="ml-auto flex items-center gap-2">
                      <DueChip dueDate={issue.dueDate} />
                      <IssueAssignee issue={issue} />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function IssueScreen({ issue }: { issue: Issue }) {
  const children = subtasksOf(issue)
  const status = issueStatus(issue)
  return (
    <div className="proto-scroll flex-1 overflow-auto">
      <div
        className="border-b px-6 py-6"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklch, ${categoryTone(status)} 14%, transparent), transparent)`,
        }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex items-center gap-2 text-xs">
            <a
              className="text-muted-foreground hover:text-foreground"
              href={protoHref({ screen: "issues" })}
            >
              Overview
            </a>
            <Glyph className="size-3 opacity-50" name="chevronRight" />
            <KeyTag issue={issue} />
          </div>
          <h1 className="proto-heading max-w-3xl font-semibold text-3xl leading-tight">
            {issue.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            <PriorityMark priority={issue.priority} withLabel />
            {labelsOf(issue).map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
            <span className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
              <Avatar person={personOf(issue.assigneeId)} size={22} />
              {personOf(issue.assigneeId)?.name ?? "Unassigned"}
              <DueChip dueDate={issue.dueDate} />
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-5xl grid-cols-[1.5fr_1fr] gap-6 p-6">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionTitle>Description</SectionTitle>
            <p className="text-sm leading-relaxed">
              {issue.description ?? "No description yet."}
            </p>
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <SectionTitle>Subtasks</SectionTitle>
              <span className="text-muted-foreground text-xs">
                {children.filter((child) => child.statusId === "s-done").length}{" "}
                of {children.length}
              </span>
            </div>
            {children.map((child) => (
              <div
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                key={child.id}
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
                <span className="truncate text-sm">{child.title}</span>
                <span className="ml-auto">
                  <Avatar person={personOf(child.assigneeId)} size={20} />
                </span>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-3">
            <SectionTitle>Comments</SectionTitle>
            <div className="flex gap-3">
              <Avatar person={viewer} size={28} />
              <div className="flex-1 rounded-lg border bg-card px-3 py-2 text-muted-foreground text-sm">
                Write a comment…
              </div>
            </div>
          </section>
        </div>
        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-xs">
            <SectionTitle>Details</SectionTitle>
            <Row label="Reporter" value={personOf("u-6")?.name ?? "—"} />
            <Row label="Project" value={activeProject.name} />
            <Row
              label="Last write"
              value={
                issue.updatedAt === null || issue.updatedAt === undefined
                  ? "recently"
                  : relativeTime(issue.updatedAt)
              }
            />
            <Row label="Watchers" value={`${people.length - 2} people`} />
          </section>
          <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <SectionTitle>External links</SectionTitle>
            {externalLinks.map((link) => (
              <a
                className="flex items-center gap-2 text-xs"
                href={link.url}
                key={link.id}
              >
                <Glyph
                  className="size-3.5 text-muted-foreground"
                  name="branch"
                />
                <span className="proto-mono truncate">{link.label}</span>
                <span className="ml-auto text-muted-foreground">
                  {link.meta}
                </span>
              </a>
            ))}
          </section>
          <button
            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 font-medium text-primary-foreground text-xs"
            type="button"
          >
            <Glyph className="size-3.5" name="check" />
            Mark as done
          </button>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function SettingsList() {
  return (
    <div className="proto-scroll flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <section className="rounded-xl border bg-card">
          <ListHeader title="Workspace" />
          <SettingRow label="Name" hint="Shown to every member">
            <input
              className="w-56 rounded-lg border bg-background px-2 py-1.5 text-sm"
              defaultValue={workspace.name}
            />
          </SettingRow>
          <SettingRow
            label="Project key"
            hint="Prefix for new issue identifiers"
          >
            <input
              className="proto-mono w-24 rounded-lg border bg-background px-2 py-1.5 text-sm"
              defaultValue={activeProject.key}
            />
          </SettingRow>
          <SettingRow
            label="Projects"
            hint={`${projects.length} in this workspace`}
          >
            <span className="flex gap-1.5">
              {projects.map((project) => (
                <span
                  className="proto-mono rounded-full border px-2 py-0.5 text-[10px]"
                  key={project.id}
                >
                  {project.key}
                </span>
              ))}
            </span>
          </SettingRow>
        </section>

        <section className="rounded-xl border bg-card">
          <ListHeader action={`${members.length} members`} title="Members" />
          {people.map((person) => (
            <div
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              key={person.id}
            >
              <Avatar person={person} size={28} />
              <span className="min-w-0">
                <span className="block truncate text-sm">{person.name}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {person.handle}@northwind.dev
                </span>
              </span>
              <select
                className="ml-auto rounded-lg border bg-background px-2 py-1 text-xs"
                defaultValue={person.role}
              >
                <option>Owner</option>
                <option>Admin</option>
                <option>Member</option>
              </select>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              className="flex-1 rounded-lg border bg-background px-2 py-1.5 text-sm"
              placeholder="teammate@northwind.dev"
            />
            <button
              className="rounded-lg bg-primary px-3 py-2 text-primary-foreground text-xs"
              type="button"
            >
              Invite
            </button>
          </div>
        </section>

        <section className="rounded-xl border bg-card">
          <ListHeader
            action={`${pendingInvites.length} pending`}
            title="Invites"
          />
          {pendingInvites.map((invite) => (
            <div
              className="flex items-center gap-2 border-b px-4 py-2.5 text-sm last:border-b-0"
              key={invite.email}
            >
              <Glyph className="size-4 text-muted-foreground" name="mail" />
              {invite.email}
              <span className="ml-auto text-muted-foreground text-xs">
                {invite.role}
              </span>
              <button
                className="text-muted-foreground text-xs hover:text-destructive"
                type="button"
              >
                Revoke
              </button>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-card">
          <ListHeader title="Labels" />
          <div className="flex flex-wrap gap-2 p-4">
            {labels.map((label) => (
              <LabelChip key={label.id} label={label} variant="outline" />
            ))}
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <Glyph className="size-4 text-destructive" name="alert" />
          <div className="text-sm">
            <p className="font-medium">Delete this project</p>
            <p className="text-muted-foreground text-xs">
              {topLevelIssues.length} issues, {statuses.length} statuses and all
              history will be removed.
            </p>
          </div>
          <button
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-destructive/50 px-3 py-1.5 text-destructive text-xs"
            type="button"
          >
            <Glyph className="size-3.5" name="trash" />
            Delete
          </button>
        </section>
      </div>
    </div>
  )
}

function ListHeader({ title, action }: { title: string; action?: string }) {
  return (
    <header className="flex items-center gap-2 border-b px-4 py-3">
      <h2 className="proto-heading font-semibold text-sm">{title}</h2>
      {action === undefined ? null : (
        <span className="text-muted-foreground text-xs">{action}</span>
      )}
    </header>
  )
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-muted-foreground text-xs">{hint}</span>
      </span>
      <span className="ml-auto">{children}</span>
    </div>
  )
}
