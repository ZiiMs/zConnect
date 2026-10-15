import { render, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import type { Issue } from "@/lib/api"
import {
  type IssueRealtimeEvent,
  useIssueSubscription,
} from "./use-issue-subscription.js"

const { handlers, channelSpy, removeChannelSpy } = vi.hoisted(() => ({
  handlers: new Map<string, (payload: { new: unknown }) => void>(),
  channelSpy: vi.fn(),
  removeChannelSpy: vi.fn(),
}))

vi.mock("@/lib/supabase", () => {
  const channel = {
    on: vi.fn(
      (
        _kind: string,
        opts: { event: string },
        cb: (payload: { new: unknown }) => void
      ) => {
        handlers.set(opts.event, cb)
        return channel
      }
    ),
    subscribe: vi.fn(() => channel),
  }
  return {
    supabase: {
      channel: (...args: unknown[]) => {
        channelSpy(...args)
        return channel
      },
      removeChannel: (...args: unknown[]) => {
        removeChannelSpy(...args)
        return Promise.resolve()
      },
    },
  }
})

const issue: Issue = {
  id: "is-1",
  projectId: "pr-1",
  number: 1,
  keyPrefix: "WEB",
  identifier: "WEB-1",
  title: "Fix login",
  description: null,
  statusId: "st-1",
  priority: "High",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: [],
}

function probe(onEvent: (event: IssueRealtimeEvent) => void) {
  function Probe() {
    useIssueSubscription("pr-1", onEvent)
    return null
  }
  return render(<Probe />)
}

describe("useIssueSubscription", () => {
  test("subscribes to this project's issue inserts and updates", async () => {
    probe(() => {})

    await waitFor(() => expect(channelSpy).toHaveBeenCalled())
    expect(channelSpy).toHaveBeenCalledWith("project-issues:pr-1")
  })

  test("an insert broadcast reaches the handler as a parsed issue", async () => {
    const onEvent = vi.fn()
    probe(onEvent)
    await waitFor(() => expect(channelSpy).toHaveBeenCalled())

    handlers.get("INSERT")?.({ new: { ...issue, title: "Live insert" } })

    expect(onEvent).toHaveBeenCalledWith({
      type: "INSERT",
      issue: expect.objectContaining({
        identifier: "WEB-1",
        title: "Live insert",
      }),
    })
  })

  test("an update broadcast reaches the handler", async () => {
    const onEvent = vi.fn()
    probe(onEvent)
    await waitFor(() => expect(channelSpy).toHaveBeenCalled())

    handlers.get("UPDATE")?.({ new: { ...issue, statusId: "st-2" } })

    expect(onEvent).toHaveBeenCalledWith({
      type: "UPDATE",
      issue: expect.objectContaining({ statusId: "st-2" }),
    })
  })

  test("malformed payloads never reach the handler", async () => {
    const onEvent = vi.fn()
    probe(onEvent)
    await waitFor(() => expect(channelSpy).toHaveBeenCalled())

    handlers.get("INSERT")?.({ new: { id: 42 } })

    expect(onEvent).not.toHaveBeenCalled()
  })

  test("unmount removes the channel", async () => {
    const rendered = probe(() => {})
    await waitFor(() => expect(channelSpy).toHaveBeenCalled())

    rendered.unmount()

    await waitFor(() => expect(removeChannelSpy).toHaveBeenCalled())
  })
})
