import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  type ActivityEvent,
  api,
  type Comment,
  type Issue,
  type Member,
  type Status,
  type TimelineItem,
} from "@/lib/api"
import { IssueActivity } from "./issue-activity.js"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listTimeline: vi.fn(),
      createComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
    },
  }
})

const listTimeline = vi.mocked(api.listTimeline)
const createComment = vi.mocked(api.createComment)
const updateComment = vi.mocked(api.updateComment)
const deleteComment = vi.mocked(api.deleteComment)

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

const members: Member[] = [
  { workspaceId: "ws-1", userId: "user-1", role: "Member", name: "Ada" },
  { workspaceId: "ws-1", userId: "user-2", role: "Member", name: "Grace" },
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

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function comment(
  overrides: Partial<Comment> & { id: string }
): Extract<TimelineItem, { kind: "comment" }> {
  return {
    kind: "comment",
    issueId: "is-1",
    authorId: "user-1",
    body: "Body",
    parentId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: minutesAgo(5),
    ...overrides,
  }
}

function activity(
  overrides: Partial<ActivityEvent> & { id: string }
): Extract<TimelineItem, { kind: "activity" }> {
  return {
    kind: "activity",
    issueId: "is-1",
    actorType: "user",
    actorId: "user-1",
    type: "issue.status_changed",
    summary: "changed status",
    payload: {},
    createdAt: minutesAgo(5),
    ...overrides,
  }
}

function seed(items: TimelineItem[], nextCursor: string | null = null) {
  listTimeline.mockResolvedValue({ items, nextCursor })
}

function renderFeed(
  overrides: Partial<Parameters<typeof IssueActivity>[0]> = {}
) {
  return render(
    <IssueActivity
      issue={baseIssue}
      statuses={statuses}
      members={members}
      currentUserId="user-1"
      canWrite={true}
      canAdmin={false}
      {...overrides}
    />
  )
}

describe("issue activity feed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seed([])
  })

  test("empty feed shows the empty state and keeps the composer", async () => {
    renderFeed()

    expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument()
    expect(screen.getByTestId("comment-composer")).toBeInTheDocument()
  })

  test("renders a comment with author and relative time, plus a status change", async () => {
    seed([
      comment({
        id: "c-1",
        authorId: "user-1",
        body: "Thanks for the fix",
        createdAt: minutesAgo(2),
      }),
      activity({
        id: "a-1",
        type: "issue.status_changed",
        summary: "changed status",
        payload: { fromStatusId: "st-1", toStatusId: "st-2" },
        createdAt: minutesAgo(180),
      }),
    ])
    renderFeed()

    const feed = await screen.findByRole("list", { name: /activity feed/i })
    const commentRow = within(feed).getByTestId("comment-c-1")
    expect(within(commentRow).getByText("Ada")).toBeInTheDocument()
    expect(within(feed).getByText("Thanks for the fix")).toBeInTheDocument()
    expect(within(feed).getByText("2m ago")).toBeInTheDocument()
    expect(within(feed).getByText("3h ago")).toBeInTheDocument()
    expect(within(feed).getByText(/changed status/i)).toBeInTheDocument()
    expect(within(feed).getByTestId("activity-a-1")).toHaveTextContent(
      /Backlog\s*→\s*Shipped/
    )
    // Oldest first: the activity event precedes the newer comment.
    const rows = feed.querySelectorAll(
      '[data-testid^="activity-"], [data-testid^="comment-"]'
    )
    expect(rows[0]).toHaveAttribute("data-testid", "activity-a-1")
    expect(rows[1]).toHaveAttribute("data-testid", "comment-c-1")
  })

  test("a description change renders the summary without the body", async () => {
    seed([
      activity({
        id: "a-desc",
        type: "issue.description_changed",
        summary: "changed the description",
        payload: { changed: true, body: "SECRET BODY" },
      }),
    ])
    renderFeed()

    expect(
      await screen.findByText(/changed the description/i)
    ).toBeInTheDocument()
    expect(screen.queryByText("SECRET BODY")).not.toBeInTheDocument()
  })

  test("posting a comment appends it without refetching the timeline", async () => {
    const user = userEvent.setup()
    const created = comment({
      id: "c-new",
      body: "Thanks!",
      createdAt: new Date().toISOString(),
    })
    createComment.mockResolvedValue(created)
    renderFeed()
    await screen.findByText(/no activity yet/i)

    const editor = screen.getByLabelText("Comment body")
    await user.click(editor)
    await user.type(editor, "Thanks!")
    await user.click(screen.getByRole("button", { name: /send/i }))

    const row = await screen.findByTestId("comment-c-new")
    expect(row).toHaveTextContent("Thanks!")
    expect(createComment).toHaveBeenCalledWith("WEB-1", {
      body: "Thanks!",
      parentId: null,
    })
    expect(listTimeline).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByText("Write a comment…")).toBeInTheDocument()
    )
  })

  test("empty submission shows validation and never calls the API", async () => {
    const user = userEvent.setup()
    renderFeed()
    await screen.findByText(/no activity yet/i)

    await user.click(screen.getByRole("button", { name: /send/i }))

    expect(
      await screen.findByText(/comment cannot be empty/i)
    ).toBeInTheDocument()
    expect(createComment).not.toHaveBeenCalled()
  })

  test("reply flow sends parentId, indents, shows the reference, and has no Reply action", async () => {
    const user = userEvent.setup()
    const parent = comment({
      id: "c-parent",
      authorId: "user-2",
      body: "Parent note",
      createdAt: minutesAgo(10),
    })
    seed([parent])
    const reply = comment({
      id: "c-reply",
      authorId: "user-1",
      parentId: "c-parent",
      body: "Reply note",
      createdAt: new Date().toISOString(),
    })
    createComment.mockResolvedValue(reply)
    renderFeed()

    const parentRow = await screen.findByTestId("comment-c-parent")
    await user.click(within(parentRow).getByRole("button", { name: /reply/i }))
    expect(screen.getByText("Replying to @Grace")).toBeInTheDocument()

    const editor = screen.getByLabelText("Comment body")
    await user.click(editor)
    await user.type(editor, "Reply note")
    await user.click(screen.getByRole("button", { name: /send/i }))

    expect(createComment).toHaveBeenCalledWith("WEB-1", {
      body: "Reply note",
      parentId: "c-parent",
    })
    const replyRow = await screen.findByTestId("comment-c-reply")
    expect(replyRow.className).toMatch(/ml-6/)
    expect(within(replyRow).getByText("Replying to @Grace")).toBeInTheDocument()
    expect(
      within(replyRow).queryByRole("button", { name: /reply/i })
    ).not.toBeInTheDocument()
  })

  test("the author edits a comment inline and the edited marker appears", async () => {
    const user = userEvent.setup()
    const original = comment({
      id: "c-1",
      authorId: "user-1",
      body: "Original body",
    })
    seed([original])
    updateComment.mockResolvedValue({
      ...original,
      body: "Updated body",
      editedAt: new Date().toISOString(),
    })
    renderFeed()

    const row = await screen.findByTestId("comment-c-1")
    await user.click(within(row).getByRole("button", { name: /^edit$/i }))
    const editor = screen.getByLabelText("Edit comment")
    expect(editor).toHaveTextContent("Original body")
    await user.click(editor)
    await user.keyboard("{Control>}a{/Control}")
    await user.type(editor, "Updated body")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() =>
      expect(updateComment).toHaveBeenCalledWith(
        "c-1",
        expect.stringContaining("Updated body")
      )
    )
    expect(await screen.findByText("Updated body")).toBeInTheDocument()
    expect(screen.getByText(/edited/i)).toBeInTheDocument()
  })

  test("non-authors never see Edit", async () => {
    seed([comment({ id: "c-1", authorId: "user-2" })])
    renderFeed({ currentUserId: "user-1" })

    const row = await screen.findByTestId("comment-c-1")
    expect(
      within(row).queryByRole("button", { name: /^edit$/i })
    ).not.toBeInTheDocument()
  })

  test("an undefined current user hides author Edit/Delete but keeps Reply", async () => {
    seed([comment({ id: "c-1", authorId: "user-1" })])
    renderFeed({ currentUserId: undefined })

    const row = await screen.findByTestId("comment-c-1")
    expect(
      within(row).queryByRole("button", { name: /^edit$/i })
    ).not.toBeInTheDocument()
    expect(
      within(row).queryByRole("button", { name: /^delete$/i })
    ).not.toBeInTheDocument()
    expect(
      within(row).getByRole("button", { name: /reply/i })
    ).toBeInTheDocument()
  })

  test("deleting a comment replaces the body with the tombstone", async () => {
    const user = userEvent.setup()
    const original = comment({
      id: "c-1",
      authorId: "user-1",
      body: "Delete me",
    })
    seed([original])
    deleteComment.mockResolvedValue({
      ...original,
      body: "",
      deletedAt: new Date().toISOString(),
    })
    renderFeed()

    const row = await screen.findByTestId("comment-c-1")
    await user.click(within(row).getByRole("button", { name: /^delete$/i }))

    expect(deleteComment).toHaveBeenCalledWith("c-1")
    expect(
      await screen.findByText("This comment was deleted.")
    ).toBeInTheDocument()
    expect(screen.queryByText("Delete me")).not.toBeInTheDocument()
  })

  test("admins can delete someone else's comment but never edit it", async () => {
    seed([comment({ id: "c-1", authorId: "user-2" })])
    renderFeed({ currentUserId: "user-1", canAdmin: true })

    const row = await screen.findByTestId("comment-c-1")
    expect(
      within(row).getByRole("button", { name: /^delete$/i })
    ).toBeInTheDocument()
    expect(
      within(row).queryByRole("button", { name: /^edit$/i })
    ).not.toBeInTheDocument()
  })

  test("viewers get no composer and no reply/edit/delete controls", async () => {
    seed([comment({ id: "c-1", authorId: "user-1" })])
    renderFeed({ canWrite: false })

    const row = await screen.findByTestId("comment-c-1")
    expect(screen.queryByTestId("comment-composer")).not.toBeInTheDocument()
    expect(
      within(row).queryByRole("button", { name: /reply/i })
    ).not.toBeInTheDocument()
    expect(
      within(row).queryByRole("button", { name: /^edit$/i })
    ).not.toBeInTheDocument()
    expect(
      within(row).queryByRole("button", { name: /^delete$/i })
    ).not.toBeInTheDocument()
  })

  test("Load earlier queries before the cursor and prepends without duplicates", async () => {
    const user = userEvent.setup()
    const newest = comment({ id: "c-3", createdAt: minutesAgo(1) })
    const middle = comment({ id: "c-2", createdAt: minutesAgo(30) })
    const oldest = comment({ id: "c-1", createdAt: minutesAgo(60) })
    listTimeline
      .mockResolvedValueOnce({ items: [newest], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({
        items: [middle, oldest, newest],
        nextCursor: null,
      })
    renderFeed()

    await screen.findByTestId("comment-c-3")
    await user.click(screen.getByRole("button", { name: /load earlier/i }))

    expect(listTimeline).toHaveBeenLastCalledWith("WEB-1", {
      before: "cursor-1",
    })
    await screen.findByTestId("comment-c-1")
    const feed = screen.getByRole("list", { name: /activity feed/i })
    const ids = [...feed.querySelectorAll('[data-testid^="comment-"]')].map(
      (row) => row.getAttribute("data-testid")
    )
    expect(ids).toEqual(["comment-c-1", "comment-c-2", "comment-c-3"])
    expect(feed.querySelectorAll('[data-testid="comment-c-3"]').length).toBe(1)
    expect(
      screen.queryByRole("button", { name: /load earlier/i })
    ).not.toBeInTheDocument()
  })

  test("GitHub events render as a badge line", async () => {
    seed([
      activity({
        id: "a-gh",
        actorType: "github",
        actorId: null,
        type: "github.issue_opened",
        summary: "opened this issue from GitHub",
        payload: { kind: "issue_opened" },
      }),
    ])
    renderFeed()

    const row = await screen.findByTestId("activity-a-gh")
    expect(row).toHaveTextContent("GitHub")
    expect(row).toHaveTextContent("opened this issue from GitHub")
  })
})
