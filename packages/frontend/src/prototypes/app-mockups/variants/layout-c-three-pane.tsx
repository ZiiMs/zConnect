/**
 * PROTOTYPE layout C — "Three panes".
 *
 * Project rail, a wide data table, and a detail pane that never closes. The
 * bet: on a laptop the whole issue fits on screen at once, and nobody has to
 * click a row to find out what it says. Cost: less room for the table.
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
  key: "C",
  name: "Three panes",
} as const

export function LayoutC({ screen }: { screen: ScreenKey }) {
  const [selectedId, setSelectedId] = useState(focusIssue.id)
  const [memberId, setMemberId] = useState(people[1].id)
  const selected =
    topLevelIssues.find((item) => item.id === selectedId) ?? focusIssue
  return (
    <div className="proto-shell flex h-svh overflow-hidden">
      <Rail screen={screen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <h1 className="proto-heading font-medium text-sm">
            {screen === "settings"
              ? `${workspace.name} · Settings`
              : activeProject.name}
          </h1>
          <div className="ml-3 flex items-center gap-1 text-xs">
            {(["issues", "board", "issue"] as const).map((key) => (
              <a
                className={cn(
                  "rounded border px-2 py-0.5",
                  screen === key
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
                href={protoHref({ screen: key })}
                key={key}
              >
                {key === "issues"
                  ? "Table"
                  : key === "board"
                    ? "Board"
                    : "Focus"}
              </a>
            ))}
          </div>
          <button
            className="ml-auto flex w-64 items-center gap-2 rounded border px-2 py-1 text-left text-muted-foreground text-xs"
            type="button"
          >
            <Glyph className="size-3.5" name="search" />
            Filter issues…
            <span className="proto-mono ml-auto text-[10px]">⌘K</span>
          </button>
          <button
            className="flex items-center gap-1 rounded bg-primary px-2 py-1 font-medium text-primary-foreground text-xs"
            type="button"
          >
            <Glyph className="size-3.5" name="plus" />
            New
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {screen === "issues" ? (
              <IssueTable
                onSelect={(issue) => setSelectedId(issue.id)}
                selectedId={selected.id}
              />
            ) : null}
            {screen === "issue" ? (
              <IssueTable
                onSelect={(issue) => setSelectedId(issue.id)}
                selectedId={selected.id}
              />
            ) : null}
            {screen === "board" ? (
              <CompactBoard
                onSelect={(issue) => setSelectedId(issue.id)}
                selectedId={selected.id}
              />
            ) : null}
            {screen === "settings" ? (
              <SettingsPanes memberId={memberId} onSelectMember={setMemberId} />
            ) : null}
          </div>
          {screen === "settings" ? (
            <MemberPane memberId={memberId} />
          ) : (
            <DetailPane full={screen === "issue"} issue={selected} />
          )}
        </div>
        <footer className="flex h-7 shrink-0 items-center gap-3 border-t bg-[var(--proto-surface)] px-3 text-[11px] text-muted-foreground">
          <span>{topLevelIssues.length} issues</span>
          <span>2 filters</span>
          <span className="flex items-center gap-1">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: "var(--proto-ok)" }}
            />
            Realtime connected
          </span>
          <span className="ml-auto">Last write 12m ago</span>
        </footer>
      </div>
    </div>
  )
}

function Rail({ screen }: { screen: ScreenKey }) {
  const counts = countsByStatus()
  return (
    <aside className="flex w-60 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-sidebar-border border-b px-3 py-2.5">
        <span className="grid size-6 place-items-center rounded bg-primary font-semibold text-[10px] text-primary-foreground">
          NL
        </span>
        <span className="truncate font-medium text-sm">{workspace.name}</span>
        <a
          className="ml-auto text-muted-foreground hover:text-foreground"
          href={protoHref({ screen: "settings" })}
          title="Settings"
        >
          <Glyph className="size-3.5" name="sliders" />
        </a>
      </div>
      <SectionTitle className="px-3 pt-3">Projects</SectionTitle>
      <div className="flex flex-col px-2 py-1">
        {projects.map((project) => {
          const active = project.id === activeProject.id
          return (
            <button
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                active
                  ? "bg-sidebar-accent font-medium"
                  : "hover:bg-sidebar-accent"
              )}
              key={project.id}
              type="button"
            >
              <span className="proto-mono w-8 text-[10px] text-muted-foreground">
                {project.key}
              </span>
              <span className="truncate">{project.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {active ? topLevelIssues.length : 0}
              </span>
            </button>
          )
        })}
      </div>
      <SectionTitle className="px-3 pt-3">Workflow</SectionTitle>
      <div className="flex flex-col gap-1 px-3 py-1.5">
        {statuses.map((status) => (
          <div className="flex items-center gap-2 text-xs" key={status.id}>
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: categoryTone(status) }}
            />
            <span className={cn(screen === "board" && "font-medium")}>
              {status.name}
            </span>
            <span className="ml-auto text-muted-foreground">
              {counts[status.id]}
            </span>
          </div>
        ))}
      </div>
      <SectionTitle className="px-3 pt-3">Labels</SectionTitle>
      <div className="flex flex-wrap gap-1.5 px-3 py-1.5">
        {labels.map((label) => (
          <LabelChip key={label.id} label={label} variant="bare" />
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 border-sidebar-border border-t px-3 py-2 text-xs">
        <Avatar person={viewer} size={22} />
        <span className="truncate">{viewer.name}</span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <Glyph className="size-3.5" name="logOut" />
        </span>
      </div>
    </aside>
  )
}

function IssueTable({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (issue: Issue) => void
}) {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--proto-surface)] text-left">
          <tr className="text-[11px] text-muted-foreground uppercase">
            <th className="w-20 border-b px-2 py-2 font-medium">Key</th>
            <th className="border-b px-2 py-2 font-medium">Issue</th>
            <th className="w-28 border-b px-2 py-2 font-medium">Status</th>
            <th className="w-24 border-b px-2 py-2 font-medium">Priority</th>
            <th className="w-28 border-b px-2 py-2 font-medium">Assignee</th>
            <th className="w-24 border-b px-2 py-2 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {statuses.flatMap((status) =>
            issuesInStatus(status.id).map((issue) => {
              const active = issue.id === selectedId
              return (
                <tr
                  className={cn(
                    "cursor-pointer border-b",
                    active ? "bg-accent/70" : "hover:bg-accent/40"
                  )}
                  key={issue.id}
                  onClick={() => onSelect(issue)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      onSelect(issue)
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryTone(status) }}
                      />
                      <KeyTag issue={issue} />
                    </span>
                  </td>
                  <td className="max-w-0 px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{issue.title}</span>
                      <span className="flex shrink-0 gap-1">
                        {labelsOf(issue)
                          .slice(0, 1)
                          .map((label) => (
                            <LabelChip key={label.id} label={label} />
                          ))}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusPill status={status} withDot={false} />
                  </td>
                  <td className="px-2 py-1.5">
                    <PriorityMark priority={issue.priority} withLabel />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2 text-xs">
                      <IssueAssignee issue={issue} />
                      <span className="truncate text-muted-foreground">
                        {personOf(issue.assigneeId)?.name ?? "—"}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <DueChip dueDate={issue.dueDate} />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function CompactBoard({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (issue: Issue) => void
}) {
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-2 overflow-auto p-3">
      {statuses.map((status) => (
        <section
          className="flex w-60 shrink-0 flex-col rounded border bg-[var(--proto-surface)]"
          key={status.id}
        >
          <header className="flex items-center gap-2 border-b px-2 py-1.5">
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: categoryTone(status) }}
            />
            <h2 className="font-medium text-xs">{status.name}</h2>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {issuesInStatus(status.id).length}
            </span>
          </header>
          <div className="flex flex-col divide-y">
            {issuesInStatus(status.id).map((issue) => (
              <button
                className={cn(
                  "flex flex-col gap-1 px-2 py-1.5 text-left hover:bg-accent/40",
                  issue.id === selectedId && "bg-accent/70"
                )}
                key={issue.id}
                onClick={() => onSelect(issue)}
                type="button"
              >
                <span className="flex items-center gap-1.5">
                  <KeyTag issue={issue} />
                  <PriorityMark priority={issue.priority} />
                </span>
                <span className="line-clamp-2 text-xs">{issue.title}</span>
                <span className="flex items-center gap-1.5">
                  <Avatar person={personOf(issue.assigneeId)} size={16} />
                  <DueChip dueDate={issue.dueDate} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DetailPane({ issue, full }: { issue: Issue; full: boolean }) {
  const children = subtasksOf(issue)
  const done = children.filter((child) => child.statusId === "s-done").length
  return (
    <aside className="proto-scroll flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l bg-card">
      <header className="sticky top-0 flex items-center gap-2 border-b bg-card px-3 py-2">
        <KeyTag issue={issue} />
        <StatusPill status={issueStatus(issue)} withDot={false} />
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <Glyph className="size-3.5" name="link" />
          <Glyph className="size-3.5" name="more" />
        </span>
      </header>
      <div className="flex flex-col gap-4 p-3">
        <h2 className="proto-heading font-semibold text-sm leading-snug">
          {issue.title}
        </h2>
        <dl className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Assignee</dt>
          <dd className="flex items-center gap-1.5">
            <Avatar person={personOf(issue.assigneeId)} size={18} />
            {personOf(issue.assigneeId)?.name ?? "Unassigned"}
          </dd>
          <dt className="text-muted-foreground">Priority</dt>
          <dd>
            <PriorityMark priority={issue.priority} withLabel />
          </dd>
          <dt className="text-muted-foreground">Due</dt>
          <dd>
            <DueChip dueDate={issue.dueDate} />
          </dd>
          <dt className="text-muted-foreground">Labels</dt>
          <dd className="flex flex-wrap gap-1">
            {labelsOf(issue).map((label) => (
              <LabelChip key={label.id} label={label} variant="outline" />
            ))}
          </dd>
        </dl>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {issue.description ?? "No description yet."}
        </p>
        {full ? (
          <>
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <SectionTitle>Subtasks</SectionTitle>
                <span className="text-[10px] text-muted-foreground">
                  {done}/{children.length}
                </span>
                <div className="ml-auto w-20">
                  <Meter max={children.length} value={done} />
                </div>
              </div>
              {children.map((child) => (
                <div
                  className="flex items-center gap-2 border-b pb-1.5 text-xs last:border-b-0"
                  key={child.id}
                >
                  <Glyph
                    className="size-3.5 text-muted-foreground"
                    name="check"
                  />
                  <KeyTag issue={child} />
                  <span className="truncate">{child.title}</span>
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-2">
              <SectionTitle>Activity</SectionTitle>
              {activity.slice(0, 4).map((entry) => {
                const actor = personOf(entry.actorId)
                return (
                  <div className="flex gap-2 text-xs" key={entry.id}>
                    <Avatar person={actor} size={18} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{actor?.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {entry.summary}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {relativeTime(entry.at)}
                      </span>
                    </span>
                  </div>
                )
              })}
              <div className="flex gap-2 border-t pt-2">
                <Avatar person={viewer} size={18} />
                <div className="flex-1 rounded border px-2 py-1 text-muted-foreground text-xs">
                  Comment…
                </div>
              </div>
            </section>
            <section className="flex flex-col gap-1.5">
              <SectionTitle>External links</SectionTitle>
              {externalLinks.map((link) => (
                <a
                  className="flex items-center gap-2 text-xs"
                  href={link.url}
                  key={link.id}
                >
                  <Glyph
                    className="size-3 text-muted-foreground"
                    name="branch"
                  />
                  <span className="proto-mono truncate">{link.label}</span>
                  <span className="ml-auto text-muted-foreground">
                    {link.meta}
                  </span>
                </a>
              ))}
            </section>
            <div className="flex gap-2 border-t pt-3">
              <button
                className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
                type="button"
              >
                <Glyph className="size-3.5" name="check" />
                Mark done
              </button>
              <button
                className="flex items-center gap-1 rounded border border-destructive/40 px-2 py-1 text-destructive text-xs"
                type="button"
              >
                <Glyph className="size-3.5" name="trash" />
                Delete
              </button>
            </div>
          </>
        ) : (
          <a
            className="self-start rounded border px-2 py-1 text-xs hover:bg-accent"
            href={protoHref({ screen: "issue" })}
          >
            Open full view
          </a>
        )}
      </div>
    </aside>
  )
}

function SettingsPanes({
  memberId,
  onSelectMember,
}: {
  memberId: string
  onSelectMember: (id: string) => void
}) {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <div className="flex flex-col gap-6 p-4">
        <section className="flex flex-col gap-3">
          <SectionTitle>Members</SectionTitle>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--proto-surface)] text-left text-[11px] text-muted-foreground uppercase">
              <tr>
                <th className="border-b px-2 py-2 font-medium">Member</th>
                <th className="w-28 border-b px-2 py-2 font-medium">Role</th>
                <th className="w-24 border-b px-2 py-2 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const assigned = topLevelIssues.filter(
                  (issue) => issue.assigneeId === person.id
                ).length
                return (
                  <tr
                    className={cn(
                      "cursor-pointer border-b",
                      person.id === memberId
                        ? "bg-accent/70"
                        : "hover:bg-accent/40"
                    )}
                    key={person.id}
                    onClick={() => onSelectMember(person.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onSelectMember(person.id)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar person={person} size={20} />
                        <span>{person.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {person.handle}
                        </span>
                      </span>
                    </td>
                    <td className="proto-mono px-2 py-2 text-xs">
                      {person.role}
                    </td>
                    <td className="px-2 py-2 text-xs">{assigned}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        <section className="flex flex-col gap-3">
          <SectionTitle>Pending invites</SectionTitle>
          {pendingInvites.map((invite) => (
            <div
              className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
              key={invite.email}
            >
              <Glyph className="size-3.5 text-muted-foreground" name="mail" />
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
        <section className="flex flex-col gap-3">
          <SectionTitle>Workflow statuses</SectionTitle>
          {statuses.map((status, index) => (
            <div
              className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
              key={status.id}
            >
              <span className="proto-mono text-muted-foreground text-xs">
                {index + 1}
              </span>
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: categoryTone(status) }}
              />
              <input
                className="flex-1 bg-transparent text-sm"
                defaultValue={status.name}
              />
              <span className="text-muted-foreground text-xs">
                {status.category}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function MemberPane({ memberId }: { memberId: string }) {
  const person = personOf(memberId)
  if (person === null) return null
  const assigned = topLevelIssues.filter(
    (issue) => issue.assigneeId === person.id
  )
  return (
    <aside className="proto-scroll flex w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar person={person} size={44} />
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{person.name}</p>
          <p className="truncate text-muted-foreground text-xs">
            {person.handle}@northwind.dev
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-xs">
        <label className="flex flex-col gap-1">
          Role
          <select
            className="rounded border bg-background px-2 py-1.5 text-sm"
            defaultValue={person.role}
          >
            <option>Owner</option>
            <option>Admin</option>
            <option>Member</option>
          </select>
        </label>
        <p className="text-muted-foreground">
          Added {relativeTime("2026-09-28T10:00:00.000Z")} · {members.length}{" "}
          members in this workspace
        </p>
      </div>
      <section className="flex flex-col gap-2">
        <SectionTitle>Assigned issues ({assigned.length})</SectionTitle>
        {assigned.map((issue) => (
          <a
            className="flex flex-col gap-0.5 rounded border px-2 py-1.5 hover:bg-accent/40"
            href={protoHref({ screen: "issue" })}
            key={issue.id}
          >
            <span className="flex items-center gap-1.5">
              <KeyTag issue={issue} />
              <PriorityMark priority={issue.priority} />
            </span>
            <span className="line-clamp-1 text-xs">{issue.title}</span>
          </a>
        ))}
      </section>
      <button
        className="mt-auto flex items-center justify-center gap-1.5 rounded border border-destructive/40 px-2 py-1.5 text-destructive text-xs"
        type="button"
      >
        <Glyph className="size-3.5" name="trash" />
        Remove from workspace
      </button>
    </aside>
  )
}
