import type { ReactNode } from "react"
import { useState } from "react"
import { AuthForm } from "@/components/auth-form"
import { CreateProjectForm } from "@/components/create-project-form"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { ProjectPage } from "@/components/project-page"
import { Button } from "@/components/ui/button"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { useProjects } from "@/hooks/use-projects"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { signOut, useSession } from "@/lib/auth-client"

function SignedOut() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div>
          <h1 className="font-medium">zConnect</h1>
          <p className="text-muted-foreground text-sm">
            Sign in or create an account to continue.
          </p>
        </div>
        <AuthForm />
      </div>
    </div>
  )
}

type ShellView = "project" | "settings"

/**
 * One labeled rail block: distinct surface, collapsible via its header
 * toggle. Keeps the narrow rail scannable once workspaces, nav and
 * projects stack up.
 */
function RailSection({
  label,
  action,
  defaultOpen = true,
  children,
}: {
  label: string
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `rail-section-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`
  return (
    <section className="flex flex-col gap-2 rounded-md border border-sidebar-border bg-card p-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left"
        >
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            {open ? "▾" : "▸"}
          </span>
          <span className="truncate font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </button>
        {action}
      </div>
      {open && (
        <div id={panelId} className="flex flex-col gap-2">
          {children}
        </div>
      )}
    </section>
  )
}

function WorkspaceShell({
  userId,
  userEmail,
}: {
  userId: string
  userEmail?: string
}) {
  const { workspaces, selectedId, selected, select, loading, error, refresh } =
    useWorkspaces()
  const canManageMembers =
    selected?.role === "Owner" || selected?.role === "Admin"
  const canWriteIssues = selected !== null && selected.role !== "Viewer"
  const {
    projects,
    selectedId: selectedProjectId,
    selected: selectedProject,
    select: selectProject,
    loading: projectsLoading,
    error: projectsError,
    refresh: refreshProjects,
    replace: replaceProject,
  } = useProjects(selected?.id ?? null)
  const [view, setView] = useState<ShellView>("project")
  const [creatingProject, setCreatingProject] = useState(false)

  const initials = selected
    ? selected.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "ZC"

  return (
    <div className="flex min-h-svh w-full">
      <aside className="flex w-60 shrink-0 flex-col gap-4 border-r bg-sidebar p-3">
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-semibold text-[11px] text-primary-foreground">
            {initials}
          </span>
          <span className="truncate font-medium text-sm">
            {selected ? selected.name : "zConnect"}
          </span>
        </div>
        <RailSection label="Workspaces">
          {loading && (
            <p className="text-muted-foreground text-sm">Loading workspaces…</p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
          {!loading && !error && (
            <WorkspaceSwitcher
              workspaces={workspaces}
              selectedId={selectedId}
              onSelect={select}
            />
          )}
        </RailSection>
        {selected && (
          <>
            <nav
              aria-label="Workspace"
              className="flex flex-col gap-1 rounded-md border border-sidebar-border bg-card p-1"
            >
              <button
                type="button"
                aria-current={view === "project" ? "page" : undefined}
                onClick={() => setView("project")}
                className={`flex items-center rounded-md px-2 py-1.5 text-left text-sm ${
                  view === "project" ? "bg-accent font-medium" : ""
                }`}
              >
                Project
                {selectedProject && (
                  <span className="ml-auto font-mono text-muted-foreground text-xs">
                    {selectedProject.key}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-current={view === "settings" ? "page" : undefined}
                onClick={() => setView("settings")}
                className={`flex items-center rounded-md px-2 py-1.5 text-left text-sm ${
                  view === "settings" ? "bg-accent font-medium" : ""
                }`}
              >
                Settings
              </button>
            </nav>
            <RailSection
              label="Projects"
              action={
                <>
                  <span className="text-muted-foreground text-xs">
                    {projects.length}
                  </span>
                  {canManageMembers && (
                    <button
                      type="button"
                      aria-label="New project"
                      aria-expanded={creatingProject}
                      onClick={() => setCreatingProject((value) => !value)}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  )}
                </>
              }
            >
              {projectsLoading && (
                <p className="text-muted-foreground text-sm">
                  Loading projects…
                </p>
              )}
              {projectsError && (
                <p className="text-destructive text-sm">{projectsError}</p>
              )}
              {!projectsLoading &&
                !projectsError &&
                projects.length === 0 &&
                !creatingProject && (
                  <p className="text-muted-foreground text-sm">
                    No projects yet — create one to get started.
                  </p>
                )}
              {projects.map((project) => (
                <Button
                  key={project.id}
                  variant={
                    project.id === selectedProjectId ? "default" : "outline"
                  }
                  aria-pressed={project.id === selectedProjectId}
                  onClick={() => selectProject(project.id)}
                  className="justify-between"
                >
                  <span>{project.name}</span>
                  <span className="text-xs opacity-70">{project.key}</span>
                </Button>
              ))}
              {canManageMembers && creatingProject && (
                <CreateProjectForm
                  workspaceId={selected.id}
                  onCreated={(project) => {
                    void refreshProjects().then(() => selectProject(project.id))
                    setCreatingProject(false)
                  }}
                  onCancel={() => setCreatingProject(false)}
                />
              )}
            </RailSection>
          </>
        )}
        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          <p className="truncate text-muted-foreground text-xs">
            {userEmail ?? userId}
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col">
          {!selected ? (
            <div className="flex max-w-md flex-col gap-2">
              <h2 className="font-medium text-sm">Workspaces</h2>
              {!loading && !error && (
                <CreateWorkspaceForm
                  onCreated={(workspace) => {
                    void refresh().then(() => select(workspace.id))
                  }}
                />
              )}
            </div>
          ) : view === "settings" ? (
            <WorkspaceSettings
              workspace={selected}
              project={selectedProject}
              canManage={canManageMembers}
              onProjectUpdated={replaceProject}
              onWorkspaceCreated={(workspace) => {
                void refresh().then(() => select(workspace.id))
              }}
            />
          ) : (
            <section className="flex flex-col gap-4">
              {selectedProject ? (
                <ProjectPage
                  key={selectedProject.id}
                  project={selectedProject}
                  canManage={canManageMembers}
                  canWriteIssues={canWriteIssues}
                  userId={userId}
                  onProjectUpdated={replaceProject}
                  onOpenSettings={() => setView("settings")}
                />
              ) : (
                !projectsLoading &&
                !projectsError &&
                projects.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Select a project to view its issues.
                  </p>
                )
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export function App() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Loading session…</p>
      </div>
    )
  }

  const user = session?.user

  return user ? (
    <WorkspaceShell userId={user.id} userEmail={user.email} />
  ) : (
    <SignedOut />
  )
}

export default App
