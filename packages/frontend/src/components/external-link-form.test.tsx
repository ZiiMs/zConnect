import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import { ExternalLinkForm } from "./external-link-form.js"

describe("external link form", () => {
  test("pasting a URL adds the link and clears the field", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn().mockResolvedValue({
      id: "link-1",
      url: "https://github.com/acme/web/pull/7",
    })
    render(<ExternalLinkForm onAdd={onAdd} onClose={vi.fn()} />)

    await user.type(
      screen.getByLabelText(/paste.*url/i),
      "https://github.com/acme/web/pull/7"
    )
    await user.keyboard("{Enter}")

    expect(onAdd).toHaveBeenCalledWith("https://github.com/acme/web/pull/7")
    expect(screen.getByLabelText(/paste.*url/i)).toHaveValue("")
  })

  test("shows the error when adding fails", async () => {
    const user = userEvent.setup()
    render(
      <ExternalLinkForm
        onAdd={() => Promise.reject(new Error("Nope"))}
        onClose={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText(/paste.*url/i), "https://x.example/y")
    await user.keyboard("{Enter}")

    expect(await screen.findByText("Nope")).toBeInTheDocument()
  })
})
