import { useEffect, useState } from "react"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { InviteMemberForm } from "@/components/invite-member-form"
import { LabelsSettings } from "@/components/labels-settings"
import { NotificationSettings } from "@/components/notification-settings"
import { PendingInvites } from "@/components/pending-invites"
import { ProjectKeyForm } from "@/components/project-key-form"
import { WorkflowSettings } from "@/components/workflow-settings"
import { WorkspaceMembers } from "@/components/workspace-members"
import type { Project, Workspace } from "@/lib/api"
import { ProjectIcon } from "@/lib/project-icons"

type SettingsTab =
  | "general"
  | "members"
  | "workflow"
  | "labels"
  | "notifications"

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "workflow", label: "Workflow" },
  { id: "labels", label: "Labels" },
  { id: "notifications", label: "Notifications" },
]

/**
 * Project workflow editor shell: project identity and key form around the
 * category-grouped workflow list (the list itself lives in WorkflowSettings).
 */
function WorkflowSection({
  project,
  canManage,
  onProjectUpdated,
}: {
  project: Project
  canManage: boolean
  onProjectUpdated: (project: Project) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <ProjectIcon icon={project.icon} color={project.color} size={14} />
        {project.name}{" "}
        <span className="text-muted-foreground">({project.key})</span>
      </h3>
      {canManage && (
        <ProjectKeyForm project={project} onUpdated={onProjectUpdated} />
      )}
      <WorkflowSettings project={project} canManage={canManage} />
    </div>
  )
}

/**
 * Settings screen (top tabs): reuses the existing workspace/project
 * management components. Workflow needs a selected project; every
 * other tab is workspace-scoped.
 */
export function WorkspaceSettings({
  workspace,
  project,
  canManage,
  onProjectUpdated,
  onWorkspaceCreated,
}: {
  workspace: Workspace
  project: Project | null
  canManage: boolean
  onProjectUpdated: (project: Project) => void
  onWorkspaceCreated: (workspace: Workspace) => void
}) {
  const [tab, setTab] = useState<SettingsTab>("general")
  const [invitesKey, setInvitesKey] = useState(0)

  useEffect(() => {
    if (!project) setTab("members")
  }, [project])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Settings</h2>
        <p className="text-muted-foreground text-sm">
          {workspace.name}{" "}
          <span className="text-muted-foreground">({workspace.role})</span>
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Workspace settings"
        className="flex gap-2"
      >
        {TABS.map((option) => {
          const disabled = option.id === "workflow" && !project
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              disabled={disabled}
              title={
                disabled ? "Select a project to manage its workflow" : undefined
              }
              onClick={() => setTab(option.id)}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {!project && (
        <p className="text-muted-foreground text-sm">
          Select a project to manage its workflow.
        </p>
      )}
      <div role="tabpanel">
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
            <WorkflowSection
              project={project}
              canManage={canManage}
              onProjectUpdated={onProjectUpdated}
            />
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
      </div>
    </div>
  )
}
