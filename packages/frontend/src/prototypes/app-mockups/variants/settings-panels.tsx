/**
 * PROTOTYPE (throwaway) — settings variants Settings1–Settings8.
 * Self-contained workspace/project settings. No nav.
 */

import { cn } from "cn"
import { type ReactNode, useState } from "react"
import {
  Avatar,
  categoryTone,
  Glyph,
  LabelChip,
  SectionTitle,
  StatusPill,
} from "../atoms"
import {
  activeProject,
  issuesInStatus,
  labels,
  members,
  pendingInvites,
  people,
  personOf,
  projects,
  statuses,
  topLevelIssues,
  workspace,
} from "../stub-data"
import { protoHref } from "../use-proto-params"

const TABS = ["general", "members", "statuses", "labels"] as const

type SettingsTab = (typeof TABS)[number]

const ROLES = ["Owner", "Admin", "Member"]

function assignedTo(personId: string) {
  return topLevelIssues.filter((issue) => issue.assigneeId === personId)
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-[11px]">
      {role}
    </span>
  )
}

function GeneralPanel() {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Workspace name</span>
        <input
          className="rounded-lg border bg-background px-2 py-1.5"
          defaultValue={workspace.name}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Default project key</span>
        <input
          className="proto-mono w-24 rounded-lg border bg-background px-2 py-1.5"
          defaultValue={activeProject.key}
        />
      </label>
      <div>
        <SectionTitle>Projects · {projects.length}</SectionTitle>
        <ul className="mt-2 overflow-hidden rounded-xl border">
          {projects.map((project) => (
            <li
              className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
              key={project.id}
            >
              <span className="font-medium">{project.name}</span>
              <span className="proto-mono ml-auto text-muted-foreground text-xs">
                {project.key}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function InvitesBlock() {
  return (
    <div className="mt-4">
      <SectionTitle>Pending invites · {pendingInvites.length}</SectionTitle>
      <ul className="mt-2 overflow-hidden rounded-xl border">
        {pendingInvites.map((invite) => (
          <li
            className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
            key={invite.email}
          >
            <Glyph className="text-muted-foreground" name="mail" />
            <span className="truncate">{invite.email}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <RoleBadge role={invite.role} />
              <button
                className="rounded-md border px-2 py-0.5 text-xs"
                type="button"
              >
                Revoke
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MembersPanel() {
  return (
    <div>
      <ul className="overflow-hidden rounded-xl border">
        {people.map((person) => (
          <li
            className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
            key={person.id}
          >
            <Avatar person={person} size={24} />
            <span className="font-medium">{person.name}</span>
            <span className="text-muted-foreground text-xs">
              {assignedTo(person.id).length} issues
            </span>
            <span className="ml-auto">
              <RoleBadge role={person.role} />
            </span>
          </li>
        ))}
      </ul>
      <InvitesBlock />
    </div>
  )
}

function StatusesPanel() {
  return (
    <ul className="overflow-hidden rounded-xl border">
      {statuses.map((status) => (
        <li
          className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
          key={status.id}
        >
          <StatusPill status={status} />
          <span className="text-xs" style={{ color: categoryTone(status) }}>
            {status.category} · {issuesInStatus(status.id).length} issues
          </span>
          <button
            aria-label={`Delete ${status.name}`}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent"
            type="button"
          >
            <Glyph name="trash" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function LabelsPanel() {
  return (
    <ul className="flex flex-col gap-2">
      {labels.map((label) => (
        <li
          className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          key={label.id}
        >
          <LabelChip label={label} />
          <span className="ml-auto text-muted-foreground text-xs">
            {
              topLevelIssues.filter((issue) => issue.labels.includes(label.id))
                .length
            }{" "}
            issues
          </span>
        </li>
      ))}
    </ul>
  )
}

function Settings1Tabbed() {
  const [tab, setTab] = useState<SettingsTab>("members")
  return (
    <div className="proto-scroll flex min-h-0 flex-1 gap-6 overflow-auto p-6">
      <nav className="flex w-44 shrink-0 flex-col gap-px">
        <p className="px-2 pb-2 text-muted-foreground text-xs">
          {workspace.name}
        </p>
        {TABS.map((item) => (
          <button
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm capitalize",
              tab === item ? "bg-accent font-medium" : "text-muted-foreground"
            )}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="max-w-2xl flex-1">
        <h1 className="proto-heading font-semibold text-lg capitalize">
          {tab}
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {members.length} members · {statuses.length} statuses
        </p>
        <div className="mt-4">
          {tab === "general" ? <GeneralPanel /> : null}
          {tab === "members" ? <MembersPanel /> : null}
          {tab === "statuses" ? <StatusesPanel /> : null}
          {tab === "labels" ? <LabelsPanel /> : null}
        </div>
      </div>
    </div>
  )
}

function Settings2TopTabs() {
  const [tab, setTab] = useState<SettingsTab>("general")
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="proto-heading font-semibold text-2xl">Settings</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {workspace.name} · {projects.length} projects
        </p>
        <div className="mt-4 flex gap-1 border-b">
          {TABS.map((item) => (
            <button
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm capitalize",
                tab === item
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground"
              )}
              key={item}
              onClick={() => setTab(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-6 max-w-2xl">
          {tab === "general" ? <GeneralPanel /> : null}
          {tab === "members" ? <MembersPanel /> : null}
          {tab === "statuses" ? <StatusesPanel /> : null}
          {tab === "labels" ? <LabelsPanel /> : null}
        </div>
      </div>
    </div>
  )
}

function Settings3MasterDetail() {
  const [memberId, setMemberId] = useState(people[0].id)
  const person = personOf(memberId) ?? people[0]
  const assigned = assignedTo(person.id)
  return (
    <div className="flex min-h-0 flex-1">
      <div className="proto-scroll w-1/2 overflow-auto border-r p-2">
        <SectionTitle className="px-2">Members · {members.length}</SectionTitle>
        <ul className="mt-2 flex flex-col gap-px">
          {people.map((item) => (
            <li key={item.id}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm",
                  item.id === memberId ? "bg-accent font-medium" : ""
                )}
                onClick={() => setMemberId(item.id)}
                type="button"
              >
                <Avatar person={item} size={24} />
                <span className="truncate">{item.name}</span>
                <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                  {assignedTo(item.id).length}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 px-2">
          <SectionTitle>Pending invites</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {pendingInvites.map((invite) => (
              <li
                className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                key={invite.email}
              >
                <Glyph className="text-muted-foreground" name="mail" />
                <span className="truncate text-xs">{invite.email}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="proto-scroll w-1/2 overflow-auto p-4">
        <div className="flex items-center gap-3">
          <Avatar person={person} size={44} />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{person.name}</p>
            <p className="text-muted-foreground text-xs">@{person.handle}</p>
          </div>
        </div>
        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="font-medium">Role</span>
          <select
            className="rounded-lg border bg-background px-2 py-1.5"
            defaultValue={person.role}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-6">
          <SectionTitle>Assigned · {assigned.length}</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1">
            {assigned.map((issue) => (
              <li key={issue.id}>
                <a
                  className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm hover:bg-accent"
                  href={protoHref({ screen: "issue" })}
                >
                  <span className="proto-mono text-muted-foreground text-xs">
                    {issue.identifier}
                  </span>
                  <span className="truncate">{issue.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6">
          <SectionTitle>Workflow</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1.5">
            {statuses.map((status) => (
              <li className="flex items-center gap-2 text-sm" key={status.id}>
                <StatusPill status={status} />
                <span className="ml-auto text-muted-foreground text-xs">
                  {issuesInStatus(status.id).length}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6">
          <SectionTitle>Labels</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <LabelChip key={label.id} label={label} variant="outline" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingRow({
  children,
  hint,
  label,
}: {
  children: ReactNode
  hint: string
  label: string
}) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{label}</p>
        <p className="truncate text-muted-foreground text-xs">{hint}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function Settings4Rows() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div>
          <h1 className="proto-heading font-semibold text-xl">Settings</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {workspace.name} · {members.length} members
          </p>
        </div>
        <section className="rounded-xl border bg-card">
          <SettingRow hint="Shown across the workspace" label="Workspace name">
            <input
              className="w-48 rounded-lg border bg-background px-2 py-1.5 text-sm"
              defaultValue={workspace.name}
            />
          </SettingRow>
          <SettingRow
            hint="Prefix for new issue identifiers"
            label="Project key"
          >
            <input
              className="proto-mono w-24 rounded-lg border bg-background px-2 py-1.5 text-sm"
              defaultValue={activeProject.key}
            />
          </SettingRow>
          <SettingRow
            hint={`${projects.length} projects in this workspace`}
            label="Default project"
          >
            <select
              className="rounded-lg border bg-background px-2 py-1.5 text-sm"
              defaultValue={activeProject.id}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </SettingRow>
        </section>
        <section className="rounded-xl border bg-card">
          <header className="border-b px-4 py-2">
            <SectionTitle>Members · {members.length}</SectionTitle>
          </header>
          {people.map((person) => (
            <SettingRow
              hint={`@${person.handle} · ${assignedTo(person.id).length} issues`}
              key={person.id}
              label={person.name}
            >
              <Avatar person={person} size={22} />
              <select
                className="rounded-lg border bg-background px-2 py-1.5 text-sm"
                defaultValue={person.role}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </SettingRow>
          ))}
          {pendingInvites.map((invite) => (
            <SettingRow
              hint="Invite sent · waiting to join"
              key={invite.email}
              label={invite.email}
            >
              <RoleBadge role={invite.role} />
              <button
                className="rounded-lg border px-2 py-1.5 text-sm"
                type="button"
              >
                Revoke
              </button>
            </SettingRow>
          ))}
        </section>
        <section className="rounded-xl border bg-card">
          <SettingRow
            hint={`${labels.length} labels · ${statuses.length} statuses`}
            label="Workflow & labels"
          >
            <span className="flex max-w-56 flex-wrap justify-end gap-1.5">
              {labels.slice(0, 4).map((label) => (
                <LabelChip key={label.id} label={label} variant="outline" />
              ))}
            </span>
          </SettingRow>
        </section>
        <section className="rounded-xl border border-destructive">
          <header className="border-b px-4 py-2 font-semibold text-destructive text-sm">
            Danger zone
          </header>
          <SettingRow
            hint="Archives every project in the workspace"
            label="Archive workspace"
          >
            <button
              className="rounded-lg border px-2 py-1.5 text-sm"
              type="button"
            >
              Archive
            </button>
          </SettingRow>
          <SettingRow hint="Cannot be undone" label="Delete workspace">
            <button
              className="rounded-lg bg-destructive px-2 py-1.5 text-destructive-foreground text-sm"
              type="button"
            >
              Delete
            </button>
          </SettingRow>
        </section>
      </div>
    </div>
  )
}

function Settings5Cards() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4">
        <div className="col-span-2">
          <h1 className="proto-heading font-semibold text-xl">Settings</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {workspace.name} · {members.length} members
          </p>
        </div>
        {people.map((person) => {
          const assigned = assignedTo(person.id)
          return (
            <article className="rounded-xl border bg-card p-4" key={person.id}>
              <div className="flex items-center gap-3">
                <Avatar person={person} size={36} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{person.name}</p>
                  <p className="text-muted-foreground text-xs">
                    @{person.handle}
                  </p>
                </div>
                <span className="ml-auto shrink-0">
                  <RoleBadge role={person.role} />
                </span>
              </div>
              <p className="mt-3 text-muted-foreground text-xs">
                {assigned.length} assigned issues
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {assigned.slice(0, 3).map((issue) => (
                  <a
                    className="proto-mono rounded border px-1.5 py-0.5 text-[11px]"
                    href={protoHref({ screen: "issue" })}
                    key={issue.id}
                  >
                    {issue.identifier}
                  </a>
                ))}
              </div>
            </article>
          )
        })}
        <article className="col-span-2 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <SectionTitle>
              Pending invites · {pendingInvites.length}
            </SectionTitle>
            <button
              className="ml-auto flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
              type="button"
            >
              <Glyph className="size-3" name="plus" />
              Invite
            </button>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {pendingInvites.map((invite) => (
              <li
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                key={invite.email}
              >
                <Glyph className="text-muted-foreground" name="mail" />
                <span className="truncate">{invite.email}</span>
                <button
                  className="ml-auto shrink-0 rounded-md border px-2 py-0.5 text-xs"
                  type="button"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-xl border bg-card p-4">
          <SectionTitle>Workflow · {statuses.length}</SectionTitle>
          <ul className="mt-3 flex flex-col gap-1.5">
            {statuses.map((status) => (
              <li className="flex items-center gap-2 text-sm" key={status.id}>
                <StatusPill status={status} />
                <span className="ml-auto text-muted-foreground text-xs">
                  {issuesInStatus(status.id).length}
                </span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-xl border bg-card p-4">
          <SectionTitle>Labels · {labels.length}</SectionTitle>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

function Settings6Sections() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div>
          <h1 className="proto-heading font-semibold text-xl">Settings</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {workspace.name} · {activeProject.name}
          </p>
        </div>
        <section>
          <SectionTitle>General</SectionTitle>
          <div className="mt-3">
            <GeneralPanel />
          </div>
        </section>
        <section>
          <SectionTitle>Members · {members.length}</SectionTitle>
          <div className="mt-3">
            <MembersPanel />
          </div>
        </section>
        <section>
          <SectionTitle>Workflow · {statuses.length}</SectionTitle>
          <div className="mt-3">
            <StatusesPanel />
          </div>
        </section>
        <section>
          <SectionTitle>Labels · {labels.length}</SectionTitle>
          <div className="mt-3">
            <LabelsPanel />
          </div>
        </section>
      </div>
    </div>
  )
}

function Settings7DenseTable() {
  return (
    <div className="proto-scroll min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="proto-heading font-semibold text-xl">Settings</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {workspace.name} · {members.length} members
          </p>
        </div>
        <section>
          <SectionTitle>Members · {members.length}</SectionTitle>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase">
                <th className="border-b px-2 py-1.5 font-medium">Member</th>
                <th className="w-28 border-b px-2 py-1.5 font-medium">Role</th>
                <th className="w-20 border-b px-2 py-1.5 text-right font-medium">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr className="border-b last:border-b-0" key={person.id}>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <Avatar person={person} size={20} />
                      {person.name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs">{person.role}</td>
                  <td className="px-2 py-1.5 text-right text-xs">
                    {assignedTo(person.id).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <SectionTitle>Pending invites · {pendingInvites.length}</SectionTitle>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {pendingInvites.map((invite) => (
                <tr className="border-b last:border-b-0" key={invite.email}>
                  <td className="px-2 py-1.5">{invite.email}</td>
                  <td className="w-28 px-2 py-1.5 text-xs">{invite.role}</td>
                  <td className="w-20 px-2 py-1.5 text-right">
                    <button
                      className="rounded-md border px-2 py-0.5 text-xs"
                      type="button"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <SectionTitle>Workflow · {statuses.length}</SectionTitle>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase">
                <th className="border-b px-2 py-1.5 font-medium">Status</th>
                <th className="w-32 border-b px-2 py-1.5 font-medium">
                  Category
                </th>
                <th className="w-20 border-b px-2 py-1.5 text-right font-medium">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((status) => (
                <tr className="border-b last:border-b-0" key={status.id}>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: categoryTone(status) }}
                      />
                      {status.name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs">{status.category}</td>
                  <td className="px-2 py-1.5 text-right text-xs">
                    {issuesInStatus(status.id).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <SectionTitle>Labels · {labels.length}</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <LabelChip key={label.id} label={label} variant="outline" />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Settings8Wizard() {
  const [step, setStep] = useState(0)
  const steps = ["Workspace", "Members", "Workflow"]
  const current = steps[step] ?? "Workspace"
  const last = step === steps.length - 1
  return (
    <div className="proto-scroll flex min-h-0 flex-1 items-start justify-center overflow-auto p-10">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6">
        <h1 className="proto-heading font-semibold text-lg">
          Set up {workspace.name}
        </h1>
        <ol className="mt-3 flex gap-1.5">
          {steps.map((item, index) => (
            <li
              className={cn(
                "flex-1 rounded-full py-1 text-center text-[11px]",
                index === step
                  ? "bg-primary font-medium text-primary-foreground"
                  : index < step
                    ? "bg-accent font-medium"
                    : "bg-accent text-muted-foreground"
              )}
              key={item}
            >
              {item}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-muted-foreground text-sm">
          Step {step + 1} of {steps.length} · {current}
        </p>
        <div className="mt-4">
          {step === 0 ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Workspace name</span>
                <input
                  className="rounded-lg border bg-background px-2 py-1.5"
                  defaultValue={workspace.name}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Default project</span>
                <select
                  className="rounded-lg border bg-background px-2 py-1.5"
                  defaultValue={activeProject.id}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.key})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {step === 1 ? (
            <div>
              <ul className="overflow-hidden rounded-xl border">
                {people.map((person) => (
                  <li
                    className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                    key={person.id}
                  >
                    <Avatar person={person} size={24} />
                    <span className="font-medium">{person.name}</span>
                    <select
                      className="ml-auto rounded-lg border bg-background px-2 py-1 text-xs"
                      defaultValue={person.role}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {pendingInvites.map((invite) => (
                  <li
                    className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs"
                    key={invite.email}
                  >
                    <Glyph className="text-muted-foreground" name="mail" />
                    <span className="truncate">{invite.email}</span>
                    <span className="ml-auto shrink-0">
                      <RoleBadge role={invite.role} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {step === 2 ? (
            <div>
              <ul className="flex flex-col gap-1.5">
                {statuses.map((status) => (
                  <li
                    className="flex items-center gap-2 text-sm"
                    key={status.id}
                  >
                    <StatusPill status={status} />
                    <span className="ml-auto text-muted-foreground text-xs">
                      {issuesInStatus(status.id).length} issues
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <LabelChip key={label.id} label={label} variant="outline" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex justify-between">
          <button
            className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            type="button"
          >
            Back
          </button>
          {last ? (
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground text-xs"
              type="button"
            >
              Finish
            </button>
          ) : (
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground text-xs"
              onClick={() =>
                setStep((value) => Math.min(steps.length - 1, value + 1))
              }
              type="button"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export const SETTINGS_PANELS: Record<string, () => React.ReactNode> = {
  "1": Settings1Tabbed,
  "2": Settings2TopTabs,
  "3": Settings3MasterDetail,
  "4": Settings4Rows,
  "5": Settings5Cards,
  "6": Settings6Sections,
  "7": Settings7DenseTable,
  "8": Settings8Wizard,
}
