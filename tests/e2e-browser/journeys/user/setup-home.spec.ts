import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const TEST_USER_EMAIL = "invited-user@example.com";
const BASE_URL = "http://localhost:3000";

type CapturedEmailsResponse = {
  emails: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
};

async function getCapturedEmails(email: string): Promise<CapturedEmailsResponse> {
  const response = await fetch(
    `${BASE_URL}/api/local/emails/${encodeURIComponent(email)}`,
  );
  if (!response.ok) {
    return { emails: [] };
  }
  return (await response.json()) as CapturedEmailsResponse;
}

async function waitForMagicLink(
  email: string,
  previousCount: number,
  timeoutMs = 10000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { emails } = await getCapturedEmails(email);
    const magicLinkEmails = emails.filter((item) => item.type === "magic-link");
    if (magicLinkEmails.length > previousCount) {
      const url = magicLinkEmails.at(-1)?.payload["magicLinkUrl"];
      return typeof url === "string" ? url : null;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

test.describe("Setup Home Journey", () => {
  test("signed-out user completes setup checklist", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });
    await page.goto("/");

    await expect(page.getByText("Please sign in to continue.")).toBeVisible();
    await captureState(page, "setup-home", "signed-out");

    const previousEmails = await getCapturedEmails(TEST_USER_EMAIL);
    const previousCount = previousEmails.emails.filter(
      (item) => item.type === "magic-link",
    ).length;

    await page.getByTestId("sign-in-email").fill(TEST_USER_EMAIL);
    await page.getByTestId("sign-in-submit").click();
    await expect(page.getByTestId("sign-in-sent")).toBeVisible();

    const magicLinkUrl = await waitForMagicLink(TEST_USER_EMAIL, previousCount);

    expect(magicLinkUrl).not.toBeNull();
    expect(magicLinkUrl).toContain("/sign-in/verify?token=");

    const verificationUrl = new URL(magicLinkUrl!);
    verificationUrl.host = new URL(BASE_URL).host;
    await page.goto(verificationUrl.toString());

    await page.waitForURL((url) => url.pathname === "/");

    await expect(page.getByText("Welcome to SlotMerge")).toBeVisible();
    await captureState(page, "setup-home", "checklist");

    const cards = page.locator(".setup-card");
    await expect(cards).toHaveCount(5);

    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Discoverability" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Topics" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Availability" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Calendar Connection" }),
    ).toBeVisible();

    await expect(page.getByTestId("setup-chip")).toBeVisible();

    await page.getByTestId("avatar-dropdown-trigger").click();
    await captureState(page, "setup-home", "avatar-open");

    await expect(
      page.getByRole("menuitem", { name: "My Profile" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();

    const searchLink = page.locator(".nav-link", { hasText: "Search" });
    await expect(searchLink).toHaveCount(0);

    const adminLink = page.locator(".nav-link", { hasText: "Admin" });
    await expect(adminLink).toHaveCount(0);

    const homeLink = page.locator(".nav-link", { hasText: "Home" });
    await expect(homeLink).toBeVisible();
  });

  test("uninvited email receives the same non-leaking sent state", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByText("Please sign in to continue.")).toBeVisible();

    const emailField = page.getByTestId("sign-in-email");
    await expect(emailField).toBeVisible();

    await emailField.fill("stranger@example.com");
    await page.getByTestId("sign-in-submit").click();

    await expect(page.getByTestId("sign-in-sent")).toBeVisible();
    await expect(page.getByTestId("sign-in-sent")).toContainText(
      "If an account exists for that email, we just sent a sign-in link.",
    );
  });
});
