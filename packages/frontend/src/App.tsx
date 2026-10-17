import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import type { ReactNode } from "react"
import { useState } from "react"
import { AuthForm } from "@/components/auth-form"
import { CreateProjectForm } from "@/components/create-project-form"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { ProjectPage } from "@/components/project-page"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"
import { initialsOf, UserAvatar } from "@/components/user-avatar"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { useProjects } from "@/hooks/use-projects"
import { useWorkspaces } from "@/hooks/use-workspaces"
import type { Project, Workspace } from "@/lib/api"
import { signOut, useSession } from "@/lib/auth-client"
import { ProjectIcon } from "@/lib/project-icons"

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

type ShellView = "project" | "settings" | "new-project"

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
    <section className="flex flex-col gap-1.5">
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

/**
 * Workspace dropdown pinned top-left: the icon plus the selected workspace
 * name open a menu that switches workspaces. Creation lives in the modal —
 * the menu entry just opens it.
 */
function WorkspaceDropdown({
  workspaces,
  selectedId,
  selected,
  loading,
  error,
  onSelect,
  onAdd,
}: {
  workspaces: Workspace[]
  selectedId: string | null
  selected: Workspace | null
  loading: boolean
  error: string | null
  onSelect: (workspaceId: string) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)

  function selectWorkspace(workspaceId: string) {
    onSelect(workspaceId)
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={(props) => (
          <button
            type="button"
            data-testid="rail-workspace-trigger"
            {...props}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent"
          >
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-semibold text-[11px] text-primary-foreground"
            >
              {selected ? initialsOf(selected.name) : "ZC"}
            </span>
            <span className="truncate font-medium text-sm">
              {selected ? selected.name : "zConnect"}
            </span>
            <span
              aria-hidden="true"
              className="ml-auto text-muted-foreground text-xs"
            >
              {open ? "▴" : "▾"}
            </span>
          </button>
        )}
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            role="menu"
            aria-label="Workspaces"
            className="z-50 w-56 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 text-popover-foreground shadow-xl outline-none"
          >
            {loading && (
              <p className="px-2 py-1 text-muted-foreground text-sm">
                Loading workspaces…
              </p>
            )}
            {error && (
              <p className="px-2 py-1 text-destructive text-sm">{error}</p>
            )}
            {!loading &&
              !error &&
              workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={workspace.id === selectedId}
                  onClick={() => selectWorkspace(workspace.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    workspace.id === selectedId
                      ? "bg-accent font-medium"
                      : "hover:bg-accent"
                  }`}
                >
                  <span className="truncate">{workspace.name}</span>
                  <span className="ml-auto text-muted-foreground text-xs">
                    {workspace.role}
                  </span>
                </button>
              ))}
            {!loading && !error && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onAdd()
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-accent"
              >
                New workspace
              </button>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * One project as an accordion group. The header expands the group; its
 * single child row is "Issues", which opens that project's issues screen.
 */
function ProjectRailGroup({
  project,
  selected,
  expanded,
  onToggle,
  onOpenIssues,
}: {
  project: Project
  selected: boolean
  expanded: boolean
  onToggle: () => void
  onOpenIssues: () => void
}) {
  const panelId = `rail-project-${project.id}`
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        data-selected={selected ? "true" : undefined}
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm ${
          selected ? "bg-accent font-medium" : ""
        }`}
      >
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          {expanded ? "▾" : "▸"}
        </span>
        <ProjectIcon icon={project.icon} color={project.color} size={14} />
        <span className="truncate">{project.name}</span>
        <span className="ml-auto font-mono text-muted-foreground text-xs">
          {project.key}
        </span>
      </button>
      {expanded && (
        <div id={panelId} className="flex flex-col gap-1 pl-5">
          <button
            type="button"
            onClick={onOpenIssues}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Issues
          </button>
        </div>
      )}
    </div>
  )
}

function WorkspaceShell({
  userId,
  userEmail,
  userName,
  userImage,
}: {
  userId: string
  userEmail?: string
  userName?: string
  userImage?: string | null
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
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)
  const [collapsedProjectId, setCollapsedProjectId] = useState<string | null>(
    null
  )

  /** Header click: expand-and-select, or collapse the selected group. */
  function toggleProject(projectId: string) {
    if (projectId === selectedProjectId && collapsedProjectId !== projectId) {
      setCollapsedProjectId(projectId)
      return
    }
    setCollapsedProjectId(null)
    selectProject(projectId)
  }

  function openProjectIssues(projectId: string) {
    selectProject(projectId)
    setView("project")
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-sidebar">
      {/* The rail sits directly on the app frame with no borders of its own —
          the rounded panel beside it is what reads as the app. */}
      <aside data-testid="rail" className="flex w-60 shrink-0 flex-col">
        <div className="flex shrink-0 flex-col px-4 pt-3 pb-2">
          <WorkspaceDropdown
            workspaces={workspaces}
            selectedId={selectedId}
            selected={selected}
            loading={loading}
            error={error}
            onSelect={select}
            onAdd={() => setWorkspaceModalOpen(true)}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
          {selected && (
            <>
              <nav aria-label="Workspace" className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Dashboard (soon)"
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm opacity-60"
                >
                  <span aria-hidden="true">⌂</span>
                  Home
                  <span className="ml-auto truncate text-[10px]">
                    Dashboard (soon)
                  </span>
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
                        onClick={() => setView("new-project")}
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
                  projects.length === 0 && (
                    <div className="flex flex-col items-start gap-2">
                      <p className="text-muted-foreground text-sm">
                        No projects yet — create one to get started.
                      </p>
                      {canManageMembers && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setView("new-project")}
                        >
                          New project
                        </Button>
                      )}
                    </div>
                  )}
                {projects.map((project) => (
                  <ProjectRailGroup
                    key={project.id}
                    project={project}
                    selected={project.id === selectedProjectId}
                    expanded={
                      project.id === selectedProjectId &&
                      collapsedProjectId !== project.id
                    }
                    onToggle={() => toggleProject(project.id)}
                    onOpenIssues={() => openProjectIssues(project.id)}
                  />
                ))}
              </RailSection>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <UserAvatar
              name={userName ?? userEmail ?? userId}
              image={userImage}
              size={28}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-sm">
                {userName ?? userEmail ?? userId}
              </span>
              {userEmail && (
                <span className="truncate text-muted-foreground text-xs">
                  {userEmail}
                </span>
              )}
            </span>
          </div>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="m-2 min-w-0 flex-1 overflow-hidden rounded-lg bg-background">
        <div className="flex h-full w-full flex-col overflow-y-auto p-4">
          {!selected ? (
            <div className="flex max-w-md flex-col gap-3">
              <h2 className="font-medium text-sm">Workspaces</h2>
              {!loading && !error && (
                <>
                  <p className="text-muted-foreground text-sm">
                    Create a workspace to get started, or pick one from the
                    dropdown.
                  </p>
                  <Button onClick={() => setWorkspaceModalOpen(true)}>
                    New workspace
                  </Button>
                </>
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
          ) : view === "new-project" ? (
            <section
              aria-label="New project"
              className="flex max-w-2xl flex-col gap-4"
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setView("project")}
                >
                  ← Back
                </Button>
                <h2 className="font-medium text-sm">New project</h2>
              </div>
              <p className="text-muted-foreground text-sm">
                Create a project in {selected.name} — the key fills in from the
                name.
              </p>
              <CreateProjectForm
                workspaceId={selected.id}
                onCreated={(project) => {
                  void refreshProjects().then(() => selectProject(project.id))
                  setView("project")
                }}
                onCancel={() => setView("project")}
              />
            </section>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-4">
              {selectedProject ? (
                <ProjectPage
                  key={selectedProject.id}
                  project={selectedProject}
                  canManage={canManageMembers}
                  canWriteIssues={canWriteIssues}
                  userId={userId}
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
      <Modal
        open={workspaceModalOpen}
        onOpenChange={setWorkspaceModalOpen}
        title="New workspace"
        description="Workspaces group projects and members."
      >
        <CreateWorkspaceForm
          onCreated={(workspace) => {
            void refresh().then(() => select(workspace.id))
            setWorkspaceModalOpen(false)
          }}
        />
      </Modal>
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
    <WorkspaceShell
      userId={user.id}
      userEmail={user.email}
      userName={user.name}
      userImage={user.image}
    />
  ) : (
    <SignedOut />
  )
}

export default App
