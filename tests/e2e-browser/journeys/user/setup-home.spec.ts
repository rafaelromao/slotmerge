import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const TEST_USER_EMAIL = "user@example.com";
const BASE_URL = "http://localhost:3000";

type CapturedEmailsResponse = {
  emails: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
};

async function getMagicLinkUrl(email: string): Promise<string | null> {
  const response = await fetch(
    `${BASE_URL}/api/local/emails/${encodeURIComponent(email)}`,
  );
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as CapturedEmailsResponse;
  const emails = data.emails;
  const magicLinkEmails = emails.filter((e) => e.type === "magic-link");
  if (magicLinkEmails.length === 0) {
    return null;
  }
  const lastMagicLinkEmail = magicLinkEmails[magicLinkEmails.length - 1];
  const url = lastMagicLinkEmail.payload["magicLinkUrl"];
  return typeof url === "string" ? url : null;
}

async function waitForMagicLink(
  email: string,
  timeoutMs = 10000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = await getMagicLinkUrl(email);
    if (url) {
      return url;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

test.describe("Setup Home Journey", () => {
  test("signed-out user completes setup checklist", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText("Please sign in to continue."),
    ).toBeVisible();
    await captureState(page, "setup-home", "signed-out");

    const magicLinkRequest = await fetch(
      `${BASE_URL}/auth/magic-link/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(TEST_USER_EMAIL)}`,
      },
    );

    expect(magicLinkRequest.ok).toBeTruthy();

    const magicLinkUrl = await waitForMagicLink(TEST_USER_EMAIL);

    expect(magicLinkUrl).not.toBeNull();
    expect(magicLinkUrl).toContain("/auth/magic-link/verify?token=");

    await page.goto(magicLinkUrl!);

    await page.waitForURL(`${BASE_URL}/`);

    await expect(page.getByText("Welcome to SlotMerge")).toBeVisible();
    await captureState(page, "setup-home", "checklist");

    const cards = page.locator(".setup-card");
    await expect(cards).toHaveCount(5);

    await expect(page.getByText("Profile")).toBeVisible();
    await expect(page.getByText("Discoverability")).toBeVisible();
    await expect(page.getByText("Topics")).toBeVisible();
    await expect(page.getByText("Availability")).toBeVisible();
    await expect(page.getByText("Calendar Connection")).toBeVisible();

    await expect(page.getByTestId("setup-chip")).toBeVisible();

    await page.getByTestId("avatar-dropdown-trigger").click();
    await captureState(page, "setup-home", "avatar-open");

    await expect(
      page.getByRole("menuitem", { name: "My Profile" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeVisible();

    const searchLink = page.locator(".nav-link", { hasText: "Search" });
    await expect(searchLink).toHaveCount(0);

    const adminLink = page.locator(".nav-link", { hasText: "Admin" });
    await expect(adminLink).toHaveCount(0);

    const homeLink = page.locator(".nav-link", { hasText: "Home" });
    await expect(homeLink).toBeVisible();
  });

  test("uninvited email returns not_invited error", async () => {
    const uninvitedEmail = "stranger@example.com";

    const response = await fetch(
      `${BASE_URL}/auth/magic-link/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(uninvitedEmail)}`,
      },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("not_invited");
  });
});
