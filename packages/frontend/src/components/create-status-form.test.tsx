import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { api } from "@/lib/api"
import { CreateStatusForm } from "./create-status-form.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      createStatus: vi.fn(),
    },
  }
})

const createStatus = vi.mocked(api.createStatus)

describe("create status form", () => {
  test("offers the six status categories in roster order", () => {
    render(<CreateStatusForm projectId="pr-1" onCreated={() => {}} />)

    const select = screen.getByLabelText(/status category/i)
    expect(select).toHaveValue("Backlog")
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent)
    expect(options).toEqual([
      "Backlog",
      "Unstarted",
      "In Progress",
      "Completed",
      "Canceled",
      "Duplicate",
    ])
  })

  test("defines a status with a category", async () => {
    const user = userEvent.setup()
    createStatus.mockResolvedValue({
      id: "st-1",
      projectId: "pr-1",
      name: "In Review",
      category: "In Progress",
      position: 1,
    })
    const onCreated = vi.fn()
    render(<CreateStatusForm projectId="pr-1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText(/status name/i), "In Review")
    await user.selectOptions(
      screen.getByLabelText(/status category/i),
      "In Progress"
    )
    await user.click(screen.getByRole("button", { name: /add status/i }))

    await waitFor(() =>
      expect(createStatus).toHaveBeenCalledWith("pr-1", {
        name: "In Review",
        category: "In Progress",
      })
    )
    expect(onCreated).toHaveBeenCalled()
  })

  test("shows an error when the status is rejected", async () => {
    const user = userEvent.setup()
    createStatus.mockRejectedValue(new Error("Status name taken"))
    render(<CreateStatusForm projectId="pr-1" onCreated={() => {}} />)

    await user.type(screen.getByLabelText(/status name/i), "Backlog")
    await user.click(screen.getByRole("button", { name: /add status/i }))

    expect(await screen.findByText(/status name taken/i)).toBeInTheDocument()
  })
})
