import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import {
  ArrowLeft,
  Inbox as InboxIcon,
  ListTodo,
  Settings as SettingsIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { AuthForm } from "@/components/auth-form"
import { CreateProjectForm } from "@/components/create-project-form"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { Inbox } from "@/components/inbox"
import { InvitePage } from "@/components/invite-page"
import { MyIssues } from "@/components/my-issues"
import { ProjectPage } from "@/components/project-page"
import { LiveUnreadCountBridge } from "@/components/realtime/live-notifications"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"
import { initialsOf, UserAvatar } from "@/components/user-avatar"
import {
  SETTINGS_CATEGORIES,
  SettingsIndex,
  WorkspaceSettings,
} from "@/components/workspace-settings"
import { navigate, usePathname } from "@/hooks/use-pathname"
import { useProjects } from "@/hooks/use-projects"
import { formatUnreadCount, useUnreadCount } from "@/hooks/use-unread-count"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { api, type Issue, type Project, type Workspace } from "@/lib/api"
import { signOut, useSession } from "@/lib/auth-client"
import { ProjectIcon } from "@/lib/project-icons"
import { realtimeEnabled } from "@/lib/realtime"
import {
  buildInboxPath,
  buildInvitePath,
  buildIssuePath,
  buildMyIssuesPath,
  buildNewProjectPath,
  buildProjectPath,
  buildSettingsPath,
  buildWorkspacePath,
  findProjectByKey,
  findWorkspaceBySlug,
  parseAppPath,
  parseInvitePath,
  type SettingsTab,
  slugifyWorkspace,
} from "@/lib/routes"

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

/** Invite link while signed out: authenticate first, then return to it. */
function SignedOutInvite({ callbackURL }: { callbackURL: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div>
          <h1 className="font-medium">Sign in to accept your invitation</h1>
          <p className="text-muted-foreground text-sm">
            Use the email address the invitation was sent to.
          </p>
        </div>
        <AuthForm callbackURL={callbackURL} />
      </div>
    </div>
  )
}

/**
 * Signed-in invite link: the accept page owns the fetch, while this shell
 * owns the post-accept refresh + navigation so the workspace list is current
 * before the joined workspace's path renders.
 */
function SignedInInvite({ invitationId }: { invitationId: string }) {
  const { refresh } = useWorkspaces()
  return (
    <InvitePage
      invitationId={invitationId}
      onAccepted={(invitation) => {
        void refresh().then(() => {
          navigate(buildWorkspacePath(invitation.workspace.name))
        })
      }}
    />
  )
}

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
  const { count: unreadCount, setCount: setUnreadCount } = useUnreadCount()
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
  } = useProjects(selected?.id ?? null)
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)
  const [accountInboxOpen, setAccountInboxOpen] = useState(false)
  const [collapsedProjectId, setCollapsedProjectId] = useState<string | null>(
    null
  )

  /**
   * URL as the state store for workspace + open page:
   * `/{workspaceSlug}[/{PROJECTKEY}]`, `/{workspaceSlug}/issue/{IDENTIFIER}`,
   * `/{workspaceSlug}/settings[/{tab}]`, `/{workspaceSlug}/my-issues[/{tab}]`,
   * `/{workspaceSlug}/inbox[/{filter}]`, `/{workspaceSlug}/new-project`.
   * The identifier is the lookup key; workspace/title segments are context.
   */
  const pathname = usePathname()
  const parsed = useMemo(() => parseAppPath(pathname), [pathname])
  /** Issue detail renders inside the project view; every other section renders itself. */
  const activeSection = parsed.section === "issue" ? "project" : parsed.section
  const activeIdentifier = parsed.identifier
  const selectedSlug = selected ? slugifyWorkspace(selected.name) : null
  const urlWorkspaceMatches =
    parsed.workspaceSlug === null ||
    selectedSlug === null ||
    parsed.workspaceSlug === selectedSlug

  // Deep-linked row: fetch once per identifier so a share link resolves even
  // when the filtered list query would exclude it (or before lists load).
  const [deepIssue, setDeepIssue] = useState<Issue | null>(null)
  useEffect(() => {
    if (!activeIdentifier) {
      setDeepIssue(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const fetched = await api.getIssue(activeIdentifier)
        if (!cancelled) setDeepIssue(fetched)
      } catch {
        if (!cancelled) setDeepIssue(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeIdentifier])

  // URL -> workspace: a slug in the path selects that workspace. Skipped
  // when the selected workspace already matches the slug so a local
  // selection + navigation applied in the same tick never snaps back.
  useEffect(() => {
    if (workspaces.length === 0 || !parsed.workspaceSlug) return
    if (selected && slugifyWorkspace(selected.name) === parsed.workspaceSlug) {
      return
    }
    const match = findWorkspaceBySlug(workspaces, parsed.workspaceSlug)
    if (match && match.id !== selectedId) select(match.id)
  }, [workspaces, parsed.workspaceSlug, selectedId, select, selected])

  // Workspace -> URL: keep the path canonical without stacking history.
  // The section is preserved when repairing an empty/unknown slug; explicit
  // UI navigations push their own paths (see the rail handlers).
  useEffect(() => {
    if (!selected || loading || workspaces.length === 0) return
    if (parsed.identifier) return
    if (parsed.workspaceSlug === selectedSlug) return
    const match = findWorkspaceBySlug(workspaces, parsed.workspaceSlug)
    // Fresh landing (root) or an unknown slug replaces; a UI workspace
    // switch pushes so Back returns to the previous workspace.
    const replace = parsed.workspaceSlug === null || !match
    let path: string
    if (parsed.section === "settings") {
      path = buildSettingsPath(
        selected.name,
        parsed.settingsTab === "index" ? undefined : parsed.settingsTab
      )
    } else if (parsed.section === "my-issues") {
      path = buildMyIssuesPath(
        selected.name,
        parsed.myIssuesTab === "assigned" ? undefined : parsed.myIssuesTab
      )
    } else if (parsed.section === "inbox") {
      path = buildInboxPath(
        selected.name,
        parsed.inboxFilter === "all" ? undefined : parsed.inboxFilter
      )
    } else if (parsed.section === "new-project") {
      path = buildNewProjectPath(selected.name)
    } else if (parsed.section === "project" && parsed.projectKey) {
      const target =
        selectedProject ??
        projects.find((p) => p.id === selectedProjectId) ??
        projects[0]
      path = target
        ? buildProjectPath(selected.name, target.key)
        : `/${selectedSlug}`
    } else {
      path = `/${selectedSlug}`
    }
    navigate(path, { replace })
  }, [
    selected,
    loading,
    workspaces,
    parsed.workspaceSlug,
    parsed.identifier,
    parsed.section,
    parsed.settingsTab,
    parsed.myIssuesTab,
    parsed.inboxFilter,
    parsed.projectKey,
    selectedSlug,
    selectedProject,
    selectedProjectId,
    projects,
  ])

  // URL -> project: `/{ws}/{KEY}` selects that project once loaded. Skipped
  // when the selection already matches so a local select + navigation applied
  // in the same tick never snaps back.
  useEffect(() => {
    if (!parsed.projectKey || projects.length === 0) return
    if (
      selectedProject &&
      selectedProject.key.toUpperCase() === parsed.projectKey
    ) {
      return
    }
    const match = findProjectByKey(projects, parsed.projectKey)
    if (match && match.id !== selectedProjectId) {
      selectProject(match.id)
      setCollapsedProjectId(null)
    }
  }, [
    projects,
    parsed.projectKey,
    selectedProject,
    selectedProjectId,
    selectProject,
  ])

  // Project -> URL: the home alias `/{ws}` canonicalizes to `/{ws}/{KEY}`,
  // and an unknown key falls back to the open project. Both replace so the
  // alias never stacks a history entry.
  useEffect(() => {
    if (!selected || projectsLoading || projects.length === 0) return
    if (parsed.section !== "project" || parsed.identifier) return
    if (parsed.workspaceSlug !== selectedSlug) return
    if (parsed.projectKey) {
      const match = findProjectByKey(projects, parsed.projectKey)
      if (!match) {
        const target = selectedProject ?? projects[0]
        if (!target) return
        navigate(buildProjectPath(selected.name, target.key), {
          replace: true,
        })
      }
      return
    }
    const target = selectedProject ?? projects[0]
    if (!target) return
    const canonical = buildProjectPath(selected.name, target.key)
    if (window.location.pathname !== canonical) {
      navigate(canonical, { replace: true })
    }
  }, [
    selected,
    projectsLoading,
    projects,
    parsed.section,
    parsed.identifier,
    parsed.workspaceSlug,
    parsed.projectKey,
    selectedSlug,
    selectedProject,
  ])

  // Settings workflow needs a project: repair the URL to members when the
  // workspace has none (the tab itself stays disabled with its hint).
  useEffect(() => {
    if (
      parsed.section === "settings" &&
      parsed.settingsTab === "workflow" &&
      selected &&
      !selectedProject &&
      !projectsLoading &&
      projects.length === 0
    ) {
      navigate(buildSettingsPath(selected.name, "members"), { replace: true })
    }
  }, [
    parsed.section,
    parsed.settingsTab,
    selected,
    selectedProject,
    projectsLoading,
    projects.length,
  ])

  // Deep link -> project: the issue's project becomes the selected one.
  useEffect(() => {
    if (!deepIssue) return
    if (selectedProjectId === deepIssue.projectId) return
    if (projects.some((p) => p.id === deepIssue.projectId)) {
      selectProject(deepIssue.projectId)
      setCollapsedProjectId(null)
    }
  }, [deepIssue, projects, selectedProjectId, selectProject])

  // Cross-workspace share link: the issue lives elsewhere, so follow it and
  // rewrite the path to the owning workspace's canonical issue URL.
  useEffect(() => {
    if (!deepIssue || workspaces.length === 0 || projectsLoading) return
    if (projects.some((p) => p.id === deepIssue.projectId)) return
    let cancelled = false
    void (async () => {
      try {
        const owner = await api.getProject(deepIssue.projectId)
        if (cancelled) return
        const home = workspaces.find((w) => w.id === owner.workspaceId)
        if (home && home.id !== selectedId) {
          select(home.id)
          navigate(
            buildIssuePath(home.name, deepIssue.identifier, deepIssue.title),
            { replace: true }
          )
        }
      } catch {
        // Unknown project: stay where we are; the detail shows not-found.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [deepIssue, projects, projectsLoading, workspaces, selectedId, select])

  function handleOpenIssue(issue: Issue, opts?: { replace?: boolean }) {
    if (!selected) return
    navigate(buildIssuePath(selected.name, issue.identifier, issue.title), opts)
  }

  /**
   * Inbox/My Issues target: select the owning workspace, then navigate with
   * that workspace's slug so the URL is canonical immediately. The shell's
   * deep-link effect resolves the issue's project from the identifier.
   */
  function handleOpenIssueTarget(target: {
    workspaceId: string
    identifier: string
    title: string
  }) {
    const targetWorkspace =
      workspaces.find((workspace) => workspace.id === target.workspaceId) ??
      null
    if (targetWorkspace) {
      if (targetWorkspace.id !== selectedId) select(targetWorkspace.id)
      navigate(
        buildIssuePath(targetWorkspace.name, target.identifier, target.title)
      )
    } else {
      if (!selected) return
      navigate(buildIssuePath(selected.name, target.identifier, target.title))
    }
  }

  /**
   * Workspace switch from the UI: select + navigate atomically so the
   * URL <-> state effects observe a consistent pair and never snap back.
   */
  function handleSelectWorkspace(id: string) {
    const target = workspaces.find((w) => w.id === id)
    select(id)
    if (target) {
      const path = `/${slugifyWorkspace(target.name)}`
      if (window.location.pathname !== path) navigate(path)
    }
  }

  function handleCloseIssue() {
    if (!selected) return
    if (selectedProject) {
      navigate(buildProjectPath(selected.name, selectedProject.key))
    } else {
      navigate(buildWorkspacePath(selected.name))
    }
  }

  /**
   * Header click: the main view always returns to the project (navigating to
   * its URL), while the rail group expands or collapses in place.
   * Selection + navigation apply atomically so the URL <-> state effects
   * never snap back.
   */
  function toggleProject(projectId: string) {
    const target = projects.find((p) => p.id === projectId)
    if (selected && target) {
      const path = buildProjectPath(selected.name, target.key)
      if (window.location.pathname !== path) navigate(path)
    }
    if (projectId === selectedProjectId && collapsedProjectId !== projectId) {
      setCollapsedProjectId(projectId)
      return
    }
    setCollapsedProjectId(null)
    selectProject(projectId)
  }

  function openProjectIssues(projectId: string) {
    const target = projects.find((p) => p.id === projectId)
    selectProject(projectId)
    setCollapsedProjectId(null)
    if (selected && target) {
      const path = buildProjectPath(selected.name, target.key)
      if (window.location.pathname !== path) navigate(path)
    }
  }

  /** Rail section navigation: the URL is the state store, so every link pushes. */
  function goSettings(tab?: SettingsTab) {
    if (!selected) return
    navigate(buildSettingsPath(selected.name, tab))
  }

  function goMyIssues() {
    if (!selected) return
    navigate(buildMyIssuesPath(selected.name))
  }

  function goInbox() {
    if (!selected) return
    navigate(buildInboxPath(selected.name))
  }

  function goNewProject() {
    if (!selected) return
    navigate(buildNewProjectPath(selected.name))
  }

  function goProjectHome() {
    if (!selected) return
    if (selectedProject) {
      navigate(buildProjectPath(selected.name, selectedProject.key))
    } else {
      navigate(buildWorkspacePath(selected.name))
    }
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-sidebar">
      {realtimeEnabled && <LiveUnreadCountBridge onCount={setUnreadCount} />}
      {/* The rail sits directly on the app frame with no borders of its own —
          the rounded panel beside it is what reads as the app. */}
      <aside data-testid="rail" className="flex w-60 shrink-0 flex-col">
        {activeSection === "settings" && selected ? (
          <>
            <div className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2">
              <button
                type="button"
                onClick={goProjectHome}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <ArrowLeft
                  aria-hidden="true"
                  size={14}
                  className="text-muted-foreground"
                />
                Back to app
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
              <nav aria-label="Settings" className="flex flex-col gap-4">
                {SETTINGS_CATEGORIES.map((category) => (
                  <div key={category.label} className="flex flex-col gap-0.5">
                    <p className="truncate px-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                      {category.label}
                    </p>
                    {category.items.map((item) => {
                      const disabled =
                        item.id === "workflow" && !selectedProject
                      const active = parsed.settingsTab === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          disabled={disabled}
                          title={
                            disabled
                              ? "Select a project to manage its workflow"
                              : undefined
                          }
                          onClick={() => goSettings(item.id)}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50 ${
                            active ? "bg-accent font-medium" : ""
                          }`}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </nav>
            </div>
          </>
        ) : (
          <>
            <div className="flex shrink-0 flex-col px-4 pt-3 pb-2">
              <WorkspaceDropdown
                workspaces={workspaces}
                selectedId={selectedId}
                selected={selected}
                loading={loading}
                error={error}
                onSelect={handleSelectWorkspace}
                onAdd={() => setWorkspaceModalOpen(true)}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
              {!selected ? (
                <nav aria-label="Account" className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-current={accountInboxOpen ? "page" : undefined}
                    onClick={() => setAccountInboxOpen((open) => !open)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      accountInboxOpen ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <InboxIcon
                      aria-hidden="true"
                      size={14}
                      className="text-muted-foreground"
                    />
                    Inbox
                    {unreadCount > 0 && (
                      <span
                        data-testid="inbox-unread-badge"
                        className="ml-auto rounded-full bg-primary px-1.5 font-medium text-[10px] text-primary-foreground"
                      >
                        {formatUnreadCount(unreadCount)}
                      </span>
                    )}
                  </button>
                </nav>
              ) : (
                <>
                  <nav aria-label="Workspace" className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      aria-current={
                        activeSection === "my-issues" ? "page" : undefined
                      }
                      onClick={goMyIssues}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        activeSection === "my-issues"
                          ? "bg-accent font-medium"
                          : ""
                      }`}
                    >
                      <ListTodo
                        aria-hidden="true"
                        size={14}
                        className="text-muted-foreground"
                      />
                      My Issues
                    </button>
                    <button
                      type="button"
                      aria-current={
                        activeSection === "inbox" ? "page" : undefined
                      }
                      onClick={goInbox}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        activeSection === "inbox" ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <InboxIcon
                        aria-hidden="true"
                        size={14}
                        className="text-muted-foreground"
                      />
                      Inbox
                      {unreadCount > 0 && (
                        <span
                          data-testid="inbox-unread-badge"
                          className="ml-auto rounded-full bg-primary px-1.5 font-medium text-[10px] text-primary-foreground"
                        >
                          {formatUnreadCount(unreadCount)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-current={
                        activeSection === "settings" ? "page" : undefined
                      }
                      onClick={() => goSettings()}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        activeSection === "settings"
                          ? "bg-accent font-medium"
                          : ""
                      }`}
                    >
                      <SettingsIcon
                        aria-hidden="true"
                        size={14}
                        className="text-muted-foreground"
                      />
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
                            onClick={goNewProject}
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
                      <p className="text-destructive text-sm">
                        {projectsError}
                      </p>
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
                              onClick={goNewProject}
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
          </>
        )}
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
          {activeSection === "inbox" ? (
            <Inbox
              onOpenIssue={handleOpenIssueTarget}
              onUnreadCountChange={setUnreadCount}
              onInvitationAccepted={() => void refresh()}
              activeFilter={parsed.inboxFilter}
              onFilterChange={(filter) => {
                if (selected) navigate(buildInboxPath(selected.name, filter))
              }}
            />
          ) : !selected ? (
            accountInboxOpen ? (
              <Inbox
                onOpenIssue={handleOpenIssueTarget}
                onUnreadCountChange={setUnreadCount}
                onInvitationAccepted={() => void refresh()}
              />
            ) : (
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
            )
          ) : activeSection === "my-issues" ? (
            <MyIssues
              activeTab={parsed.myIssuesTab}
              onTabChange={(tab) => {
                navigate(buildMyIssuesPath(selected.name, tab))
              }}
              onOpenIssue={(issue) =>
                handleOpenIssueTarget({
                  workspaceId: issue.workspaceId,
                  identifier: issue.identifier,
                  title: issue.title,
                })
              }
            />
          ) : activeSection === "settings" ? (
            parsed.settingsTab === "index" ? (
              <SettingsIndex
                hasProject={selectedProject !== null}
                onNavigate={(tab) => goSettings(tab)}
              />
            ) : (
              <WorkspaceSettings
                workspace={selected}
                project={selectedProject}
                canManage={canManageMembers}
                activeTab={parsed.settingsTab}
                onBackToIndex={() => goSettings()}
                onWorkspaceCreated={(workspace) => {
                  void refresh().then(() => handleSelectWorkspace(workspace.id))
                }}
              />
            )
          ) : activeSection === "new-project" ? (
            <section
              aria-label="New project"
              className="flex max-w-2xl flex-col gap-4"
            >
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goProjectHome}>
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
                  void refreshProjects().then(() => {
                    selectProject(project.id)
                    navigate(buildProjectPath(selected.name, project.key))
                  })
                }}
                onCancel={goProjectHome}
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
                  activeIssueIdentifier={
                    urlWorkspaceMatches ? activeIdentifier : null
                  }
                  deepIssue={deepIssue}
                  onOpenIssue={handleOpenIssue}
                  onCloseIssue={handleCloseIssue}
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
            void refresh().then(() => handleSelectWorkspace(workspace.id))
            setWorkspaceModalOpen(false)
          }}
        />
      </Modal>
    </div>
  )
}

export function App() {
  const { data: session, isPending } = useSession()
  const pathname = usePathname()
  const invitationId = parseInvitePath(pathname)

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Loading session…</p>
      </div>
    )
  }

  if (invitationId) {
    return session?.user ? (
      <SignedInInvite invitationId={invitationId} />
    ) : (
      <SignedOutInvite callbackURL={buildInvitePath(invitationId)} />
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
