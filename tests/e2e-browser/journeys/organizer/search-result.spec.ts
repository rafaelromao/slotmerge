import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getDb } from "../../../../src/db/client";
import { calendarConnections } from "../../../../src/db/schema";
import { FIXTURE_DATE, USER_FIXTURES, seedAll } from "../../../fixtures/seeds";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXED_DATE = new Date(FIXTURE_DATE);
const STALE_USER_ID = USER_FIXTURES[3].id;
const STALE_CONNECTION_ID = "00000000-0000-0000-0000-000000009900";
const STALE_SYNC_AT = new Date("2026-07-09T12:00:00.000Z");

async function seedSearchResultFixture(): Promise<void> {
  const db = getDb();
  await seedAll(db);
  await db
    .delete(calendarConnections)
    .where(eq(calendarConnections.userId, STALE_USER_ID));
  await db
    .insert(calendarConnections)
    .values({
      id: STALE_CONNECTION_ID,
      userId: STALE_USER_ID,
      provider: "google",
      providerAccountKey: "google:stale-user-4",
      accountIdentifier: "dana.example@gmail.com",
      scopes: "https://www.googleapis.com/auth/calendar.freebusy",
      status: "connected",
      lastSyncAt: STALE_SYNC_AT,
      contributingCalendarIds: ["primary"],
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    })
    .onConflictDoUpdate({
      target: calendarConnections.id,
      set: {
        userId: STALE_USER_ID,
        provider: "google",
        providerAccountKey: "google:stale-user-4",
        accountIdentifier: "dana.example@gmail.com",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "connected",
        lastSyncAt: STALE_SYNC_AT,
        contributingCalendarIds: ["primary"],
        updatedAt: FIXED_DATE,
      },
    });
}

test.describe("Organizer search result journey", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/organizer.json" });

  test.beforeEach(async () => {
    await seedSearchResultFixture();
  });

  test("happy path: grid renders, stale slot opens the drawer, next week navigates, history opens, rerun shell opens", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/searches");

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await topicCheckboxes.nth(0).check();
    await topicCheckboxes.nth(1).check();
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\/[a-f0-9-]+$/);
    await expect(
      page.getByRole("heading", { name: "Search Result" }),
    ).toBeVisible();
    await expect(page.getByText("Open in history")).toBeVisible();
    await expect(page.getByText("Re-run Search")).toBeVisible();
    await expect(
      page.getByText("Cells marked ⚠ include stale calendar data."),
    ).toBeVisible();
    await captureState(page, "search-result", "grid");

    const staleSlot = page
      .getByRole("button", {
        name: /contains stale calendar data/,
      })
      .first();
    await expect(staleSlot).toBeVisible();
    await staleSlot.click();

    await expect(page.getByTestId("slot-details-drawer")).toBeVisible();
    await expect(page.getByText("stale")).toBeVisible();
    await expect(
      page.getByText("available in this Search window"),
    ).toBeVisible();
    await expect(page.getByText("No booking actions in MVP.")).toBeVisible();
    await captureState(page, "search-result", "drawer");

    await page.getByRole("link", { name: "Next week" }).click();
    await page.waitForURL(/week=2026-07-20/);
    await expect(
      page.getByRole("heading", { name: "Search Result" }),
    ).toBeVisible();
    await captureState(page, "search-result", "next-week");

    await page.getByRole("link", { name: "Open in history" }).click();
    await page.waitForURL(/\/searches\/history$/);
    await expect(
      page.getByRole("heading", { name: "Search History" }),
    ).toBeVisible();
    await captureState(page, "search-history", "list");

    await page.getByText("Re-run Search").click();
    await expect(
      page.getByText("Re-run Search confirmation lands in T13."),
    ).toBeVisible();
    await captureState(page, "search-history", "rerun-shell");
  });

  test("failure path: a week with no slots renders the empty state and actions", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/searches");

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await topicCheckboxes.nth(0).check();
    await topicCheckboxes.nth(1).check();
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\/[a-f0-9-]+$/);
    const searchId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto(`/searches/${searchId}?week=2026-09-14`);

    await expect(page.getByRole("grid", { name: /Weekly search results/ })).toBeVisible();
    await expect(page.getByText("No matching Slots this week.")).toHaveCount(0);
    await expect(page.locator(".calendar-slot-empty")).toHaveCount(7);
    await expect(
      page.getByRole("link", { name: "Open in history" }),
    ).toBeVisible();
    await expect(page.getByText("Re-run Search")).toBeVisible();
    await captureState(page, "search-result", "empty-week");
  });
});
