import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { api } from "@/lib/api"
import { NotificationSettings } from "./notification-settings.js"

vi.mock("@/lib/api", () => ({
  api: {
    getNotificationSettings: vi.fn(),
    updateNotificationSettings: vi.fn(),
  },
}))

const getNotificationSettings = vi.mocked(api.getNotificationSettings)
const updateNotificationSettings = vi.mocked(api.updateNotificationSettings)

beforeEach(() => {
  vi.clearAllMocks()
  getNotificationSettings.mockResolvedValue({ emailMode: "digest" })
})

describe("notification settings", () => {
  test("loads the saved digest mode", async () => {
    render(<NotificationSettings />)

    expect(await screen.findByRole("radio", { name: /digest/i })).toBeChecked()
    expect(screen.getByRole("radio", { name: /immediate/i })).not.toBeChecked()
    expect(screen.getByRole("radio", { name: /off/i })).not.toBeChecked()
  })

  test("saves the selected immediate mode", async () => {
    const user = userEvent.setup()
    updateNotificationSettings.mockResolvedValue({ emailMode: "immediate" })
    render(<NotificationSettings />)

    await screen.findByRole("radio", { name: /digest/i })
    await user.click(screen.getByRole("radio", { name: /immediate/i }))
    await user.click(screen.getByRole("button", { name: /save settings/i }))

    expect(updateNotificationSettings).toHaveBeenCalledWith("immediate")
    expect(await screen.findByText("Saved")).toBeInTheDocument()
  })

  test("shows the error when saving fails", async () => {
    const user = userEvent.setup()
    updateNotificationSettings.mockRejectedValueOnce(new Error("Network down"))
    render(<NotificationSettings />)

    await screen.findByRole("radio", { name: /digest/i })
    await user.click(screen.getByRole("radio", { name: /off/i }))
    await user.click(screen.getByRole("button", { name: /save settings/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down")
    expect(screen.queryByText("Saved")).not.toBeInTheDocument()
  })
})
