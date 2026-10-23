import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Label } from "@/lib/api"
import { LabelsSettings } from "./labels-settings.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      listLabels: vi.fn(),
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
    },
  }
})

const listLabels = vi.mocked(api.listLabels)
const createLabel = vi.mocked(api.createLabel)
const updateLabel = vi.mocked(api.updateLabel)
const deleteLabel = vi.mocked(api.deleteLabel)

function label(overrides: Partial<Label> = {}): Label {
  return {
    id: "lb-1",
    workspaceId: "ws-1",
    name: "bug",
    color: "#ef4444",
    ...overrides,
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString()
}

function createdText(): string {
  return new Date("2026-09-19T12:00:00.000Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listLabels.mockResolvedValue([])
  deleteLabel.mockResolvedValue(undefined)
})

describe("labels settings", () => {
  test("renders grouped parent/child rows with counts and relative dates", async () => {
    listLabels.mockResolvedValue([
      label({
        id: "p1",
        name: "zeta",
        color: "#111111",
        description: "Parent group",
        issueCount: 3,
        lastAppliedAt: daysAgo(2),
        createdAt: "2026-09-19T12:00:00.000Z",
      }),
      label({
        id: "c1",
        name: "alpha-child",
        color: "#222222",
        parentId: "p1",
        description: "Kid",
        issueCount: 1,
        lastAppliedAt: daysAgo(9),
        createdAt: "2026-09-19T12:00:00.000Z",
      }),
      label({
        id: "t1",
        name: "apple",
        color: "#333333",
        description: null,
        issueCount: 0,
        lastAppliedAt: null,
      }),
    ])
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    for (const header of [
      "Name",
      "Description",
      "Issues",
      "Last applied",
      "Created",
    ]) {
      expect(
        await screen.findByRole("columnheader", { name: header })
      ).toBeInTheDocument()
    }

    const parentRow = await screen.findByRole("row", { name: /zeta/ })
    const childRow = screen.getByRole("row", { name: /alpha-child/ })
    const soloRow = screen.getByRole("row", { name: /apple/ })

    // Top-level labels sort by name: apple before zeta.
    const rows = screen.getAllByRole("row").map((row) => row.textContent)
    expect(rows.findIndex((text) => text?.includes("apple"))).toBeLessThan(
      rows.findIndex((text) => text?.includes("zeta"))
    )

    // Parent is a group header with a disclosure button.
    expect(
      within(parentRow).getByRole("button", { name: "Toggle zeta" })
    ).toHaveAttribute("aria-expanded", "true")

    expect(within(parentRow).getByText("Parent group")).toBeInTheDocument()
    expect(within(parentRow).getByText("3")).toBeInTheDocument()
    expect(within(parentRow).getByText("2d ago")).toBeInTheDocument()
    expect(within(childRow).getByText("1w ago")).toBeInTheDocument()
    expect(within(childRow).getByText("1")).toBeInTheDocument()
    expect(within(soloRow).getByText("0")).toBeInTheDocument()
    // Null description and null last-applied render an em dash.
    expect(within(soloRow).getAllByText("—").length).toBeGreaterThan(0)
    // Created dates render like "Sep 19".
    expect(within(parentRow).getByText(createdText())).toBeInTheDocument()
    // Colored dots carry the label color.
    expect(parentRow.querySelector('span[aria-hidden="true"]')).toHaveStyle({
      backgroundColor: "#111111",
    })
  })

  test("disclosure button hides and shows children", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({ id: "p1", name: "zeta", color: "#111111" }),
      label({
        id: "c1",
        name: "alpha-child",
        color: "#222222",
        parentId: "p1",
      }),
    ])
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    const toggle = await screen.findByRole("button", { name: "Toggle zeta" })
    expect(screen.getByText("alpha-child")).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("alpha-child")).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("alpha-child")).toBeInTheDocument()
  })

  test("creates a top-level label and shows the new row first", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({ id: "old", name: "banana", color: "#22c55e" }),
    ])
    createLabel.mockImplementation(async (_workspaceId, input) =>
      label({ id: "new-1", name: input.name, color: "#5e6ad2" })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("banana")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /new label/i }))

    const input = screen.getByLabelText("New label name")
    expect(input).toHaveAttribute("placeholder", "Label name")
    // The inline row carries exactly one text input.
    const newRow = input.closest("tr")
    expect(newRow).not.toBeNull()
    expect(within(newRow as HTMLElement).getAllByRole("textbox")).toHaveLength(
      1
    )

    await user.type(input, "cherry")
    await user.click(screen.getByRole("button", { name: /add label/i }))

    await waitFor(() =>
      expect(createLabel).toHaveBeenCalledWith("ws-1", { name: "cherry" })
    )
    await waitFor(() =>
      expect(screen.queryByLabelText("New label name")).not.toBeInTheDocument()
    )

    const rows = screen.getAllByRole("row")
    // Header row first, then the just-created label on top.
    expect(rows[1].textContent).toContain("cherry")
  })

  test("header shows Labels with New group and New label actions", async () => {
    listLabels.mockResolvedValue([])
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(
      await screen.findByRole("heading", { name: "Labels" })
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Groups and labels for this workspace.")
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /new group/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /new label/i })
    ).toBeInTheDocument()
  })

  test("new group creates the label and opens its child row", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({ id: "old", name: "banana", color: "#22c55e" }),
    ])
    createLabel.mockImplementation(async (_workspaceId, input) =>
      label({ id: "new-1", name: input.name, color: "#5e6ad2" })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("banana")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /new group/i }))

    const input = screen.getByLabelText("New group name")
    await user.type(input, "platform")
    await user.click(screen.getByRole("button", { name: /add group/i }))

    await waitFor(() =>
      expect(createLabel).toHaveBeenCalledWith("ws-1", { name: "platform" })
    )
    // The group's child row opens so labels can be added into it.
    expect(await screen.findByLabelText("Child label name")).toBeInTheDocument()
  })

  test("escape closes the new label row without creating", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([label()])
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("bug")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /new label/i }))

    const input = screen.getByLabelText("New label name")
    await user.type(input, "nope{Escape}")

    expect(screen.queryByLabelText("New label name")).not.toBeInTheDocument()
    expect(createLabel).not.toHaveBeenCalled()
  })

  test("adds a child label with the parent id", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({ id: "p1", name: "zeta", color: "#111111" }),
    ])
    createLabel.mockImplementation(async (_workspaceId, input) =>
      label({
        id: "c-new",
        name: input.name,
        color: "#5e6ad2",
        parentId: input.parentId ?? null,
      })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("zeta")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Actions for zeta" }))
    await user.click(screen.getByRole("menuitem", { name: /add child label/i }))

    const input = screen.getByLabelText("Child label name")
    await user.type(input, "ui")
    await user.click(screen.getByRole("button", { name: /add child/i }))

    await waitFor(() =>
      expect(createLabel).toHaveBeenCalledWith("ws-1", {
        name: "ui",
        parentId: "p1",
      })
    )
    expect(await screen.findByText("ui")).toBeInTheDocument()
  })

  test("clicking the name renames inline with only the name patched", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({
        id: "t1",
        name: "apple",
        color: "#333333",
        description: "Old",
      }),
    ])
    updateLabel.mockImplementation(async (_workspaceId, _labelId, input) =>
      label({
        id: "t1",
        name: input.name ?? "apple",
        color: input.color ?? "#333333",
        description:
          "description" in input ? (input.description ?? null) : "Old",
      })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("apple")).toBeInTheDocument()
    // No separate Edit button: the name itself is the rename control.
    expect(
      screen.queryByRole("menuitem", { name: /^edit$/i })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Rename apple" }))

    const nameInput = screen.getByLabelText("Label name")
    await user.clear(nameInput)
    await user.type(nameInput, "apricot{Enter}")

    await waitFor(() =>
      expect(updateLabel).toHaveBeenCalledWith("ws-1", "t1", {
        name: "apricot",
      })
    )
    expect(await screen.findByText("apricot")).toBeInTheDocument()
    // Description is untouched by a rename.
    expect(screen.getByText("Old")).toBeInTheDocument()
  })

  test("clicking the description edits it inline", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({
        id: "t1",
        name: "apple",
        color: "#333333",
        description: "Old",
      }),
    ])
    updateLabel.mockImplementation(async (_workspaceId, _labelId, input) =>
      label({
        id: "t1",
        name: "apple",
        color: "#333333",
        description: input.description ?? null,
      })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("Old")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Edit description for apple" })
    )

    const descriptionInput = screen.getByLabelText("Label description")
    await user.clear(descriptionInput)
    await user.type(descriptionInput, "Fresh{Enter}")

    await waitFor(() =>
      expect(updateLabel).toHaveBeenCalledWith("ws-1", "t1", {
        description: "Fresh",
      })
    )
    expect(await screen.findByText("Fresh")).toBeInTheDocument()
  })

  test("menu Rename opens the inline name input", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({
        id: "t1",
        name: "apple",
        color: "#333333",
        description: "Old",
      }),
    ])
    updateLabel.mockImplementation(async (_workspaceId, _labelId, input) =>
      label({
        id: "t1",
        name: input.name ?? "apple",
        color: "#333333",
        description: "Old",
      })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("apple")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Actions for apple" }))
    await user.click(screen.getByRole("menuitem", { name: /^rename$/i }))

    const nameInput = screen.getByLabelText("Label name")
    expect(nameInput).toHaveValue("apple")
    await user.clear(nameInput)
    await user.type(nameInput, "apricot{Enter}")

    await waitFor(() =>
      expect(updateLabel).toHaveBeenCalledWith("ws-1", "t1", {
        name: "apricot",
      })
    )
    expect(await screen.findByText("apricot")).toBeInTheDocument()
  })

  test("clicking the color dot edits the color inline", async () => {
    const user = userEvent.setup()
    listLabels.mockResolvedValue([
      label({
        id: "t1",
        name: "apple",
        color: "#333333",
        description: "Old",
      }),
    ])
    updateLabel.mockImplementation(async (_workspaceId, _labelId, input) =>
      label({
        id: "t1",
        name: "apple",
        color: input.color ?? "#333333",
        description: "Old",
      })
    )
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("apple")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Change color for apple" })
    )

    const colorInput = screen.getByLabelText("Label color for apple")
    fireEvent.change(colorInput, { target: { value: "#123456" } })
    fireEvent.blur(colorInput)

    await waitFor(() =>
      expect(updateLabel).toHaveBeenCalledWith("ws-1", "t1", {
        color: "#123456",
      })
    )
  })

  test("deletes a label and refreshes so children are promoted", async () => {
    const user = userEvent.setup()
    const child = label({
      id: "c1",
      name: "alpha-child",
      color: "#222222",
      parentId: "p1",
    })
    listLabels
      .mockResolvedValueOnce([
        label({ id: "p1", name: "zeta", color: "#111111" }),
        child,
      ])
      .mockResolvedValue([{ ...child, parentId: null }])
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)

    expect(await screen.findByText("zeta")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Actions for zeta" }))
    await user.click(screen.getByRole("menuitem", { name: /^delete$/i }))

    await waitFor(() => expect(deleteLabel).toHaveBeenCalledWith("ws-1", "p1"))
    await waitFor(() =>
      expect(screen.queryByText("zeta")).not.toBeInTheDocument()
    )
    // The server promotes children: the refresh keeps the child visible.
    expect(screen.getByText("alpha-child")).toBeInTheDocument()
  })

  test("canEdit=false hides the new label button and row actions", async () => {
    listLabels.mockResolvedValue([label({ id: "t1", name: "apple" })])
    render(<LabelsSettings workspaceId="ws-1" canEdit={false} />)

    expect(await screen.findByText("apple")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /new label/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /actions for/i })
    ).not.toBeInTheDocument()
  })

  test("shows loading, empty, and error states", async () => {
    // Loading first.
    let resolveList!: (value: Label[]) => void
    listLabels.mockReturnValueOnce(
      new Promise<Label[]>((resolve) => {
        resolveList = resolve
      })
    )
    const { unmount } = render(
      <LabelsSettings workspaceId="ws-1" canEdit={true} />
    )
    expect(screen.getByText(/loading labels/i)).toBeInTheDocument()
    resolveList([])
    expect(await screen.findByText(/no labels/i)).toBeInTheDocument()
    unmount()

    // Empty registry.
    listLabels.mockResolvedValueOnce([])
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)
    expect(await screen.findByText(/no labels/i)).toBeInTheDocument()

    // Failed load.
    listLabels.mockRejectedValueOnce(new Error("Forbidden"))
    render(<LabelsSettings workspaceId="ws-1" canEdit={true} />)
    expect(await screen.findByText(/forbidden/i)).toBeInTheDocument()
  })
})
