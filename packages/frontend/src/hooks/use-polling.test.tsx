import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "./use-polling.js"

function fireVisibilityChange() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test("polls the default 30 s cadence", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(30_000)
    const callback = vi.fn()
    renderHook(() => usePolling(callback))

    act(() => {
      vi.advanceTimersByTime(29_999)
    })
    expect(callback).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(callback).toHaveBeenCalledTimes(2)
  })

  test("honors a custom interval", () => {
    const callback = vi.fn()
    renderHook(() => usePolling(callback, { intervalMs: 5_000 }))

    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("fires when the window regains focus", () => {
    const callback = vi.fn()
    renderHook(() => usePolling(callback))

    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("fires on visibilitychange while the document is visible", () => {
    const callback = vi.fn()
    renderHook(() => usePolling(callback))

    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("stays quiet while the document is hidden", () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    const callback = vi.fn()
    renderHook(() => usePolling(callback, { intervalMs: 1_000 }))

    fireVisibilityChange()
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(callback).not.toHaveBeenCalled()

    // Coming back to the tab polls once, immediately.
    visibility.mockReturnValue("visible")
    fireVisibilityChange()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("uses the latest callback without re-subscribing", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ callback }: { callback: () => void }) => usePolling(callback),
      { initialProps: { callback: first } }
    )

    rerender({ callback: second })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test("does nothing while disabled and starts when enabled", () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePolling(callback, { enabled }),
      { initialProps: { enabled: false } }
    )

    act(() => {
      vi.advanceTimersByTime(60_000)
      window.dispatchEvent(new Event("focus"))
    })
    expect(callback).not.toHaveBeenCalled()

    rerender({ enabled: true })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("unmount stops the timer and the listeners", () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() =>
      usePolling(callback, { intervalMs: 1_000 })
    )

    unmount()
    act(() => {
      vi.advanceTimersByTime(10_000)
      window.dispatchEvent(new Event("focus"))
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(callback).not.toHaveBeenCalled()
  })
})
