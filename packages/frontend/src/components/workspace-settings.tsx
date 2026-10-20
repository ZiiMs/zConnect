import { useCallback, useEffect, useState } from "react"
import { CreateStatusForm } from "@/components/create-status-form"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { InviteMemberForm } from "@/components/invite-member-form"
import { NotificationSettings } from "@/components/notification-settings"
import { PendingInvites } from "@/components/pending-invites"
import { ProjectKeyForm } from "@/components/project-key-form"
import { StatusDot } from "@/components/status-dot"
import { Button } from "@/components/ui/button"
import { WorkspaceMembers } from "@/components/workspace-members"
import {
  api,
  type Label,
  type Project,
  type Status,
  type Workspace,
} from "@/lib/api"
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
 * Project workflow editor for the Settings screen. Mirrors the
 * ProjectPage workflow section (same api calls) without importing it,
 * so ProjectPage keeps working unchanged.
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
  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const loaded = await api.listStatuses(project.id)
      setStatuses([...loaded].sort((a, b) => a.position - b.position))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleDelete(statusId: string) {
    setDeleteError(null)
    try {
      await api.deleteStatus(project.id, statusId)
      setStatuses((current) => current.filter((s) => s.id !== statusId))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <ProjectIcon icon={project.icon} color={project.color} size={14} />
        {project.name}{" "}
        <span className="text-muted-foreground">({project.key})</span>
      </h3>
      {canManage && (
        <div className="flex flex-col gap-2">
          <ProjectKeyForm project={project} onUpdated={onProjectUpdated} />
          <CreateStatusForm
            projectId={project.id}
            onCreated={(status) =>
              setStatuses((current) =>
                [...current, status].sort((a, b) => a.position - b.position)
              )
            }
          />
        </div>
      )}
      {loading && (
        <p className="text-muted-foreground text-sm">Loading statuses…</p>
      )}
      {loadError && <p className="text-destructive text-sm">{loadError}</p>}
      {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
      {!loading && !loadError && statuses.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No statuses yet. Define the workflow above.
        </p>
      )}
      {!loading &&
        !loadError &&
        statuses.map((status) => (
          <section
            key={status.id}
            aria-label={status.name}
            className="flex flex-col gap-1 rounded-md border p-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 font-medium text-sm">
                <StatusDot status={status} />
                <span data-testid="status-name">{status.name}</span>
              </h4>
              <span
                data-testid="status-category"
                className="text-muted-foreground text-xs"
              >
                {status.category}
              </span>
            </div>
            {canManage && (
              <div>
                <Button
                  variant="outline"
                  onClick={() => void handleDelete(status.id)}
                >
                  Delete {status.name}
                </Button>
              </div>
            )}
          </section>
        ))}
    </div>
  )
}

/** Workspace label registry, read-only: no label CRUD UI exists yet. */
function LabelsSection({ workspaceId }: { workspaceId: string }) {
  const [labels, setLabels] = useState<Label[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLabels(null)
    setError(null)
    api
      .listLabels(workspaceId)
      .then((loaded) => {
        if (!cancelled) setLabels(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load")
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!labels)
    return <p className="text-muted-foreground text-sm">Loading labels…</p>
  if (labels.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No labels in this workspace yet.
      </p>
    )

  return (
    <ul className="flex flex-col gap-2">
      {labels.map((label) => (
        <li
          key={label.id}
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
        </li>
      ))}
    </ul>
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
        {tab === "labels" && <LabelsSection workspaceId={workspace.id} />}
        {tab === "notifications" && <NotificationSettings />}
      </div>
    </div>
  )
}
