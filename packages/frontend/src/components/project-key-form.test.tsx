import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api } from "@/lib/api"
import { ProjectKeyForm } from "./project-key-form.js"

vi.mock("@/lib/api", () => ({
  api: {
    updateProject: vi.fn(),
  },
}))

const updateProject = vi.mocked(api.updateProject)

describe("project key form", () => {
  test("edits the project key", async () => {
    const user = userEvent.setup()
    updateProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "SITE",
      icon: "Folder",
      color: "#94a3b8",
    })
    const onUpdated = vi.fn()
    render(
      <ProjectKeyForm
        project={{
          id: "pr-1",
          workspaceId: "ws-1",
          name: "Web",
          key: "WEB",
          icon: "Folder",
          color: "#94a3b8",
        }}
        onUpdated={onUpdated}
      />
    )

    await user.clear(screen.getByLabelText(/project key/i))
    await user.type(screen.getByLabelText(/project key/i), "SITE")
    await user.click(screen.getByRole("button", { name: /save key/i }))

    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith("pr-1", { key: "SITE" })
    )
    expect(onUpdated).toHaveBeenCalledWith({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "SITE",
      icon: "Folder",
      color: "#94a3b8",
    })
  })

  test("surfaces the key-locked error", async () => {
    const user = userEvent.setup()
    updateProject.mockRejectedValue(
      new Error("Project key is locked once issues exist")
    )
    render(
      <ProjectKeyForm
        project={{
          id: "pr-1",
          workspaceId: "ws-1",
          name: "Web",
          key: "WEB",
          icon: "Folder",
          color: "#94a3b8",
        }}
        onUpdated={() => {}}
      />
    )

    await user.clear(screen.getByLabelText(/project key/i))
    await user.type(screen.getByLabelText(/project key/i), "SITE")
    await user.click(screen.getByRole("button", { name: /save key/i }))

    expect(
      await screen.findByText(/locked once issues exist/i)
    ).toBeInTheDocument()
  })
})
