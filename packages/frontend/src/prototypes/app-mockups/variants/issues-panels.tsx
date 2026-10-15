/**
 * PROTOTYPE (throwaway) — issues panel variants Issues1–Issues8.
 * Self-contained: no nav, fills the content column. Internal state only.
 */

import { cn } from "cn"
import { useState } from "react"
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
import {
  activeProject,
  countsByStatus,
  focusIssue,
  issuesInStatus,
  labelsOf,
  personOf,
  projectProgress,
  statuses,
  subtasksOf,
  topLevelIssues,
} from "../stub-data"
import { protoHref } from "../use-proto-params"

function Issues1DenseGrouped() {
  const counts = countsByStatus()
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto pb-6">
      {statuses.map((status) => (
        <section key={status.id}>
          <header className="sticky top-0 z-10 flex h-8 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: categoryTone(status) }}
            />
            <h2 className="proto-heading font-medium text-xs">{status.name}</h2>
            <span className="text-[11px] text-muted-foreground">
              {counts[status.id] ?? 0}
            </span>
          </header>
          {issuesInStatus(status.id).map((issue) => (
            <a
              className="grid h-7 grid-cols-[1rem_3.5rem_minmax(0,1fr)_auto_auto_1.25rem] items-center gap-2 border-transparent border-l-2 px-3 hover:border-ring hover:bg-accent/60"
              href={protoHref({ screen: "issue" })}
              key={issue.id}
            >
              <PriorityMark priority={issue.priority} />
              <KeyTag issue={issue} />
              <span className="truncate text-[13px]">{issue.title}</span>
              <span className="hidden gap-1 xl:flex">
                {labelsOf(issue)
                  .slice(0, 2)
                  .map((label) => (
                    <LabelChip key={label.id} label={label} />
                  ))}
              </span>
              <DueChip dueDate={issue.dueDate} />
              <IssueAssignee issue={issue} />
            </a>
          ))}
        </section>
      ))}
    </div>
  )
}

function Issues2RoomyCards() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto px-5 py-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        <div className="flex items-end justify-between gap-4 pb-1">
          <div>
            <h1 className="proto-heading font-semibold text-lg">
              {activeProject.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {projectProgress.done} of {projectProgress.total} done ·{" "}
              {projectProgress.urgent} urgent · {projectProgress.unassigned}{" "}
              unassigned
            </p>
          </div>
          <div className="w-40 shrink-0">
            <Meter max={projectProgress.total} value={projectProgress.done} />
          </div>
        </div>
        {topLevelIssues.map((issue) => (
          <a
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 hover:border-ring"
            href={protoHref({ screen: "issue" })}
            key={issue.id}
          >
            <span className="flex items-center gap-2">
              <KeyTag issue={issue} />
              <StatusPill status={issueStatus(issue)} />
              <span className="ml-auto flex items-center gap-2">
                <PriorityMark priority={issue.priority} withLabel />
                <DueChip dueDate={issue.dueDate} />
              </span>
            </span>
            <span className="font-medium text-[15px]">{issue.title}</span>
            <span className="line-clamp-2 text-muted-foreground text-sm">
              {issue.description ?? "No description yet."}
            </span>
            <span className="flex items-center gap-2 pt-1">
              {labelsOf(issue).map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
              <span className="text-muted-foreground text-xs">
                {subtasksOf(issue).length} subtasks
              </span>
              <span className="ml-auto">
                <IssueAssignee issue={issue} />
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function Issues3Table() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] text-muted-foreground uppercase">
          <tr>
            <th className="border-b px-3 py-2 font-medium">Key</th>
            <th className="border-b px-2 py-2 font-medium">Issue</th>
            <th className="border-b px-2 py-2 font-medium">Status</th>
            <th className="border-b px-2 py-2 font-medium">Priority</th>
            <th className="border-b px-2 py-2 font-medium">Assignee</th>
            <th className="border-b px-2 py-2 font-medium">Due</th>
            <th className="border-b px-2 py-2 font-medium">Labels</th>
          </tr>
        </thead>
        <tbody>
          {topLevelIssues.map((issue) => {
            const seen = labelsOf(issue)
            const assignee = personOf(issue.assigneeId)
            return (
              <tr className="border-b hover:bg-accent/40" key={issue.id}>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <KeyTag issue={issue} />
                </td>
                <td className="max-w-64 truncate px-2 py-1.5">
                  <a
                    className="hover:underline"
                    href={protoHref({ screen: "issue" })}
                  >
                    {issue.title}
                  </a>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <StatusPill status={issueStatus(issue)} withDot={false} />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <PriorityMark priority={issue.priority} withLabel />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <IssueAssignee issue={issue} />
                    <span className="text-muted-foreground text-xs">
                      {assignee === null
                        ? "Unassigned"
                        : (assignee.name.split(" ")[0] ?? assignee.name)}
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <DueChip dueDate={issue.dueDate} />
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1">
                    {seen.slice(0, 2).map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                    {seen.length > 2 ? (
                      <span className="text-[11px] text-muted-foreground">
                        +{seen.length - 2}
                      </span>
                    ) : null}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Issues4CompactRows() {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const rows = topLevelIssues.filter(
    (issue) =>
      issue.title.toLowerCase().includes(needle) ||
      issue.identifier.toLowerCase().includes(needle)
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Glyph className="size-3.5 text-muted-foreground" name="search" />
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by title or key…"
          value={query}
        />
        <span className="text-muted-foreground text-xs">
          {rows.length} of {topLevelIssues.length}
        </span>
      </div>
      <div className="proto-scroll min-h-0 flex-1 overflow-auto">
        {rows.map((issue) => (
          <a
            className="flex h-6 items-center gap-2 border-b px-3 text-xs hover:bg-accent/60"
            href={protoHref({ screen: "issue" })}
            key={issue.id}
          >
            <KeyTag issue={issue} />
            <span className="min-w-0 flex-1 truncate">{issue.title}</span>
            <Avatar person={personOf(issue.assigneeId)} size={16} />
          </a>
        ))}
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-muted-foreground text-xs">
            No issues match “{query}”.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Issues5Swimlanes() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-4">
      <div className="flex flex-col gap-4">
        {statuses.map((status) => (
          <section className="rounded-xl border" key={status.id}>
            <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: categoryTone(status) }}
              />
              <SectionTitle>{status.name}</SectionTitle>
              <span className="text-[11px] text-muted-foreground">
                {issuesInStatus(status.id).length}
              </span>
            </header>
            <div className="flex gap-2 overflow-x-auto p-3">
              {issuesInStatus(status.id).map((issue) => (
                <a
                  className="flex w-64 shrink-0 flex-col rounded-lg border bg-card p-3 hover:border-ring"
                  href={protoHref({ screen: "issue" })}
                  key={issue.id}
                >
                  <span className="flex items-center justify-between gap-2">
                    <KeyTag issue={issue} />
                    <PriorityMark priority={issue.priority} />
                  </span>
                  <span className="mt-1 line-clamp-2 min-h-10 text-sm">
                    {issue.title}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {labelsOf(issue).map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                  </span>
                  <span className="mt-2 flex items-center justify-between">
                    <DueChip dueDate={issue.dueDate} />
                    <IssueAssignee issue={issue} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Issues6PriorityStacks() {
  const stacks = ["Urgent", "High", "Medium"] as const
  const shelf = topLevelIssues.filter(
    (issue) => issue.priority === "Low" || issue.priority === "None"
  )
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-4">
      <div className="grid grid-cols-3 items-start gap-3">
        {stacks.map((priority) => (
          <section
            className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-2"
            key={priority}
          >
            <header className="flex items-center justify-between px-1 pt-1">
              <PriorityMark priority={priority} withLabel />
              <span className="text-[11px] text-muted-foreground">
                {
                  topLevelIssues.filter((issue) => issue.priority === priority)
                    .length
                }
              </span>
            </header>
            {topLevelIssues
              .filter((issue) => issue.priority === priority)
              .map((issue) => (
                <a
                  className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 hover:border-ring"
                  href={protoHref({ screen: "issue" })}
                  key={issue.id}
                >
                  <KeyTag issue={issue} />
                  <span className="text-sm leading-snug">{issue.title}</span>
                  <span className="flex items-center justify-between pt-1">
                    <StatusPill status={issueStatus(issue)} withDot={false} />
                    <IssueAssignee issue={issue} />
                  </span>
                  <DueChip dueDate={issue.dueDate} />
                </a>
              ))}
          </section>
        ))}
      </div>
      <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span>Lower priority · {shelf.length}</span>
        {shelf.map((issue) => (
          <a
            className="flex items-center gap-1.5 hover:underline"
            href={protoHref({ screen: "issue" })}
            key={issue.id}
          >
            <KeyTag issue={issue} />
            <span className="max-w-40 truncate">{issue.title}</span>
          </a>
        ))}
      </footer>
    </div>
  )
}

function Issues7Timeline() {
  const dated = topLevelIssues
    .filter((issue) => issue.dueDate !== null)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
  const undated = topLevelIssues.filter((issue) => issue.dueDate === null)
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto px-5 py-6">
      <ol className="relative mx-auto flex max-w-2xl flex-col">
        <SectionTitle className="mb-3">By due date</SectionTitle>
        {dated.map((issue) => (
          <li className="relative flex gap-3 border-l pb-4 pl-5" key={issue.id}>
            <span
              className="absolute top-4 -left-[5px] size-2 rounded-full"
              style={{
                backgroundColor: categoryTone(issueStatus(issue)),
              }}
            />
            <a
              className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border bg-card p-3 hover:border-ring"
              href={protoHref({ screen: "issue" })}
              key={issue.id}
            >
              <span className="flex items-center gap-2">
                <DueChip dueDate={issue.dueDate} />
                <span className="ml-auto flex items-center gap-2">
                  <KeyTag issue={issue} />
                  <PriorityMark priority={issue.priority} />
                </span>
              </span>
              <span className="font-medium text-sm">{issue.title}</span>
              <span className="flex items-center gap-2">
                <StatusPill status={issueStatus(issue)} withDot={false} />
                <span className="ml-auto">
                  <IssueAssignee issue={issue} />
                </span>
              </span>
            </a>
          </li>
        ))}
        <li className="relative flex gap-3 pl-5" key="undated">
          <span className="absolute top-4 -left-[5px] size-2 rounded-full border border-muted-foreground border-dashed" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-dashed p-3">
            <span className="text-muted-foreground text-xs">
              No due date · {undated.length}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {undated.map((issue) => (
                <a
                  className="flex items-center gap-1.5 text-xs hover:underline"
                  href={protoHref({ screen: "issue" })}
                  key={issue.id}
                >
                  <KeyTag issue={issue} />
                  <span className="max-w-48 truncate">{issue.title}</span>
                </a>
              ))}
            </span>
          </div>
        </li>
      </ol>
    </div>
  )
}

function Issues8MasterDetail() {
  const [selectedId, setSelectedId] = useState(focusIssue.id)
  const selected =
    topLevelIssues.find((item) => item.id === selectedId) ?? focusIssue
  const owner = personOf(selected.assigneeId)
  const subtasks = subtasksOf(selected)
  return (
    <div className="flex min-h-0 flex-1">
      <div className="proto-scroll min-h-0 w-1/2 overflow-auto border-r">
        <p className="sticky top-0 border-b bg-background/95 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
          {topLevelIssues.length} issues
        </p>
        {topLevelIssues.map((issue) => (
          <button
            className={cn(
              "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm",
              issue.id === selectedId ? "bg-accent" : "hover:bg-accent/40"
            )}
            key={issue.id}
            onClick={() => setSelectedId(issue.id)}
            type="button"
          >
            <PriorityMark priority={issue.priority} />
            <KeyTag issue={issue} />
            <span className="min-w-0 flex-1 truncate">{issue.title}</span>
          </button>
        ))}
      </div>
      <div className="proto-scroll min-h-0 w-1/2 overflow-auto p-5">
        <span className="flex items-center gap-2">
          <KeyTag issue={selected} />
          <StatusPill status={issueStatus(selected)} withDot={false} />
        </span>
        <h2 className="proto-heading mt-2 font-semibold text-base">
          {selected.title}
        </h2>
        <span className="mt-2 flex items-center gap-3">
          <PriorityMark priority={selected.priority} withLabel />
          <DueChip dueDate={selected.dueDate} />
        </span>
        <p className="mt-3 text-muted-foreground text-sm">
          {selected.description ?? "No description yet."}
        </p>
        <span className="mt-3 flex flex-wrap gap-1">
          {labelsOf(selected).map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </span>
        <span className="mt-4 flex items-center gap-2">
          <Avatar person={owner} size={24} />
          <span className="text-sm">{owner?.name ?? "Unassigned"}</span>
        </span>
        <h3 className="proto-heading mt-4 font-medium text-[11px] text-muted-foreground uppercase">
          Subtasks · {subtasks.length}
        </h3>
        {subtasks.length === 0 ? (
          <p className="mt-1 text-muted-foreground text-xs">No subtasks.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {subtasks.map((sub) => (
              <li
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                key={sub.id}
              >
                <Glyph className="size-3 text-muted-foreground" name="check" />
                <KeyTag issue={sub} />
                <span className="min-w-0 flex-1 truncate">{sub.title}</span>
              </li>
            ))}
          </ul>
        )}
        <a
          className="mt-4 inline-flex items-center gap-1 text-muted-foreground text-xs hover:underline"
          href={protoHref({ screen: "issue" })}
        >
          Open full detail
          <Glyph className="size-3" name="chevronRight" />
        </a>
      </div>
    </div>
  )
}

export const ISSUES_PANELS: Record<string, () => React.ReactNode> = {
  "1": Issues1DenseGrouped,
  "2": Issues2RoomyCards,
  "3": Issues3Table,
  "4": Issues4CompactRows,
  "5": Issues5Swimlanes,
  "6": Issues6PriorityStacks,
  "7": Issues7Timeline,
  "8": Issues8MasterDetail,
}
