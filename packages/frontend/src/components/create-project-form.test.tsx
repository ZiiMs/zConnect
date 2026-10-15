import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api } from "@/lib/api"
import { CreateProjectForm } from "./create-project-form.js"

vi.mock("@/lib/api", () => ({
  api: {
    createProject: vi.fn(),
  },
}))

const createProject = vi.mocked(api.createProject)

describe("create project form", () => {
  test("creates a project with name and key", async () => {
    const user = userEvent.setup()
    createProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
    })
    const onCreated = vi.fn()
    render(<CreateProjectForm workspaceId="ws-1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText(/project name/i), "Web")
    await user.type(screen.getByLabelText(/project key/i), "web")
    await user.click(screen.getByRole("button", { name: /create project/i }))

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith("ws-1", {
        name: "Web",
        key: "web",
      })
    )
    expect(onCreated).toHaveBeenCalledWith({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
    })
  })

  test("shows an error when creation is rejected", async () => {
    const user = userEvent.setup()
    createProject.mockRejectedValue(new Error("Key taken"))
    render(<CreateProjectForm workspaceId="ws-1" onCreated={() => {}} />)

    await user.type(screen.getByLabelText(/project name/i), "Web")
    await user.type(screen.getByLabelText(/project key/i), "WEB")
    await user.click(screen.getByRole("button", { name: /create project/i }))

    expect(await screen.findByText(/key taken/i)).toBeInTheDocument()
  })
})
