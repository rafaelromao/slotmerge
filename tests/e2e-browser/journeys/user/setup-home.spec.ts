import { test, expect } from "@playwright/test";
import {
  getLastMagicLinkUrlForRecipient,
  resetCapturedEmails,
} from "../../../helpers/playwright/mock-email-outbox";

const TEST_USER_EMAIL = "user@example.com";

test.beforeEach(() => {
  resetCapturedEmails();
});

test.describe("Setup Home Journey", () => {
  test("signed-out user completes setup checklist", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Please sign in to continue.")).toBeVisible();

    const magicLinkRequest = await fetch("http://localhost:3000/auth/magic-link/request", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `email=${encodeURIComponent(TEST_USER_EMAIL)}`,
    });

    expect(magicLinkRequest.ok).toBeTruthy();

    const magicLinkUrl = await page.evaluate(
      (email) => {
        return getLastMagicLinkUrlForRecipient(email);
      },
      TEST_USER_EMAIL,
    );

    expect(magicLinkUrl).not.toBeNull();
    expect(magicLinkUrl).toContain("/auth/magic-link/verify?token=");

    await page.goto(magicLinkUrl!);

    await page.waitForURL("http://localhost:3000/");

    await expect(page.getByText("Welcome to SlotMerge")).toBeVisible();

    const cards = page.locator(".setup-card");
    await expect(cards).toHaveCount(5);

    await expect(page.getByText("Profile")).toBeVisible();
    await expect(page.getByText("Discoverability")).toBeVisible();
    await expect(page.getByText("Topics")).toBeVisible();
    await expect(page.getByText("Availability")).toBeVisible();
    await expect(page.getByText("Calendar Connection")).toBeVisible();

    await expect(page.getByTestId("setup-chip")).toBeVisible();

    await page.getByTestId("avatar-dropdown-trigger").click();

    await expect(page.getByRole("menuitem", { name: "My Profile" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeVisible();

    const searchLink = page.locator(".nav-link", { hasText: "Search" });
    await expect(searchLink).toHaveCount(0);

    const adminLink = page.locator(".nav-link", { hasText: "Admin" });
    await expect(adminLink).toHaveCount(0);

    const homeLink = page.locator(".nav-link", { hasText: "Home" });
    await expect(homeLink).toBeVisible();
  });
});
