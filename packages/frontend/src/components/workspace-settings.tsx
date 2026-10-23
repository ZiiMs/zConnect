import { useEffect, useState } from "react"
import { ConnectionsSettings } from "@/components/connections-settings"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { InviteMemberForm } from "@/components/invite-member-form"
import { LabelsSettings } from "@/components/labels-settings"
import { NotificationSettings } from "@/components/notification-settings"
import { PendingInvites } from "@/components/pending-invites"
import { WorkflowSettings } from "@/components/workflow-settings"
import { WorkspaceMembers } from "@/components/workspace-members"
import type { Project, Workspace } from "@/lib/api"
import { ProjectIcon } from "@/lib/project-icons"
import type { SettingsTab } from "@/lib/routes"

export interface SettingsNavItem {
  id: SettingsTab
  label: string
  description: string
}

export interface SettingsCategory {
  label: string
  items: SettingsNavItem[]
}

/**
 * Single source of truth for settings navigation: both the sidebar and
 * the settings index homepage render these categories.
 */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    label: "Workspace",
    items: [
      {
        id: "general",
        label: "General",
        description: "Workspace name and new workspaces",
      },
      {
        id: "members",
        label: "Members",
        description: "Manage members and pending invites",
      },
    ],
  },
  {
    label: "Issues",
    items: [
      {
        id: "workflow",
        label: "Workflow",
        description: "Statuses for the selected project",
      },
      {
        id: "labels",
        label: "Labels",
        description: "Organize issues with labels",
      },
    ],
  },
  {
    label: "Connections",
    items: [
      {
        id: "connections",
        label: "GitHub",
        description: "Connect GitHub and choose repositories",
      },
    ],
  },
  {
    label: "Preferences",
    items: [
      {
        id: "notifications",
        label: "Notifications",
        description: "Email notification preferences",
      },
    ],
  },
]

/** Flat list of every settings page (derived from the categories). */
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] =
  SETTINGS_CATEGORIES.flatMap((category) => category.items)

/**
 * Project workflow header shell: project identity above the
 * category-grouped workflow list (the list itself lives in WorkflowSettings).
 */
function WorkflowSection({
  project,
  canManage,
}: {
  project: Project
  canManage: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <ProjectIcon icon={project.icon} color={project.color} size={14} />
        {project.name}{" "}
        <span className="text-muted-foreground">({project.key})</span>
      </h3>
      <WorkflowSettings project={project} canManage={canManage} />
    </div>
  )
}

/**
 * Settings index homepage (`/{ws}/settings`): a scrollable list of every
 * settings page, organized by the same categories as the sidebar.
 */
export function SettingsIndex({
  hasProject,
  onNavigate,
}: {
  hasProject: boolean
  onNavigate: (tab: SettingsTab) => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {SETTINGS_CATEGORIES.map((category) => (
        <section key={category.label} aria-label={category.label}>
          <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
            {category.label}
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {category.items.map((item) => {
              const disabled = item.id === "workflow" && !hasProject
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    title={
                      disabled
                        ? "Select a project to manage its workflow"
                        : undefined
                    }
                    onClick={() => onNavigate(item.id)}
                    className="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-accent disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">
                        {item.label}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {disabled
                          ? "Select a project to manage its workflow"
                          : item.description}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground"
                    >
                      →
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * One settings detail page: reuses the existing workspace/project
 * management components. Workflow needs a selected project; every
 * other tab is workspace-scoped. The tab is URL-controlled via
 * `activeTab` (back/forward drives it); otherwise the component owns
 * its tab state (legacy/tests). Navigation lives in the sidebar and on
 * the index homepage, so this renders a back link plus the active panel.
 */
export function WorkspaceSettings({
  workspace,
  project,
  canManage,
  onWorkspaceCreated,
  activeTab,
  onBackToIndex,
}: {
  workspace: Workspace
  project: Project | null
  canManage: boolean
  onWorkspaceCreated: (workspace: Workspace) => void
  activeTab?: SettingsTab
  onBackToIndex?: () => void
}) {
  const [internalTab, setInternalTab] = useState<SettingsTab>("general")
  const [invitesKey, setInvitesKey] = useState(0)
  const controlled = activeTab !== undefined
  const tab = controlled ? activeTab : internalTab

  useEffect(() => {
    if (!project && !controlled) setInternalTab("members")
  }, [project, controlled])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {onBackToIndex && (
        <div>
          <button
            type="button"
            onClick={onBackToIndex}
            className="rounded px-1 py-0.5 text-left text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground"
          >
            ← All settings
          </button>
        </div>
      )}
      <div>
        {tab === "general" && (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">General</h3>
            <p className="text-sm">
              {workspace.name}{" "}
              <span className="text-muted-foreground">({workspace.role})</span>
            </p>
            <CreateWorkspaceForm onCreated={onWorkspaceCreated} />
          </div>
        )}
        {tab === "members" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h3 className="font-medium text-sm">Members</h3>
              <WorkspaceMembers workspaceId={workspace.id} />
            </div>
            {canManage ? (
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Invite a member</h3>
                <InviteMemberForm
                  workspaceId={workspace.id}
                  onInvited={() => setInvitesKey((key) => key + 1)}
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Only Owners and Admins can invite members.
              </p>
            )}
            {canManage && (
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Pending invites</h3>
                <PendingInvites key={invitesKey} workspaceId={workspace.id} />
              </div>
            )}
          </div>
        )}
        {tab === "workflow" &&
          (project ? (
            <WorkflowSection project={project} canManage={canManage} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Select a project to manage its workflow.
            </p>
          ))}
        {tab === "labels" && (
          <LabelsSettings
            workspaceId={workspace.id}
            canEdit={workspace.role !== "Viewer"}
          />
        )}
        {tab === "notifications" && <NotificationSettings />}
        {tab === "connections" && (
          <ConnectionsSettings
            workspaceId={workspace.id}
            canManage={canManage}
          />
        )}
      </div>
    </div>
  )
}
