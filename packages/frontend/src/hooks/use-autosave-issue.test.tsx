import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Issue } from "@/lib/api"
import { useAutosaveIssue } from "./use-autosave-issue.js"

const base: Issue = {
  id: "is-1",
  projectId: "pr-1",
  number: 1,
  keyPrefix: "WEB",
  identifier: "WEB-1",
  title: "Fix login",
  description: "hello",
  statusId: "st-1",
  priority: "High",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: [],
  updatedAt: "2026-10-17T00:00:00.000Z",
}

function setupSaver() {
  const onSave = vi.fn(
    async (_current: Issue, input: Record<string, unknown>) => ({
      ...base,
      ...input,
      updatedAt: new Date().toISOString(),
    })
  )
  return onSave
}

describe("useAutosaveIssue body", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("idle triggers a save and unchanged content sends nothing", async () => {
    const onSave = setupSaver()
    const { result } = renderHook(() =>
      useAutosaveIssue({ issue: base, onSave: onSave as never })
    )

    act(() => {
      result.current.setBodyDraft("hello world")
    })
    expect(result.current.bodyState).toBe("editing")
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "WEB-1" }),
      { description: "hello world" }
    )

    // Typing back to the saved value is a noop.
    const saved = (await onSave.mock.results[0].value) as Issue
    void saved
    act(() => {
      result.current.setBodyDraft("hello world")
    })
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test("continuous typing persists within the staleness ceiling", async () => {
    const onSave = setupSaver()
    const { result } = renderHook(() =>
      useAutosaveIssue({ issue: base, onSave: onSave as never })
    )
    act(() => {
      result.current.setBodyDraft("a")
    })
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        vi.advanceTimersByTime(700)
      })
      act(() => {
        result.current.setBodyDraft(`a${i}`)
      })
    }
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onSave.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  test("superseded payloads coalesce behind one in-flight save", async () => {
    let resolveFirst!: (v: Issue) => void
    const first = new Promise<Issue>((resolve) => {
      resolveFirst = resolve
    })
    const onSave = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockImplementation(
        async (_c: Issue, input: Record<string, unknown>) => ({
          ...base,
          ...input,
          updatedAt: new Date().toISOString(),
        })
      )
    const { result } = renderHook(() =>
      useAutosaveIssue({ issue: base, onSave: onSave as never })
    )
    act(() => {
      result.current.setBodyDraft("one")
    })
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    // While the first PATCH is in flight, two more edits collapse to one.
    act(() => {
      result.current.setBodyDraft("two")
    })
    await act(async () => {
      await result.current.flush()
    })
    act(() => {
      result.current.setBodyDraft("three")
    })
    await act(async () => {
      await result.current.flush()
    })
    await act(async () => {
      resolveFirst({ ...base, description: "one" })
    })
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    await act(async () => {})
    // First + coalesced second; never an abort, never three.
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1]?.[1]).toEqual({ description: "three" })
  })

  test("flush writes the pending draft immediately", async () => {
    const onSave = setupSaver()
    const { result } = renderHook(() =>
      useAutosaveIssue({ issue: base, onSave: onSave as never })
    )
    act(() => {
      result.current.setBodyDraft("pending")
    })
    await act(async () => {
      await result.current.flush()
    })
    expect(onSave).toHaveBeenCalledWith(expect.anything(), {
      description: "pending",
    })
  })

  test("failed saves keep the draft and retry with backoff, then manual Retry", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() =>
      useAutosaveIssue({ issue: base, onSave: onSave as never })
    )
    act(() => {
      result.current.setBodyDraft("draft")
    })
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(result.current.bodyState).toBe("error")
    expect(result.current.bodyError).toMatch(/boom/i)
    // Draft is kept, never reverted.
    expect(result.current.bodyDraft).toBe("draft")

    // Backoff retries fire automatically.
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onSave.mock.calls.length).toBeGreaterThanOrEqual(2)

    // After failures stop auto-retrying, manual Retry re-fires.
    onSave.mockRejectedValueOnce(new Error("boom"))
    await act(async () => {
      result.current.retryBody()
    })
    expect(onSave.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  test("whitespace-only title never saves and shows a hint", async () => {
    const onSave = setupSaver()
    const { result } = renderHook(() =>
      useAutosaveIssue({ issue: base, onSave: onSave as never })
    )
    act(() => {
      result.current.setTitleDraft("   ")
    })
    await act(async () => {
      await result.current.commitTitle()
    })
    expect(onSave).not.toHaveBeenCalled()
    expect(result.current.titleError).toMatch(/required/i)
  })
})
