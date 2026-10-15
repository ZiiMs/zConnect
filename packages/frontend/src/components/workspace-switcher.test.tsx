import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Workspace } from "@/lib/api"
import { WorkspaceSwitcher } from "./workspace-switcher.js"

const workspaces: Workspace[] = [
  { id: "ws-1", name: "Acme", role: "Owner" },
  { id: "ws-2", name: "Beta", role: "Member" },
]

describe("workspace switcher", () => {
  test("lists every workspace with its role", () => {
    render(
      <WorkspaceSwitcher
        workspaces={workspaces}
        selectedId="ws-1"
        onSelect={() => {}}
      />
    )
    expect(screen.getByText("Acme")).toBeInTheDocument()
    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(screen.getByText("Owner")).toBeInTheDocument()
    expect(screen.getByText("Member")).toBeInTheDocument()
  })

  test("selecting a workspace notifies the parent", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <WorkspaceSwitcher
        workspaces={workspaces}
        selectedId="ws-1"
        onSelect={onSelect}
      />
    )
    await user.click(screen.getByRole("button", { name: /beta/i }))
    expect(onSelect).toHaveBeenCalledWith("ws-2")
  })

  test("marks the active workspace as selected", () => {
    render(
      <WorkspaceSwitcher
        workspaces={workspaces}
        selectedId="ws-2"
        onSelect={() => {}}
      />
    )
    expect(screen.getByRole("button", { name: /beta/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: /acme/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  test("shows an empty state without workspaces", () => {
    render(
      <WorkspaceSwitcher
        workspaces={[]}
        selectedId={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText(/no workspaces/i)).toBeInTheDocument()
  })
})
