import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Status } from "@/lib/api"
import { IssueCreateDetail } from "./issue-detail.js"

const statuses: Status[] = [
  {
    id: "st-1",
    projectId: "pr-1",
    name: "Backlog",
    category: "Backlog",
    color: "#bec2c8",
    position: 0,
  },
  {
    id: "st-2",
    projectId: "pr-1",
    name: "Shipped",
    category: "Completed",
    color: "#5e6ad2",
    position: 1,
  },
]

function setup(props: Partial<Parameters<typeof IssueCreateDetail>[0]> = {}) {
  const onCreated = vi.fn(async (input: never) => ({
    id: "is-9",
    projectId: "pr-1",
    number: 9,
    keyPrefix: "WEB",
    identifier: "WEB-9",
    title: "x",
    description: null,
    statusId: "st-1",
    priority: "Medium",
    assigneeId: null,
    dueDate: null,
    archived: false,
    labels: [],
    parentId: null,
    ...(input as object),
  }))
  const onBack = vi.fn()
  render(
    <IssueCreateDetail
      projectId="pr-1"
      statuses={statuses}
      members={[]}
      labels={[]}
      onBack={onBack}
      onCreated={onCreated as never}
      {...props}
    />
  )
  return { onCreated, onBack }
}

describe("create-mode detail", () => {
  test("no DB row until the title commits; first commit carries rail and body", async () => {
    const user = userEvent.setup()
    const { onCreated } = setup()
    expect(onCreated).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: /priority for new/i }))
    await user.click(screen.getByRole("menuitemradio", { name: "High" }))
    await user.type(screen.getByLabelText(/issue title/i), "Fresh title")
    await user.keyboard("{Enter}")

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Fresh title",
          priority: "High",
        })
      )
    )
  })

  test("whitespace-only title never creates with an inline hint", async () => {
    const user = userEvent.setup()
    const { onCreated } = setup()
    await user.type(screen.getByLabelText(/issue title/i), "   ")
    await user.keyboard("{Enter}")
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  test("leaving empty discards silently; with content asks to confirm", async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    const { onBack } = setup()
    await user.click(screen.getByRole("button", { name: /back to issues/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockClear()

    const { onBack: onBack2 } = setup()
    void onBack2
    // Second render is a new draft; type body content then back.
    // (render appends a second create detail; target the last title input.)
    const titles = screen.getAllByLabelText(/issue title/i)
    await user.type(titles[titles.length - 1], "x")
    const backs = screen.getAllByRole("button", { name: /back to issues/i })
    await user.click(backs[backs.length - 1])
    expect(confirm).toHaveBeenCalledWith("Discard this issue?")
    confirm.mockRestore()
  })

  test("subtask create prefills the parent link", async () => {
    const user = userEvent.setup()
    const { onCreated } = setup({ parentId: "is-parent" })
    await user.type(screen.getByLabelText(/issue title/i), "Child work")
    await user.keyboard("{Enter}")
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: "is-parent" })
      )
    )
  })
})
