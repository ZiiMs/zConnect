import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  test("creates a project with the default folder icon and color", async () => {
    const user = userEvent.setup()
    createProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
      icon: "Folder",
      color: "#94a3b8",
    })
    const onCreated = vi.fn()
    render(<CreateProjectForm workspaceId="ws-1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText(/project name/i), "Web")
    const key = screen.getByLabelText(/project key/i)
    await user.clear(key)
    await user.type(key, "web")
    await user.click(screen.getByRole("button", { name: /create project/i }))

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith("ws-1", {
        name: "Web",
        key: "web",
        icon: "Folder",
        color: "#94a3b8",
      })
    )
    expect(onCreated).toHaveBeenCalledWith({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
      icon: "Folder",
      color: "#94a3b8",
    })
  })

  test("auto-generates the key from the project name", async () => {
    const user = userEvent.setup()
    createProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Website",
      key: "WEBS",
      icon: "Folder",
      color: "#94a3b8",
    })
    render(<CreateProjectForm workspaceId="ws-1" onCreated={() => {}} />)

    await user.type(screen.getByLabelText(/project name/i), "Website")
    expect(screen.getByLabelText(/project key/i)).toHaveValue("WEBS")
    expect(screen.getByTestId("key-suffix")).toHaveTextContent("-123")

    await user.click(screen.getByRole("button", { name: /create project/i }))

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith("ws-1", {
        name: "Website",
        key: "WEBS",
        icon: "Folder",
        color: "#94a3b8",
      })
    )
  })

  test("a hand-edited key stops auto-generation until regenerated", async () => {
    const user = userEvent.setup()
    createProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Website X",
      key: "WEBS",
      icon: "Folder",
      color: "#94a3b8",
    })
    render(<CreateProjectForm workspaceId="ws-1" onCreated={() => {}} />)

    await user.type(screen.getByLabelText(/project name/i), "Website")
    const key = screen.getByLabelText(/project key/i)
    await user.clear(key)
    await user.type(key, "ABC")
    await user.type(screen.getByLabelText(/project name/i), " X")
    expect(screen.getByLabelText(/project key/i)).toHaveValue("ABC")

    await user.click(
      screen.getByRole("button", { name: /regenerate key from name/i })
    )
    expect(screen.getByLabelText(/project key/i)).toHaveValue("WEBS")
    expect(screen.getByTestId("key-suffix")).toHaveTextContent("-123")
  })

  test("picks an icon and color for the project mark", async () => {
    const user = userEvent.setup()
    createProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
      icon: "Rocket",
      color: "#f2c94c",
    })
    render(<CreateProjectForm workspaceId="ws-1" onCreated={() => {}} />)

    await user.type(screen.getByLabelText(/project name/i), "Web")
    const customKey = screen.getByLabelText(/project key/i)
    await user.clear(customKey)
    await user.type(customKey, "web")
    await user.click(
      screen.getByRole("radio", { name: /project icon rocket/i })
    )
    const color = screen.getByLabelText(/custom project color/i)
    fireEvent.change(color, { target: { value: "#f2c94c" } })
    await user.click(screen.getByRole("button", { name: /create project/i }))

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith("ws-1", {
        name: "Web",
        key: "web",
        icon: "Rocket",
        color: "#f2c94c",
      })
    )
  })

  test("picks a color swatch for the project mark", async () => {
    const user = userEvent.setup()
    createProject.mockResolvedValue({
      id: "pr-1",
      workspaceId: "ws-1",
      name: "Web",
      key: "WEB",
      icon: "Folder",
      color: "#ec4899",
    })
    render(<CreateProjectForm workspaceId="ws-1" onCreated={() => {}} />)

    await user.type(screen.getByLabelText(/project name/i), "Web")
    const swatchKey = screen.getByLabelText(/project key/i)
    await user.clear(swatchKey)
    await user.type(swatchKey, "web")
    await user.click(screen.getByRole("radio", { name: /project color pink/i }))
    await user.click(screen.getByRole("button", { name: /create project/i }))

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith("ws-1", {
        name: "Web",
        key: "web",
        icon: "Folder",
        color: "#ec4899",
      })
    )
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

  test("shows no cancel button without onCancel; calls it when provided", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <CreateProjectForm workspaceId="ws-1" onCreated={() => {}} />
    )
    expect(
      screen.queryByRole("button", { name: /cancel/i })
    ).not.toBeInTheDocument()

    const onCancel = vi.fn()
    rerender(
      <CreateProjectForm
        workspaceId="ws-1"
        onCreated={() => {}}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
