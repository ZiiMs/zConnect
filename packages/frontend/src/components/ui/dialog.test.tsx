import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { Modal } from "./dialog.js"

describe("modal layering", () => {
  test("backdrop and sheet sit above popovers", () => {
    render(
      <Modal open={true} onOpenChange={() => {}} title="New issue">
        body
      </Modal>
    )

    const backdrop = document.querySelector(".bg-black\\/60")
    expect(backdrop?.className).toContain("z-[200]")
    expect(screen.getByRole("dialog").className).toContain("z-[201]")
  })
})
