import { Button } from "@/components/ui/button"
import type { Workspace } from "@/lib/api"

interface WorkspaceSwitcherProps {
  workspaces: Workspace[]
  selectedId: string | null
  onSelect: (workspaceId: string) => void
}

/** App-shell workspace list: every visible workspace with its role. */
export function WorkspaceSwitcher({
  workspaces,
  selectedId,
  onSelect,
}: WorkspaceSwitcherProps) {
  if (workspaces.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No workspaces yet — create one to get started.
      </p>
    )
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-medium text-sm">Workspaces</legend>
      {workspaces.map((workspace) => (
        <Button
          key={workspace.id}
          variant={workspace.id === selectedId ? "default" : "outline"}
          aria-pressed={workspace.id === selectedId}
          onClick={() => onSelect(workspace.id)}
          className="justify-between"
        >
          <span>{workspace.name}</span>
          <span className="text-xs opacity-70">{workspace.role}</span>
        </Button>
      ))}
    </fieldset>
  )
}
