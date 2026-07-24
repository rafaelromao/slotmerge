import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getDb } from "../../../../src/db/client";
import {
  calendarConnections,
  importedBusyIntervals,
} from "../../../../src/db/schema";
import { FIXTURE_DATE, USER_FIXTURES, seedAll } from "../../../fixtures/seeds";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXED_DATE = new Date(FIXTURE_DATE);
const USER_ID = USER_FIXTURES[0].id;

async function resetCalendarState(): Promise<void> {
  const db = getDb();
  await db
    .delete(importedBusyIntervals)
    .where(eq(importedBusyIntervals.userId, USER_ID));
  await db
    .delete(calendarConnections)
    .where(eq(calendarConnections.userId, USER_ID));
  await seedAll(db);
}

function connectedMockGoogleCard(page: Page) {
  return page
    .locator('[data-provider="google"]')
    .filter({ hasText: "google:" });
}

test.describe("Calendar Connection page journey", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    await resetCalendarState();
  });

  test("renders the heading, two connect CTAs, and the seeded Google connection card", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/me/calendar-connections");

    await expect(
      page.getByRole("heading", {
        name: "Calendar connections",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId("calendar-connection-connect-google"),
    ).toBeVisible();
    await expect(
      page.getByTestId("calendar-connection-connect-microsoft"),
    ).toBeVisible();

    const card = page.locator('[data-provider="google"]').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-status", "connected");
    await captureState(page, "calendar-connections", "loaded");
  });

  test("connects, selects calendars, refreshes, disconnects, reconnects, and handles token expiry", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/me/calendar-connections");

    await page.getByTestId("calendar-connection-connect-google").click();
    await page.waitForURL(
      /\/me\/calendar-connections\?oauth=connected(?:&|$)/,
      { timeout: 10_000 },
    );
    await expect(
      page.getByTestId("calendar-connection-banner-connected"),
    ).toBeVisible();
    await captureState(page, "calendar-connections", "connected");

    const newCard = connectedMockGoogleCard(page);
    await expect(newCard).toHaveCount(1);
    await expect(newCard).toHaveAttribute("data-status", "connected");

    const checkbox = newCard.locator('input[name="calendarIds"]').first();
    await expect(checkbox).toBeVisible();
    await checkbox.uncheck();
    await checkbox.check();
    const save = newCard.locator(
      'button[data-testid^="calendar-connection-save-"]',
    );
    await expect(save).toBeVisible();
    await save.click();
    await page.waitForURL(/\?intent=save&success=1/, { timeout: 10_000 });
    await captureState(page, "calendar-connections", "after-save");

    const refresh = newCard.locator(
      'button[data-testid^="calendar-connection-refresh-"]',
    );
    await expect(refresh).toBeVisible();
    await refresh.click();
    await page.waitForURL(/\?intent=refresh&success=1/, { timeout: 10_000 });
    await captureState(page, "calendar-connections", "after-refresh");

    const disconnectForm = newCard.locator(
      'form[data-testid^="calendar-connection-disconnect-form-"]',
    );
    const accountIdentifier = await disconnectForm
      .locator('[id^="calendar-connection-disconnect-hint-"]')
      .innerText();
    await disconnectForm
      .locator('input[data-testid^="calendar-connection-disconnect-confirm-"]')
      .fill(accountIdentifier.trim());
    await disconnectForm
      .locator('button[data-testid^="calendar-connection-disconnect-"]')
      .click();
    await page.waitForURL(/\?intent=disconnect&success=1/, {
      timeout: 10_000,
    });
    await expect(newCard).toHaveCount(0);
    await captureState(page, "calendar-connections", "after-disconnect");

    await page.goto("/me/calendar-connections?scenario=expired");
    await page.getByTestId("calendar-connection-connect-google").click();
    await page.waitForURL(
      /\/me\/calendar-connections\?oauth=connected(?:&|$)/,
      { timeout: 10_000 },
    );
    const expiredCard = connectedMockGoogleCard(page);
    await expect(expiredCard).toHaveCount(1);
    await expiredCard
      .locator('button[data-testid^="calendar-connection-refresh-"]')
      .click();
    await expect
      .poll(
        async () => {
          await page.reload();
          return expiredCard.getAttribute("data-status");
        },
        { timeout: 20_000 },
      )
      .toBe("needs_reconnect");
    await captureState(page, "calendar-connections", "needs-reconnect");

    await page.goto("/me/calendar-connections?scenario=expired");
    const reconnect = expiredCard.locator(
      'button[data-testid^="calendar-connection-reconnect-"]',
    );
    await expect(reconnect).toBeVisible();
    await reconnect.click();
    await page.waitForURL(
      /\/me\/calendar-connections\?oauth=connected(?:&|$)/,
      { timeout: 10_000 },
    );
    const replacementCard = connectedMockGoogleCard(page);
    await replacementCard
      .locator('button[data-testid^="calendar-connection-refresh-"]')
      .click();
    await expect
      .poll(
        async () => {
          await page.reload();
          return replacementCard.getAttribute("data-status");
        },
        { timeout: 20_000 },
      )
      .toBe("needs_reconnect");
    await captureState(page, "calendar-connections", "reconnected-expired");
  });

  test("Microsoft personal account returns the unsupported outcome", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/me/calendar-connections?scenario=personal");

    await page.getByTestId("calendar-connection-connect-microsoft").click();
    await page.waitForURL(
      /\/me\/calendar-connections\?oauth=unsupported(?:&|$)/,
      { timeout: 10_000 },
    );
    await expect(
      page.getByTestId("calendar-connection-banner-unsupported"),
    ).toBeVisible();
    await captureState(page, "calendar-connections", "unsupported");
  });

  test("denied consent returns the denied outcome without provider internals", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/me/calendar-connections?scenario=denied");

    await page.getByTestId("calendar-connection-connect-google").click();
    await page.waitForURL(/\/me\/calendar-connections\?oauth=denied(?:&|$)/, {
      timeout: 10_000,
    });
    const location = page.url();
    expect(location).not.toContain("google-code");
    expect(location).not.toContain("provider");
    expect(location).not.toContain("access_token");
    await expect(
      page.getByTestId("calendar-connection-banner-denied"),
    ).toBeVisible();
    await captureState(page, "calendar-connections", "denied");
  });

  test("empty state shows the canonical empty-state copy", async ({ page }) => {
    const db = getDb();
    await db
      .delete(importedBusyIntervals)
      .where(eq(importedBusyIntervals.userId, USER_ID));
    await db
      .delete(calendarConnections)
      .where(eq(calendarConnections.userId, USER_ID));
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/me/calendar-connections");

    await expect(page.getByTestId("calendar-connection-empty")).toBeVisible();
    await expect(
      page.getByTestId("calendar-connection-connect-google"),
    ).toBeVisible();
    await captureState(page, "calendar-connections", "empty");
  });
});
