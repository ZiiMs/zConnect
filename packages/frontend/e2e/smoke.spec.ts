import { expect, test } from "@playwright/test"

/**
 * Signed-out smoke: no backend, no session. The Vite server serves the
 * shell; better-auth has no session, so App renders SignedOut.
 */
test("signed-out landing shows auth form", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "zConnect", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sign in to zConnect" })
  ).toBeVisible()
  await expect(page.getByPlaceholder("Email")).toBeVisible()
})

test("invite link prompts sign-in first", async ({ page }) => {
  await page.goto("/invite/some-invitation-id")
  await expect(
    page.getByRole("heading", { name: "Sign in to accept your invitation" })
  ).toBeVisible()
})
