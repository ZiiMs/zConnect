import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Label } from "@/lib/api"
import { LabelPicker } from "./label-picker.js"

const labels: Label[] = [
  { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
  { id: "lb-2", workspaceId: "ws-1", name: "feature", color: "#22c55e" },
]

describe("label picker", () => {
  test("renders every workspace label with its color", () => {
    render(<LabelPicker labels={labels} selected={[]} onChange={() => {}} />)

    expect(screen.getByRole("checkbox", { name: "bug" })).toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", { name: "feature" })
    ).toBeInTheDocument()
    expect(screen.getByTestId("label-dot-bug")).toHaveStyle({
      backgroundColor: "#ef4444",
    })
  })

  test("toggling a label notifies with the new selection", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<LabelPicker labels={labels} selected={[]} onChange={onChange} />)

    await user.click(screen.getByRole("checkbox", { name: "bug" }))

    expect(onChange).toHaveBeenCalledWith(["bug"])
  })

  test("toggling a selected label removes it", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <LabelPicker labels={labels} selected={["bug"]} onChange={onChange} />
    )

    await user.click(screen.getByRole("checkbox", { name: "bug" }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  test("checked state reflects the current selection", () => {
    render(
      <LabelPicker labels={labels} selected={["feature"]} onChange={() => {}} />
    )

    expect(screen.getByRole("checkbox", { name: "bug" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "feature" })).toBeChecked()
  })

  test("shows an empty state without registry labels", () => {
    render(<LabelPicker labels={[]} selected={[]} onChange={() => {}} />)

    expect(screen.getByText(/no labels in this workspace/i)).toBeInTheDocument()
  })

  test("renders the create input even with no labels", () => {
    render(
      <LabelPicker
        labels={[]}
        selected={[]}
        onChange={() => {}}
        onCreateLabel={vi.fn(
          async (name: string): Promise<Label> => ({
            id: "lb-new",
            workspaceId: "ws-1",
            name,
            color: "#a855f7",
          })
        )}
      />
    )

    expect(screen.getByPlaceholderText("Create label")).toBeInTheDocument()
    expect(
      screen.getByRole("textbox", { name: "Create label" })
    ).toBeInTheDocument()
  })

  test("inline create trims, calls onCreateLabel, selects the created label, and clears the input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onCreateLabel = vi.fn(
      async (name: string): Promise<Label> => ({
        id: "lb-3",
        workspaceId: "ws-1",
        name,
        color: "#a855f7",
      })
    )
    render(
      <LabelPicker
        labels={labels}
        selected={[]}
        onChange={onChange}
        onCreateLabel={onCreateLabel}
      />
    )

    const input = screen.getByRole("textbox", { name: "Create label" })
    expect(input).toHaveAttribute("placeholder", "Create label")
    await user.type(input, "  urgent  {enter}")

    expect(onCreateLabel).toHaveBeenCalledWith("urgent")
    expect(
      await screen.findByRole("checkbox", { name: "urgent" })
    ).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith(["urgent"])
    expect(input).toHaveValue("")
  })

  test("newly created label renders at the top of the list", async () => {
    const user = userEvent.setup()
    const onCreateLabel = vi.fn(
      async (name: string): Promise<Label> => ({
        id: "lb-3",
        workspaceId: "ws-1",
        name,
        color: "#a855f7",
      })
    )
    render(
      <LabelPicker
        labels={labels}
        selected={[]}
        onChange={() => {}}
        onCreateLabel={onCreateLabel}
      />
    )

    // "zebra" sorts last alphabetically, so first position proves
    // created-first ordering rather than name sorting.
    await user.type(screen.getByPlaceholderText("Create label"), "zebra{enter}")

    const created = await screen.findByRole("checkbox", { name: "zebra" })
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes[0]).toBe(created)
    expect(screen.getByTestId("label-dot-zebra")).toBeInTheDocument()
  })

  test("ignores blank create names", async () => {
    const user = userEvent.setup()
    const onCreateLabel = vi.fn(
      async (name: string): Promise<Label> => ({
        id: "lb-3",
        workspaceId: "ws-1",
        name,
        color: "#a855f7",
      })
    )
    render(
      <LabelPicker
        labels={labels}
        selected={[]}
        onChange={() => {}}
        onCreateLabel={onCreateLabel}
      />
    )

    await user.type(screen.getByPlaceholderText("Create label"), "   {enter}")

    expect(onCreateLabel).not.toHaveBeenCalled()
  })

  test("shows an inline error when creation fails", async () => {
    const user = userEvent.setup()
    const onCreateLabel = vi.fn(async (_name: string): Promise<Label> => {
      throw new Error("Name taken")
    })
    render(
      <LabelPicker
        labels={labels}
        selected={[]}
        onChange={() => {}}
        onCreateLabel={onCreateLabel}
      />
    )

    await user.type(screen.getByPlaceholderText("Create label"), "bug{enter}")

    const error = await screen.findByText("Name taken")
    expect(error).toBeInTheDocument()
    expect(error).toHaveClass("text-destructive")
  })

  test("renders children under their parent, sorted and selectable", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const grouped: Label[] = [
      { id: "p1", workspaceId: "ws-1", name: "frontend", color: "#38bdf8" },
      {
        id: "c2",
        workspaceId: "ws-1",
        name: "modal",
        color: "#a855f7",
        parentId: "p1",
      },
      {
        id: "c1",
        workspaceId: "ws-1",
        name: "button",
        color: "#22c55e",
        parentId: "p1",
      },
      { id: "p2", workspaceId: "ws-1", name: "backend", color: "#ef4444" },
    ]
    render(<LabelPicker labels={grouped} selected={[]} onChange={onChange} />)

    const parent = screen.getByRole("checkbox", { name: "frontend" })
    const button = screen.getByRole("checkbox", { name: "button" })
    const modal = screen.getByRole("checkbox", { name: "modal" })
    const backend = screen.getByRole("checkbox", { name: "backend" })

    // Grouping: children share a group container with their parent.
    const group = parent.closest("fieldset[aria-label]")
    expect(group).not.toBeNull()
    expect(group).toContainElement(button)
    expect(group).toContainElement(modal)

    // Indentation: children sit inside an indented container.
    expect(button.closest('div[class*="ml-"]')).not.toBeNull()
    expect(modal.closest('div[class*="ml-"]')).not.toBeNull()

    // Sorting: top-level by name (backend, frontend), children by name
    // (button, modal) directly beneath their parent.
    const order = screen.getAllByRole("checkbox")
    expect(order).toHaveLength(4)
    expect(order[0]).toBe(backend)
    expect(order[1]).toBe(parent)
    expect(order[2]).toBe(button)
    expect(order[3]).toBe(modal)

    expect(screen.getByTestId("label-dot-button")).toBeInTheDocument()

    await user.click(button)
    expect(onChange).toHaveBeenCalledWith(["button"])
  })
})
