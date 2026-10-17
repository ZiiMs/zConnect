import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})

// jsdom lacks layout: ProseMirror's scrollToSelection -> coordsAtPos ->
// target.getClientRects crashes on every transaction. TipTap tests type into
// the editor, so polyfill rects and scrolling with no-ops.
if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>
  const nodeProto = (w.Node as { prototype?: Record<string, unknown> })
    ?.prototype
  if (nodeProto && typeof nodeProto.getClientRects !== "function") {
    nodeProto.getClientRects = () => []
  }
  const rangeProto = (w.Range as { prototype?: Record<string, unknown> })
    ?.prototype
  if (rangeProto) {
    if (typeof rangeProto.getClientRects !== "function") {
      rangeProto.getClientRects = () => []
    }
    if (typeof rangeProto.getBoundingClientRect !== "function") {
      rangeProto.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
    }
  }
  const elProto = (w.Element as { prototype?: Record<string, unknown> })
    ?.prototype
  if (elProto && typeof elProto.scrollIntoView !== "function") {
    elProto.scrollIntoView = () => {}
  }
  const doc = w.document as unknown as Record<string, unknown> | undefined
  if (doc && typeof doc.elementFromPoint !== "function") {
    doc.elementFromPoint = () => null
  }
  if (doc && typeof doc.caretRangeFromPoint !== "function") {
    doc.caretRangeFromPoint = () => null
  }
}
