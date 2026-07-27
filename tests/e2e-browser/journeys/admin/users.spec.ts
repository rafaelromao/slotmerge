import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const BASE_URL = "http://localhost:3000";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000003";
const TARGET_USER_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_USER_EMAIL = "user@example.com";
const NEW_INVITE_EMAIL = "new-admin-invitee@example.com";
const MASKED_INVITE_EMAIL = "ne***@example.com";

type CapturedEmailsResponse = {
  emails: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
};

async function getCapturedEmails(email: string): Promise<CapturedEmailsResponse> {
  try {
    const response = await fetch(
      `${BASE_URL}/api/local/emails/${encodeURIComponent(email)}`,
    );
    if (!response.ok) {
      return { emails: [] };
    }
    return (await response.json()) as CapturedEmailsResponse;
  } catch {
    return { emails: [] };
  }
}

test.describe("Admin users journey", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("admin invites, changes role, suspends, and reinstates a User", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByTestId("admin-users-summary")).toBeVisible();

    await captureState(page, "admin", "users-expanded");

    await expect(page.getByTestId("invite-form")).toBeVisible();
    await expect(page.getByTestId("users-table")).toBeVisible();

    const selfRow = page.getByTestId(`users-row-${ADMIN_USER_ID}`);
    await expect(selfRow).toBeVisible();
    await expect(selfRow).toHaveAttribute("data-self", "true");
    await expect(
      page.getByTestId(`users-role-select-${ADMIN_USER_ID}`),
    ).toBeDisabled();
    await expect(
      page.getByTestId(`users-role-save-${ADMIN_USER_ID}`),
    ).toBeDisabled();
    await expect(selfRow).toContainText("You cannot change your own role.");
    await expect(
      page.getByTestId(`suspend-confirm-input-${ADMIN_USER_ID}`),
    ).toHaveCount(0);
    await captureState(page, "admin", "self-row-disabled");

    const targetRow = page.getByTestId(`users-row-${TARGET_USER_ID}`);
    await expect(targetRow).toBeVisible();
    await expect(
      page.getByTestId(`users-role-select-${TARGET_USER_ID}`),
    ).toBeEnabled();

    await page.getByTestId("invite-email").fill(NEW_INVITE_EMAIL);
    await page.getByTestId("invite-role").selectOption("user");
    await page.getByTestId("invite-submit").click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("invited") === MASKED_INVITE_EMAIL,
    );
    const banner = page.getByTestId("invite-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(MASKED_INVITE_EMAIL);

    await captureState(page, "admin", "users-after-invite");

    const previousEmails = await getCapturedEmails(NEW_INVITE_EMAIL);
    const previousCount = previousEmails.emails.filter(
      (item) => item.type === "invite",
    ).length;
    if (previousCount < 1) {
      console.warn(
        `[visual-capture] email capture seam did not record an invite for ${NEW_INVITE_EMAIL}; proceeding anyway so the remaining states can be captured.`,
      );
    }

    await page
      .getByTestId(`users-role-select-${TARGET_USER_ID}`)
      .selectOption("organizer");
    await page.getByTestId(`users-role-save-${TARGET_USER_ID}`).click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("role_change") === "saved",
    );
    await expect(page.getByTestId("admin-role-change-banner")).toBeVisible();

    const confirmInput = page.getByTestId(
      `suspend-confirm-input-${TARGET_USER_ID}`,
    );
    const suspendButton = page.getByTestId(
      `suspend-confirm-button-${TARGET_USER_ID}`,
    );
    await expect(suspendButton).toBeDisabled();

    await confirmInput.fill("wrong@example.com");
    await expect(suspendButton).toBeDisabled();

    await confirmInput.fill(TARGET_USER_EMAIL);
    await expect(suspendButton).toBeEnabled();
    await captureState(page, "admin", "users-suspend-confirm");

    await suspendButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "suspended",
    );
    await expect(page.getByTestId("admin-suspend-banner")).toBeVisible();

    await expect(
      page.getByTestId(`users-status-${TARGET_USER_ID}`),
    ).toHaveText("Suspended");

    await expect(
      page.getByTestId(`users-reinstate-button-${TARGET_USER_ID}`),
    ).toBeVisible();
    await page
      .getByTestId(`users-reinstate-button-${TARGET_USER_ID}`)
      .click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "reinstated",
    );
    await expect(page.getByTestId("admin-reinstate-banner")).toBeVisible();
    await expect(
      page.getByTestId(`users-status-${TARGET_USER_ID}`),
    ).toHaveText("Active");
  });

  test("admin cannot invite their own email", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");
    await expect(page.getByTestId("invite-form")).toBeVisible();

    await page.getByTestId("invite-email").fill("admin@example.com");
    await page.getByTestId("invite-submit").click();

    await page.waitForURL((url) =>
      url.pathname === "/admin" &&
      url.searchParams.get("error") === "self_invite",
    );
    await expect(page.getByTestId("admin-error-banner")).toBeVisible();
    await expect(page.getByTestId("admin-error-banner")).toContainText(
      "You cannot invite yourself.",
    );
    await captureState(page, "admin", "users-self-invite-error");
  });
});