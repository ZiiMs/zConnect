import { AuthForm } from "@/components/auth-form"
import { CreateWorkspaceForm } from "@/components/create-workspace-form"
import { InviteMemberForm } from "@/components/invite-member-form"
import { Button } from "@/components/ui/button"
import { WorkspaceMembers } from "@/components/workspace-members"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
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

function WorkspaceShell() {
  const { workspaces, selectedId, selected, select, loading, error, refresh } =
    useWorkspaces()
  const canManageMembers =
    selected?.role === "Owner" || selected?.role === "Admin"

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-medium">zConnect</h1>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">Workspaces</h2>
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
        <CreateWorkspaceForm
          onCreated={(workspace) => {
            void refresh().then(() => select(workspace.id))
          }}
        />
      </section>
      {selected && (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium text-sm">
            {selected.name}{" "}
            <span className="text-muted-foreground">({selected.role})</span>
          </h2>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Members</h3>
            <WorkspaceMembers workspaceId={selected.id} />
          </div>
          {canManageMembers ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-medium text-sm">Invite a member</h3>
              <InviteMemberForm workspaceId={selected.id} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only Owners and Admins can invite members.
            </p>
          )}
        </section>
      )}
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

  return session ? <WorkspaceShell /> : <SignedOut />
}

export default App
