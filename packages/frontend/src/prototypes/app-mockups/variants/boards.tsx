/**
 * PROTOTYPE (throwaway) — board variants Board1–Board8.
 * Self-contained kanban boards over `stub-data`. No nav.
 */
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
  StatusPill,
} from "../atoms"
import type { CardKey } from "../prototype-config"
import {
  countsByStatus,
  issuesInStatus,
  labelsOf,
  personOf,
  statuses,
  topLevelIssues,
} from "../stub-data"
import { CardDensityBoard } from "./card-densities"

function Board1Compact() {
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-2 overflow-auto p-3">
      {statuses.map((status) => {
        const group = issuesInStatus(status.id)
        return (
          <section
            className="flex max-h-full w-60 shrink-0 flex-col rounded-lg border bg-[var(--proto-surface)]"
            key={status.id}
          >
            <header className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5 font-medium text-xs">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: categoryTone(status) }}
              />
              {status.name}
              <span className="text-muted-foreground">{group.length}</span>
              <Glyph
                className="ml-auto size-3.5 text-muted-foreground"
                name="plus"
              />
            </header>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
              {group.map((issue) => (
                <div className="px-2 py-1.5" key={issue.id}>
                  <span className="flex items-center gap-1.5">
                    <KeyTag issue={issue} />
                    <PriorityMark
                      className="ml-auto"
                      priority={issue.priority}
                    />
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-xs">{issue.title}</p>
                  <span className="mt-1 flex items-center gap-1.5">
                    <IssueAssignee issue={issue} />
                    <span className="ml-auto">
                      <DueChip dueDate={issue.dueDate} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Board2Roomy() {
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-4 overflow-auto p-5">
      {statuses.map((status) => {
        const group = issuesInStatus(status.id)
        return (
          <section
            className="flex max-h-full w-80 shrink-0 flex-col rounded-xl border bg-card"
            key={status.id}
          >
            <span
              className="h-1 w-full shrink-0 rounded-t-xl"
              style={{ backgroundColor: categoryTone(status) }}
            />
            <header className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2 font-semibold text-sm">
              {status.name}
              <span className="rounded-full bg-accent px-1.5 text-[11px]">
                {group.length}
              </span>
              <Glyph className="ml-auto text-muted-foreground" name="more" />
            </header>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
              {group.map((issue) => (
                <article
                  className="rounded-lg border bg-background p-3.5 shadow-sm"
                  key={issue.id}
                >
                  <KeyTag issue={issue} />
                  <p className="mt-1 font-medium text-sm">{issue.title}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {issue.description ?? "No description yet."}
                  </p>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {labelsOf(issue).map((label) => (
                      <LabelChip key={label.id} label={label} />
                    ))}
                  </span>
                  <span className="mt-2.5 flex items-center gap-2 border-t pt-2.5">
                    <IssueAssignee issue={issue} />
                    <span className="ml-auto">
                      <DueChip dueDate={issue.dueDate} />
                    </span>
                  </span>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const PRIORITY_LANES: { name: string; priorities: string[] }[] = [
  { name: "Urgent", priorities: ["Urgent"] },
  { name: "High", priorities: ["High"] },
  { name: "Everything else", priorities: ["Medium", "Low", "None"] },
]

function Board3Swimlanes() {
  return (
    <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      {PRIORITY_LANES.map((lane) => {
        const laneIssues = topLevelIssues.filter((issue) =>
          lane.priorities.includes(issue.priority)
        )
        return (
          <section
            className="shrink-0 rounded-xl border bg-[var(--proto-surface)] p-3"
            key={lane.name}
          >
            <header className="flex items-center gap-2 px-1 pb-2">
              <h2 className="font-semibold text-xs">{lane.name}</h2>
              <span className="text-[11px] text-muted-foreground">
                {laneIssues.length} issues
              </span>
            </header>
            <div className="proto-scroll flex gap-2 overflow-x-auto pb-1">
              {statuses.map((status) => {
                const group = issuesInStatus(status.id).filter((issue) =>
                  lane.priorities.includes(issue.priority)
                )
                return (
                  <div
                    className="w-52 shrink-0 rounded-lg border bg-card p-2"
                    key={status.id}
                  >
                    <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] text-muted-foreground">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: categoryTone(status) }}
                      />
                      {status.name}
                      <span className="ml-auto">{group.length}</span>
                    </p>
                    {group.length === 0 ? (
                      <p className="rounded border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
                        No issues
                      </p>
                    ) : (
                      group.map((issue) => (
                        <div
                          className="mb-1.5 rounded-md border bg-background p-2 last:mb-0"
                          key={issue.id}
                        >
                          <span className="flex items-center gap-1.5">
                            <KeyTag issue={issue} />
                            <PriorityMark
                              className="ml-auto"
                              priority={issue.priority}
                            />
                          </span>
                          <p className="mt-0.5 line-clamp-2 text-xs">
                            {issue.title}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Board4WipHeader() {
  const counts = countsByStatus()
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-4 overflow-auto p-5">
      {statuses.map((status) => {
        const group = issuesInStatus(status.id)
        return (
          <section
            className="flex max-h-full w-72 shrink-0 flex-col rounded-xl border bg-card"
            key={status.id}
          >
            <header className="flex shrink-0 flex-col gap-1.5 px-4 pt-3 pb-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-semibold text-sm">{status.name}</h2>
                <span className="text-muted-foreground text-xs">
                  {counts[status.id] ?? 0}/{topLevelIssues.length}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground uppercase">
                  {status.category}
                </span>
              </div>
              <Meter
                max={topLevelIssues.length}
                tone={categoryTone(status)}
                value={group.length}
              />
              <p className="text-[11px] text-muted-foreground">
                WIP {group.length} of {topLevelIssues.length}
              </p>
            </header>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-t bg-[var(--proto-surface)] px-3 py-3">
              {group.map((issue) => (
                <article
                  className="rounded-lg border bg-card p-2.5"
                  key={issue.id}
                >
                  <span className="flex items-center gap-1.5">
                    <KeyTag issue={issue} />
                    <PriorityMark
                      className="ml-auto"
                      priority={issue.priority}
                    />
                  </span>
                  <p className="mt-1 text-sm leading-snug">{issue.title}</p>
                  <span className="mt-2 flex items-center gap-1.5">
                    <IssueAssignee issue={issue} />
                    <span className="ml-auto">
                      <DueChip dueDate={issue.dueDate} />
                    </span>
                  </span>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Board5Minimal() {
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-8 overflow-auto p-6">
      {statuses.map((status) => {
        const group = issuesInStatus(status.id)
        return (
          <section
            className="flex max-h-full w-64 shrink-0 flex-col"
            key={status.id}
          >
            <h2 className="flex shrink-0 items-baseline gap-2 border-b pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
              {status.name}
              <span>{group.length}</span>
            </h2>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {group.map((issue) => (
                <div className="border-b py-2.5" key={issue.id}>
                  <p className="text-sm leading-snug">{issue.title}</p>
                  <KeyTag className="mt-0.5" issue={issue} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Board6Rich() {
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-4 overflow-auto p-5">
      {statuses.map((status) => {
        const group = issuesInStatus(status.id)
        return (
          <section
            className="flex max-h-full w-80 shrink-0 flex-col"
            key={status.id}
          >
            <header className="flex shrink-0 items-center gap-2 pb-2">
              <StatusPill status={status} />
              <span className="text-muted-foreground text-xs">
                {group.length}
              </span>
              <Glyph className="ml-auto text-muted-foreground" name="plus" />
            </header>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
              {group.map((issue) => {
                const issueLabels = labelsOf(issue)
                const first = issueLabels[0]
                const person = personOf(issue.assigneeId)
                return (
                  <article
                    className="flex shrink-0 flex-col gap-1.5 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-ring"
                    key={issue.id}
                  >
                    <span className="flex items-center gap-2">
                      <KeyTag issue={issue} />
                      <PriorityMark
                        className="ml-auto"
                        priority={issue.priority}
                        withLabel
                      />
                    </span>
                    <p className="font-medium text-sm leading-snug">
                      {issue.title}
                    </p>
                    <span className="flex flex-wrap items-center gap-1">
                      {first ? (
                        <LabelChip label={first} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          No labels
                        </span>
                      )}
                      {issueLabels.length > 1 ? (
                        <span className="text-[11px] text-muted-foreground">
                          +{issueLabels.length - 1}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 border-t pt-2">
                      <IssueAssignee issue={issue} />
                      <span className="truncate text-xs">
                        {person?.name ?? "Unassigned"}
                      </span>
                      <span className="ml-auto">
                        <DueChip dueDate={issue.dueDate} />
                      </span>
                    </span>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Board7Horizontal() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-4">
      <div className="flex min-w-max flex-col gap-3">
        {statuses.map((status) => {
          const group = issuesInStatus(status.id)
          return (
            <section
              className="flex items-stretch gap-3 rounded-xl border bg-[var(--proto-surface)] p-3"
              key={status.id}
            >
              <div className="sticky left-0 flex w-28 shrink-0 flex-col justify-center gap-1.5">
                <StatusPill status={status} />
                <span className="px-1 text-[11px] text-muted-foreground">
                  {group.length} issues
                </span>
              </div>
              {group.map((issue) => (
                <article
                  className="w-64 shrink-0 rounded-lg border bg-card p-2.5"
                  key={issue.id}
                >
                  <span className="flex items-center gap-1.5">
                    <KeyTag issue={issue} />
                    <PriorityMark
                      className="ml-auto"
                      priority={issue.priority}
                    />
                  </span>
                  <p className="mt-1 line-clamp-2 font-medium text-xs">
                    {issue.title}
                  </p>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <IssueAssignee issue={issue} />
                    <span className="ml-auto">
                      <DueChip dueDate={issue.dueDate} />
                    </span>
                  </span>
                </article>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function rankAssignee(id: string | null): number {
  if (id === "u-6") return 0
  if (id === "u-3") return 1
  if (id === null) return 99
  return 2
}

function Board8ByAssignee() {
  const ids = Array.from(
    new Set(topLevelIssues.map((issue) => issue.assigneeId))
  ).sort((a, b) => rankAssignee(a) - rankAssignee(b))
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-4">
      <div className="flex flex-col gap-5">
        {ids.map((id) => {
          const person = personOf(id)
          const group = topLevelIssues.filter(
            (issue) => issue.assigneeId === id
          )
          return (
            <section key={id ?? "unassigned"}>
              <header className="mb-2 flex items-center gap-2">
                <Avatar person={person} size={22} />
                <h2 className="font-semibold text-xs">
                  {person?.name ?? "Unassigned"}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {group.length} assigned
                </span>
              </header>
              <div className="proto-scroll flex gap-2 overflow-x-auto pb-1">
                {group.map((issue) => (
                  <article
                    className="w-60 shrink-0 rounded-lg border bg-card p-3"
                    key={issue.id}
                  >
                    <span className="flex items-center gap-1.5">
                      <KeyTag issue={issue} />
                      <PriorityMark
                        className="ml-auto"
                        priority={issue.priority}
                      />
                    </span>
                    <p className="mt-1 line-clamp-2 text-sm">{issue.title}</p>
                    <span className="mt-2 flex items-center gap-1.5">
                      <StatusPill status={issueStatus(issue)} withDot={false} />
                      <span className="ml-auto">
                        <DueChip dueDate={issue.dueDate} />
                      </span>
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Board "9" is the only one that reads the card density; the rest ignore it. */
export interface BoardProps {
  cards: CardKey
}

export const BOARDS: Record<string, (props: BoardProps) => React.ReactNode> = {
  "1": Board1Compact,
  "2": Board2Roomy,
  "3": Board3Swimlanes,
  "4": Board4WipHeader,
  "5": Board5Minimal,
  "6": Board6Rich,
  "7": Board7Horizontal,
  "8": Board8ByAssignee,
  "9": ({ cards }) => <CardDensityBoard cards={cards} />,
}
