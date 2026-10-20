import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api, type Comment, type Member } from "@/lib/api"
import {
  CommentComposer,
  findMentionQuery,
  matchMentionMembers,
} from "./comment-composer.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      createComment: vi.fn(),
    },
  }
})

const createComment = vi.mocked(api.createComment)

const members: Member[] = [
  { workspaceId: "ws-1", userId: "user-1", role: "Member", name: "Ada" },
  { workspaceId: "ws-1", userId: "user-2", role: "Member", name: "Grace" },
  {
    workspaceId: "ws-1",
    userId: "user-3",
    role: "Member",
    name: "Alan Turing",
  },
  // No display name: not mentionable.
  { workspaceId: "ws-1", userId: "user-4", role: "Member" },
]

function createdComment(body: string): Comment {
  return {
    id: "c-1",
    issueId: "is-1",
    authorId: "user-1",
    body,
    parentId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  }
}

function renderComposer(
  overrides: Partial<Parameters<typeof CommentComposer>[0]> = {}
) {
  return render(
    <CommentComposer
      issueIdentifier="WEB-1"
      parent={null}
      members={members}
      onCreated={() => {}}
      onCancelReply={() => {}}
      {...overrides}
    />
  )
}

async function typeMention(text: string) {
  renderComposer()
  const user = userEvent.setup()
  const editor = await screen.findByLabelText("Comment body")
  await user.click(editor)
  await user.type(editor, text)
  return { user, editor }
}

describe("mention query helpers", () => {
  test("detects an @ at a word boundary with an optional query", () => {
    expect(findMentionQuery("hello @", 7)).toEqual({
      query: "",
      from: 6,
      to: 7,
    })
    expect(findMentionQuery("hello @Gr", 9)).toEqual({
      query: "Gr",
      from: 6,
      to: 9,
    })
    expect(findMentionQuery("@Ada Lovelace", 13)).toEqual({
      query: "Ada Lovelace",
      from: 0,
      to: 13,
    })
  })

  test("rejects emails, trailing spaces, and closed queries", () => {
    expect(findMentionQuery("dev@example.com")).toBeNull()
    expect(findMentionQuery("hello @Ada ")).toBeNull()
    expect(findMentionQuery("hello @Ada,")).toBeNull()
  })

  test("filters by name case-insensitively and caps the list", () => {
    expect(matchMentionMembers(members, "gr").map((m) => m.name)).toEqual([
      "Grace",
    ])
    expect(matchMentionMembers(members, "AL").map((m) => m.name)).toEqual([
      "Alan Turing",
    ])
    expect(matchMentionMembers(members, "")).toHaveLength(3)
  })
})

describe("comment mention autocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createComment.mockImplementation(async (_identifier, input) =>
      createdComment(input.body)
    )
  })

  test("@ filters eligible members and shows a listbox above the composer", async () => {
    await typeMention("@Gr")

    const list = await screen.findByRole("listbox", {
      name: /mention suggestions/i,
    })
    expect(list).toHaveTextContent("Grace")
    expect(list).not.toHaveTextContent("Ada")
  })

  test("keyboard selection inserts a mention token that submits", async () => {
    const { user } = await typeMention("@")

    expect(
      await screen.findByRole("option", { name: "Ada" })
    ).toBeInTheDocument()
    await user.keyboard("{ArrowDown}")
    expect(screen.getByRole("option", { name: "Grace" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await user.keyboard("{Enter}")

    await waitFor(() =>
      expect(screen.getByTestId("comment-editor")).toHaveTextContent("@Grace")
    )
    await user.click(screen.getByRole("button", { name: /send/i }))

    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith("WEB-1", {
        body: "[@Grace](mention:user-2)",
        parentId: null,
      })
    )
  })

  test("clicking an option inserts the mention", async () => {
    const { user, editor } = await typeMention("@Ala")

    await user.click(await screen.findByRole("option", { name: "Alan Turing" }))

    await waitFor(() =>
      expect(screen.getByTestId("comment-editor")).toHaveTextContent(
        "@Alan Turing"
      )
    )
    await user.type(editor, "hi")
    expect(screen.getByTestId("comment-editor")).toHaveTextContent(
      "@Alan Turing hi"
    )
  })

  test("Escape closes the list without inserting", async () => {
    const { user } = await typeMention("@Gr")
    expect(
      await screen.findByRole("option", { name: "Grace" })
    ).toBeInTheDocument()

    await user.keyboard("{Escape}")

    expect(
      screen.queryByRole("listbox", { name: /mention suggestions/i })
    ).not.toBeInTheDocument()
  })

  test("no matching members closes the list", async () => {
    await typeMention("@zzz")

    expect(
      screen.queryByRole("listbox", { name: /mention suggestions/i })
    ).not.toBeInTheDocument()
  })

  test("works without members (no autocomplete)", async () => {
    renderComposer({ members: [] })
    const user = userEvent.setup()
    const editor = await screen.findByLabelText("Comment body")
    await user.click(editor)
    await user.type(editor, "@Gr")

    expect(
      screen.queryByRole("listbox", { name: /mention suggestions/i })
    ).not.toBeInTheDocument()
  })

  test("empty validation still blocks submission", async () => {
    renderComposer()
    const user = userEvent.setup()
    await screen.findByLabelText("Comment body")

    await user.click(screen.getByRole("button", { name: /send/i }))

    expect(
      await screen.findByText(/comment cannot be empty/i)
    ).toBeInTheDocument()
    expect(createComment).not.toHaveBeenCalled()
  })
})
