import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import type { Issue, Status } from "@/lib/api"
import { IssueDetail } from "./issue-detail.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      listStatuses: vi.fn(),
      listIssues: vi.fn(),
      listMembers: vi.fn(),
      listLabels: vi.fn(),
      listSubtasks: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      deleteIssue: vi.fn(),
    },
  }
})

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

const baseIssue: Issue = {
  id: "is-1",
  projectId: "pr-1",
  number: 1,
  keyPrefix: "WEB",
  identifier: "WEB-1",
  title: "Fix login",
  description: "Reset the session token.",
  statusId: "st-1",
  priority: "High",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: [],
}

function renderPersisted(
  overrides: Partial<Parameters<typeof IssueDetail>[0]> = {}
) {
  const callbacks = {
    onBack: vi.fn(),
    onStatusChange: vi.fn(),
    onUpdate: vi.fn(),
    onArchivedChanged: vi.fn(),
    onDeleted: vi.fn(),
    onCreateSubtask: vi.fn(async (_p: unknown, input: unknown) => ({
      ...baseIssue,
      id: "is-9",
      identifier: "WEB-9",
      ...(input as object),
    })),
  }
  render(
    <IssueDetail
      issue={baseIssue}
      statuses={statuses}
      members={[]}
      labels={[
        { id: "lb-1", workspaceId: "ws-1", name: "bug", color: "#ef4444" },
      ]}
      subtasks={[]}
      canEdit={true}
      canAdmin={false}
      onBack={callbacks.onBack}
      onStatusChange={callbacks.onStatusChange}
      onUpdate={callbacks.onUpdate}
      onArchivedChanged={callbacks.onArchivedChanged}
      onDeleted={callbacks.onDeleted}
      onCreateSubtask={callbacks.onCreateSubtask as never}
      {...overrides}
    />
  )
  return callbacks
}

describe("inline title + rail editing", () => {
  test("title commits on Enter and cancels on Esc", async () => {
    const user = userEvent.setup()
    const callbacks = renderPersisted()
    await user.click(
      screen.getByRole("button", { name: /edit title for WEB-1/i })
    )
    const input = screen.getByLabelText(/title for WEB-1/i)
    await user.clear(input)
    await user.type(input, "New title")
    await user.keyboard("{Enter}")
    await waitFor(() =>
      expect(callbacks.onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: "WEB-1" }),
        expect.objectContaining({ title: "New title" })
      )
    )

    await user.click(
      screen.getByRole("button", { name: /edit title for WEB-1/i })
    )
    const input2 = screen.getByLabelText(/title for WEB-1/i)
    await user.clear(input2)
    await user.type(input2, "discarded")
    await user.keyboard("{Escape}")
    expect(
      screen.getByRole("button", { name: /edit title for WEB-1/i })
    ).toHaveTextContent("New title")
  })

  test("labels edit from the rail", async () => {
    const user = userEvent.setup()
    const callbacks = renderPersisted()
    await user.click(screen.getByRole("button", { name: /labels for WEB-1/i }))
    await user.click(screen.getByRole("checkbox", { name: "bug" }))
    await waitFor(() =>
      expect(callbacks.onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: "WEB-1" }),
        expect.objectContaining({ labels: ["bug"] })
      )
    )
  })

  test("viewers without write access see a read-only view", () => {
    renderPersisted({ canEdit: false })
    expect(
      screen.queryByRole("button", { name: /edit title for WEB-1/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /edit description for WEB-1/i })
    ).not.toBeInTheDocument()
  })
})

describe("body editor", () => {
  test("slash menu opens on / with block types and no toolbar", async () => {
    const user = userEvent.setup()
    renderPersisted()
    // Doc is always mounted: no edit-button gate, clicking types directly.
    expect(
      screen.queryByRole("button", { name: /edit description for WEB-1/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("toolbar", { name: /formatting for WEB-1/i })
    ).not.toBeInTheDocument()

    const editor = screen.getByLabelText(/description for WEB-1/i)
    expect(editor.className).not.toMatch(/border/)
    await user.click(editor)
    await user.type(editor, "/")
    const menu = await screen.findByRole("listbox", {
      name: /slash commands/i,
    })
    for (const name of [
      "Heading 1",
      "Heading 2",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Quote",
      "Code block",
    ]) {
      expect(
        within(menu).getByRole("option", { name: new RegExp(name, "i") })
      ).toBeInTheDocument()
    }
    // Sections split by lines: Text / Lists / Quote & code / Link.
    expect(within(menu).getAllByRole("separator").length).toBe(3)
  })

  test("slash filters and Enter applies the block", async () => {
    const user = userEvent.setup()
    renderPersisted()
    const editor = screen.getByLabelText(/description for WEB-1/i)
    await user.click(editor)
    // Type one char at a time: ProseMirror reads jsdom DOM mutations
    // asynchronously, so a whole-string type drops keystrokes there.
    for (const ch of "/head") {
      await user.type(editor, ch)
    }
    const menu = await screen.findByRole("listbox", {
      name: /slash commands/i,
    })
    expect(
      within(menu).getByRole("option", { name: /heading 2/i })
    ).toBeInTheDocument()
    expect(
      within(menu).queryByRole("option", { name: /quote/i })
    ).not.toBeInTheDocument()
    await user.keyboard("{Enter}")
    expect(
      screen.queryByRole("listbox", { name: /slash commands/i })
    ).not.toBeInTheDocument()
    // The block applies immediately: the whole row is a heading.
    const heading = editor.querySelector("h1")
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toContain("Reset the session token.")
  })

  test("slash bullet list applies immediately on click", async () => {
    const user = userEvent.setup()
    renderPersisted()
    const editor = screen.getByLabelText(/description for WEB-1/i)
    await user.click(editor)
    await user.type(editor, "/")
    const menu = await screen.findByRole("listbox", {
      name: /slash commands/i,
    })
    await user.click(within(menu).getByRole("option", { name: /bullet list/i }))
    expect(
      screen.queryByRole("listbox", { name: /slash commands/i })
    ).not.toBeInTheDocument()
    const list = editor.querySelector("ul")
    expect(list).not.toBeNull()
    expect(list?.textContent).toContain("Reset the session token.")
  })

  test("code blocks highlight and offer a hover combo block", async () => {
    const user = userEvent.setup()
    renderPersisted({
      issue: {
        ...baseIssue,
        description: "```ts\nconst x: number = 1\n```",
      },
    })
    const editor = screen.getByLabelText(/description for WEB-1/i)
    await user.click(editor)
    // Lowlight highlights the fence contents…
    expect(editor.querySelector(".hljs-keyword")).not.toBeNull()
    // …line numbers gutter each source line…
    expect(editor.querySelectorAll(".code-line-number").length).toBe(1)
    // …and hovering the fence reveals the combo block: language, settings,
    // copy. The picker reads the hovered block, not the cursor.
    const code = editor.querySelector("code")
    expect(code).not.toBeNull()
    await user.hover(code as HTMLElement)
    const language = await screen.findByLabelText(/code block language/i)
    expect(language).toHaveValue("ts")
    await user.selectOptions(language, "python")
    expect(language).toHaveValue("python")
  })

  test("code block settings toggle wrap and line numbers", async () => {
    const user = userEvent.setup()
    renderPersisted({
      issue: {
        ...baseIssue,
        description: "```ts\nconst x = 1\n```",
      },
    })
    const editor = screen.getByLabelText(/description for WEB-1/i)
    await user.click(editor)
    const code = editor.querySelector("code")
    expect(code).not.toBeNull()
    await user.hover(code as HTMLElement)
    // fireEvent: user.click's simulated mouseout carries no relatedTarget in
    // jsdom and would drop the hover before the click lands.
    fireEvent.click(
      await screen.findByRole("button", { name: /code block settings/i })
    )
    const wrap = screen.getByRole("checkbox", { name: /wrap lines/i })
    const numbers = screen.getByRole("checkbox", { name: /line numbers/i })
    expect(wrap).not.toBeChecked()
    expect(numbers).toBeChecked()
    fireEvent.click(wrap)
    fireEvent.click(numbers)
    expect(wrap).toBeChecked()
    expect(numbers).not.toBeChecked()
  })

  test("code block copy writes the fence text", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    // Define only `clipboard`: replacing the whole navigator (stubGlobal)
    // drops platform/userAgent and crashes editor creation for every test
    // after this one.
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })
    renderPersisted({
      issue: {
        ...baseIssue,
        description: "```ts\nconst x = 1\n```",
      },
    })
    try {
      const editor = screen.getByLabelText(/description for WEB-1/i)
      await user.click(editor)
      const code = editor.querySelector("code")
      expect(code).not.toBeNull()
      await user.hover(code as HTMLElement)
      // fireEvent: user.click's simulated mouseout carries no relatedTarget
      // in jsdom and would drop the hover before the click lands.
      fireEvent.click(await screen.findByRole("button", { name: /copy code/i }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith("const x = 1"))
    } finally {
      delete (window.navigator as unknown as Record<string, unknown>).clipboard
    }
  })

  test("markdown body renders formatted in read mode", () => {
    renderPersisted({
      canEdit: false,
      issue: { ...baseIssue, description: "**bold** and `code`" },
    })
    expect(screen.getByText("bold")).toBeInTheDocument()
  })
})

describe("conflict banner", () => {
  test("remote-edit-while-typing shows Load latest / Keep editing", async () => {
    const user = userEvent.setup()
    const onKeepEditing = vi.fn()
    const onLoadLatest = vi.fn()
    renderPersisted({
      conflictRemote: { ...baseIssue, title: "Remote title" },
      onKeepEditing,
      onLoadLatest,
    })
    const banner = screen.getByTestId("conflict-banner-WEB-1")
    expect(
      within(banner).getByRole("button", { name: /load latest/i })
    ).toBeInTheDocument()
    await user.click(
      within(banner).getByRole("button", { name: /keep editing/i })
    )
    expect(onKeepEditing).toHaveBeenCalledTimes(1)
    await user.click(
      within(banner).getByRole("button", { name: /load latest/i })
    )
    expect(onLoadLatest).toHaveBeenCalledTimes(1)
  })
})

describe("subtask footer + modal", () => {
  const child: Issue = {
    ...baseIssue,
    id: "is-2",
    number: 2,
    identifier: "WEB-2",
    title: "Split it",
    parentId: "is-1",
  }

  test("rows open a compact modal with full editing", async () => {
    const user = userEvent.setup()
    renderPersisted({ subtasks: [child] })
    await user.click(screen.getByTestId("subtask-WEB-2"))
    expect(
      await screen.findByTestId("issue-detail-compact-WEB-2")
    ).toBeInTheDocument()
  })

  test("header counts dones and collapses the rows", async () => {
    const user = userEvent.setup()
    renderPersisted({ subtasks: [child] })
    expect(screen.getByText("0/1")).toBeInTheDocument()
    expect(screen.getByTestId("subtask-WEB-2")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /collapse subtasks/i }))
    expect(screen.queryByTestId("subtask-WEB-2")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /expand subtasks/i }))
    expect(screen.getByTestId("subtask-WEB-2")).toBeInTheDocument()
  })

  test("inline composer creates with the parent prefilled", async () => {
    const user = userEvent.setup()
    const callbacks = renderPersisted({ subtasks: [child] })
    await user.click(screen.getByRole("button", { name: /create sub-issue/i }))
    expect(screen.getByTestId("subtask-composer")).toBeInTheDocument()
    // All properties sit along the bottom bar.
    expect(
      screen.getByRole("button", { name: /subtask status/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /subtask priority/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /subtask assignee/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /subtask labels/i })
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText(/subtask title/i), "Child work")
    await user.click(screen.getByRole("button", { name: /^create$/i }))
    await waitFor(() =>
      expect(callbacks.onCreateSubtask).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: "WEB-1" }),
        expect.objectContaining({ parentId: "is-1", title: "Child work" })
      )
    )
    expect(screen.queryByTestId("subtask-composer")).not.toBeInTheDocument()
  })

  test("inline composer blocks whitespace titles and cancels clean", async () => {
    const user = userEvent.setup()
    const callbacks = renderPersisted({ subtasks: [child] })
    await user.click(screen.getByRole("button", { name: /create sub-issue/i }))
    await user.type(screen.getByLabelText(/subtask title/i), "   ")
    await user.click(screen.getByRole("button", { name: /^create$/i }))
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(callbacks.onCreateSubtask).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /^cancel$/i }))
    expect(screen.queryByTestId("subtask-composer")).not.toBeInTheDocument()
  })

  test("a subtask shows no create button of its own", () => {
    cleanup()
    renderPersisted({ issue: child })
    expect(
      screen.queryByRole("button", { name: /create sub-issue/i })
    ).not.toBeInTheDocument()
  })
})
