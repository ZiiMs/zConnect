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
})
