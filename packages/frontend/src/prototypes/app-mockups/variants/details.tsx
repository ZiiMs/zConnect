/**
 * PROTOTYPE (throwaway) — issue detail variants Detail1–Detail8.
 * Self-contained: each picks its own focus issue internally. No nav.
 */

import { cn } from "cn"
import { useState } from "react"
import type { Issue } from "@/lib/api"
import {
  Avatar,
  categoryTone,
  DueChip,
  Glyph,
  issueStatus,
  KeyTag,
  LabelChip,
  Meter,
  PriorityMark,
  SectionTitle,
  StatusPill,
} from "../atoms"
import {
  activeProject,
  activity,
  externalLinks,
  focusIssue,
  labelsOf,
  people,
  personOf,
  relativeTime,
  subtasksOf,
  topLevelIssues,
  viewer,
} from "../stub-data"
import { protoHref } from "../use-proto-params"

/** The 4 issues the picker cycles through (first is ZC-161). */
const PICK_ISSUES = topLevelIssues.slice(0, 4)

function useFocus() {
  const [id, setId] = useState(focusIssue.id)
  const issue = topLevelIssues.find((item) => item.id === id) ?? focusIssue
  return { issue, id, setId }
}

function Picker({
  current,
  onPick,
}: {
  current: string
  onPick: (id: string) => void
}) {
  const index = Math.max(
    0,
    PICK_ISSUES.findIndex((item) => item.id === current)
  )
  const step = (delta: number) => {
    const next =
      PICK_ISSUES[(index + delta + PICK_ISSUES.length) % PICK_ISSUES.length]
    if (next) onPick(next.id)
  }
  const button =
    "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        aria-label="Previous issue"
        className={button}
        onClick={() => step(-1)}
        type="button"
      >
        <Glyph className="size-3.5" name="chevronLeft" />
      </button>
      <select
        aria-label="Focus issue"
        className="max-w-28 rounded-md border bg-card px-1 py-1 text-xs"
        onChange={(event) => onPick(event.target.value)}
        value={current}
      >
        {PICK_ISSUES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.identifier}
          </option>
        ))}
      </select>
      <button
        aria-label="Next issue"
        className={button}
        onClick={() => step(1)}
        type="button"
      >
        <Glyph className="size-3.5" name="chevronRight" />
      </button>
    </div>
  )
}

function BackLink({ label = "Issues" }: { label?: string }) {
  return (
    <a
      className="inline-flex items-center gap-0.5 text-muted-foreground text-xs hover:text-foreground"
      href={protoHref({ screen: "issues" })}
    >
      <Glyph className="size-3.5" name="chevronLeft" />
      {label}
    </a>
  )
}

function PropRow({
  term,
  children,
}: {
  term: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">{children}</dd>
    </div>
  )
}

/** Activity for the issue, falling back to recent items. */
function feedFor(issue: Issue) {
  const matches = activity.filter(
    (entry) => entry.issueIdentifier === issue.identifier
  )
  return matches.length > 0 ? matches : activity.slice(0, 3)
}

function CommentBox() {
  return (
    <div className="flex items-center gap-2">
      <Avatar person={viewer} size={24} />
      <div className="flex-1 rounded-lg border bg-card px-3 py-2 text-muted-foreground text-xs">
        Leave a comment…
      </div>
    </div>
  )
}

function Detail1SidePane() {
  const { issue, id, setId } = useFocus()
  const children = subtasksOf(issue)
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <BackLink />
          <Picker current={id} onPick={setId} />
        </div>
        <div className="mt-8">
          <KeyTag issue={issue} />
          <h1 className="proto-heading mt-1 font-semibold text-xl">
            {issue.title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill status={issueStatus(issue)} />
            <PriorityMark priority={issue.priority} withLabel />
          </div>
          <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
            {issue.description ?? "No description yet."}
          </p>
          <div className="mt-8 flex items-center gap-2 border-t pt-3 text-muted-foreground text-xs">
            <span>{children.length} subtasks</span>
            <span aria-hidden="true">·</span>
            <span>{externalLinks.length} links</span>
            <span aria-hidden="true">·</span>
            <DueChip dueDate={issue.dueDate} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail2FullPage() {
  const { issue, id, setId } = useFocus()
  const children = subtasksOf(issue)
  const labels = labelsOf(issue)
  const assignee = personOf(issue.assigneeId)
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <article className="mx-auto max-w-4xl px-6 py-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            <a
              className="hover:text-foreground"
              href={protoHref({ screen: "issues" })}
            >
              Issues
            </a>
            <span aria-hidden="true"> › </span>
            <span className="proto-mono">{issue.identifier}</span>
          </p>
          <Picker current={id} onPick={setId} />
        </div>
        <h1 className="proto-heading mt-3 font-semibold text-3xl leading-tight">
          {issue.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <StatusPill status={issueStatus(issue)} />
          <PriorityMark priority={issue.priority} withLabel />
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Avatar person={assignee} size={18} />
            {assignee?.name ?? "Unassigned"}
          </span>
          <DueChip dueDate={issue.dueDate} />
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-relaxed">
          {issue.description ?? "No description yet."}
        </p>
        <section className="mt-8">
          <SectionTitle>Subtasks · {children.length}</SectionTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {children.length === 0 ? (
              <li className="text-muted-foreground text-xs">
                No subtasks yet.
              </li>
            ) : (
              children.map((child) => (
                <li
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
                  key={child.id}
                >
                  <KeyTag issue={child} />
                  <span className="flex-1 truncate">{child.title}</span>
                  <StatusPill status={issueStatus(child)} />
                </li>
              ))
            )}
          </ul>
        </section>
      </article>
    </div>
  )
}

function Detail3Hero() {
  const { issue, id, setId } = useFocus()
  const status = issueStatus(issue)
  const labels = labelsOf(issue)
  const assignee = personOf(issue.assigneeId)
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <div
        className="border-b px-6 pt-5 pb-8"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklch, ${categoryTone(status)} 18%, transparent), transparent)`,
        }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-2">
            <BackLink />
            <Picker current={id} onPick={setId} />
          </div>
          <div className="mt-6 flex items-center gap-2">
            <StatusPill status={status} />
            <KeyTag issue={issue} />
          </div>
          <h1 className="proto-heading mt-2 max-w-3xl font-semibold text-3xl leading-tight">
            {issue.title}
          </h1>
        </div>
      </div>
      <div className="mx-auto grid max-w-4xl gap-8 px-6 py-6 md:grid-cols-[1.5fr_1fr]">
        <p className="text-sm leading-relaxed">
          {issue.description ?? "No description yet."}
        </p>
        <dl>
          <PropRow term="Assignee">
            <Avatar person={assignee} size={18} />
            <span>{assignee?.name ?? "Unassigned"}</span>
          </PropRow>
          <PropRow term="Priority">
            <PriorityMark priority={issue.priority} withLabel />
          </PropRow>
          <PropRow term="Due">
            <DueChip dueDate={issue.dueDate} />
          </PropRow>
          <PropRow term="Labels">
            <span className="flex flex-wrap justify-end gap-1">
              {labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </span>
          </PropRow>
        </dl>
      </div>
    </div>
  )
}

function Detail4TwoColumn() {
  const { issue, id, setId } = useFocus()
  const children = subtasksOf(issue)
  const labels = labelsOf(issue)
  const assignee = personOf(issue.assigneeId)
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <BackLink />
          <Picker current={id} onPick={setId} />
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-[1.5fr_1fr]">
          <div className="min-w-0">
            <KeyTag issue={issue} />
            <h1 className="proto-heading mt-1 font-semibold text-xl leading-snug">
              {issue.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed">
              {issue.description ?? "No description yet."}
            </p>
            <SectionTitle className="mt-6">
              Subtasks · {children.length}
            </SectionTitle>
            <ul className="mt-2 divide-y rounded-xl border">
              {children.length === 0 ? (
                <li className="px-3 py-2 text-muted-foreground text-xs">
                  No subtasks yet.
                </li>
              ) : (
                children.map((child) => (
                  <li
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                    key={child.id}
                  >
                    <Glyph
                      className="size-3.5 text-muted-foreground"
                      name="chevronRight"
                    />
                    <KeyTag issue={child} />
                    <span className="truncate">{child.title}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <aside className="h-fit rounded-xl border bg-card p-4">
            <SectionTitle>Properties</SectionTitle>
            <dl className="mt-1 divide-y">
              <PropRow term="Status">
                <StatusPill status={issueStatus(issue)} />
              </PropRow>
              <PropRow term="Assignee">
                <Avatar person={assignee} size={18} />
                <span>{assignee?.name ?? "Unassigned"}</span>
              </PropRow>
              <PropRow term="Priority">
                <PriorityMark priority={issue.priority} withLabel />
              </PropRow>
              <PropRow term="Due">
                <DueChip dueDate={issue.dueDate} />
              </PropRow>
              <PropRow term="Labels">
                <span className="flex flex-wrap justify-end gap-1">
                  {labels.map((label) => (
                    <LabelChip key={label.id} label={label} />
                  ))}
                </span>
              </PropRow>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Detail5Timeline() {
  const { issue, id, setId } = useFocus()
  const feed = feedFor(issue)
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <BackLink />
          <Picker current={id} onPick={setId} />
        </div>
        <KeyTag className="mt-4" issue={issue} />
        <h1 className="proto-heading mt-1 font-semibold text-xl">
          {issue.title}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusPill status={issueStatus(issue)} />
          <DueChip dueDate={issue.dueDate} />
        </div>
        <ol className="mt-6 flex flex-col gap-5 border-l pl-5">
          {feed.map((entry) => {
            const person = personOf(entry.actorId)
            return (
              <li className="flex gap-3" key={entry.id}>
                <Avatar person={person} size={28} />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">
                      {person?.name ?? "Someone"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {entry.summary}
                    </span>
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {entry.issueIdentifier} · {relativeTime(entry.at)}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <section className="mt-6 rounded-xl bg-muted p-4">
          <SectionTitle>Description</SectionTitle>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            {issue.description ?? "No description yet."}
          </p>
        </section>
        <div className="mt-4">
          <CommentBox />
        </div>
      </div>
    </div>
  )
}

function Detail6PropsRail() {
  const { issue, id, setId } = useFocus()
  const labels = labelsOf(issue)
  const children = subtasksOf(issue)
  const reporter = personOf("u-6")
  const watchers = people.slice(0, 3)
  return (
    <div className="flex min-h-0 flex-1">
      <div className="proto-scroll min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <BackLink />
          <Picker current={id} onPick={setId} />
        </div>
        <KeyTag className="mt-4" issue={issue} />
        <h1 className="proto-heading mt-1 font-semibold text-xl">
          {issue.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={issueStatus(issue)} />
          <PriorityMark priority={issue.priority} withLabel />
          <DueChip dueDate={issue.dueDate} />
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed">
          {issue.description ?? "No description yet."}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
        <SectionTitle className="mt-6">
          Links · {externalLinks.length}
        </SectionTitle>
        <ul className="mt-2 flex max-w-2xl flex-col gap-1.5">
          {externalLinks.map((link) => (
            <li className="flex items-center gap-2 text-xs" key={link.id}>
              <Glyph className="size-3.5 text-muted-foreground" name="link" />
              <span className="font-medium">{link.label}</span>
              <span className="truncate text-muted-foreground">
                {link.meta}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <aside className="flex w-60 shrink-0 flex-col gap-5 overflow-auto border-l bg-card px-4 py-5 text-xs">
        <section>
          <SectionTitle>Details</SectionTitle>
          <div className="mt-2 flex flex-col gap-2.5">
            <p className="flex items-center gap-2">
              <Avatar person={reporter} size={18} />
              <span className="text-muted-foreground">Reporter ·</span>{" "}
              {reporter?.name}
            </p>
            <p>
              <span className="text-muted-foreground">Project ·</span>{" "}
              {activeProject.name}
            </p>
            <p>
              <span className="text-muted-foreground">Updated ·</span>{" "}
              {issue.updatedAt == null
                ? "recently"
                : relativeTime(issue.updatedAt)}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Watchers ·</span>
              <span className="flex -space-x-1.5">
                {watchers.map((person) => (
                  <Avatar key={person.id} person={person} size={18} />
                ))}
              </span>
            </p>
          </div>
        </section>
        <section>
          <SectionTitle>Subtasks · {children.length}</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1.5">
            {children.map((child) => (
              <li className="flex items-center gap-1.5" key={child.id}>
                <KeyTag issue={child} />
                <span className="truncate">{child.title}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

function Detail7Minimal() {
  const { issue } = useFocus()
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto px-6 py-10">
      <div className="mx-auto max-w-xl">
        <p className="proto-mono text-muted-foreground text-xs">
          {issue.identifier}
        </p>
        <h1 className="proto-heading mt-2 font-medium text-2xl leading-tight">
          {issue.title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed">
          {issue.description ?? "No description yet."}
        </p>
      </div>
    </div>
  )
}

function Detail8Checklist() {
  const { issue, id, setId } = useFocus()
  const children = subtasksOf(issue)
  const done = children.filter((child) => child.statusId === "s-done").length
  const feed = feedFor(issue)
  return (
    <div className="flex min-h-0 flex-1">
      <div className="proto-scroll min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <KeyTag issue={issue} />
          <Picker current={id} onPick={setId} />
        </div>
        <h1 className="proto-heading mt-1 font-semibold text-xl">
          {issue.title}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
          {issue.description ?? "No description yet."}
        </p>
        <div className="mt-4 max-w-2xl rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">Subtasks</span>
            <span className="text-muted-foreground">
              {done} of {children.length} done
            </span>
          </div>
          <div className="mt-2">
            <Meter max={children.length} value={done} />
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {children.length === 0 ? (
              <li className="text-muted-foreground text-xs">
                No subtasks yet.
              </li>
            ) : (
              children.map((child) => {
                const finished = child.statusId === "s-done"
                return (
                  <li
                    className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm"
                    key={child.id}
                  >
                    <Glyph
                      className={cn(
                        "size-4",
                        finished
                          ? "text-[var(--proto-ok)]"
                          : "text-muted-foreground"
                      )}
                      name="check"
                    />
                    <KeyTag issue={child} />
                    <span
                      className={cn(
                        "truncate",
                        finished && "text-muted-foreground line-through"
                      )}
                    >
                      {child.title}
                    </span>
                    <span className="ml-auto shrink-0">
                      <StatusPill status={issueStatus(child)} />
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </div>
      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-auto border-l px-4 py-5">
        <SectionTitle>Activity</SectionTitle>
        <ol className="flex flex-col gap-3">
          {feed.map((entry) => {
            const person = personOf(entry.actorId)
            return (
              <li className="flex gap-2 text-xs" key={entry.id}>
                <Avatar person={person} size={20} />
                <div className="min-w-0">
                  <p className="leading-snug">
                    <span className="font-medium">
                      {person?.name ?? "Someone"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {entry.summary}
                    </span>
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {relativeTime(entry.at)}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <CommentBox />
        <BackLink label="Back to issues" />
      </aside>
    </div>
  )
}

export const DETAILS: Record<string, () => React.ReactNode> = {
  "1": Detail1SidePane,
  "2": Detail2FullPage,
  "3": Detail3Hero,
  "4": Detail4TwoColumn,
  "5": Detail5Timeline,
  "6": Detail6PropsRail,
  "7": Detail7Minimal,
  "8": Detail8Checklist,
}
