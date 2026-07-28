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

async function seedJourneyFixture(options: { withStaleConnection?: boolean } = {}): Promise<void> {
  const db = getDb();
  await db.execute(
    "TRUNCATE TABLE search_results, searches RESTART IDENTITY CASCADE",
  );
  await seedAll(db);
  if (options.withStaleConnection) {
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
}

async function runSearchThroughForm(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/searches");
  await expect(page.getByTestId("searches-form")).toBeVisible();
  const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
  await topicCheckboxes.nth(0).check();
  await topicCheckboxes.nth(1).check();
  await page.getByTestId("searches-run-button").click();
  await page.waitForURL(/\/searches\/[a-f0-9-]+$/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test.describe("Organizer end-to-end journey", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/organizer.json" });

  test.describe("search form surface", () => {
    test.beforeEach(async () => {
      await seedJourneyFixture();
    });

    test("happy path: pre-filled defaults, select 2 Topics, Run Search creates a Search Result", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      await page.goto("/searches");

      await expect(
        page.getByRole("heading", { name: "Run a Search" }),
      ).toBeVisible();
      await expect(page.getByTestId("searches-form")).toBeVisible();
      await expect(page.getByTestId("searches-matching-rule")).toContainText(
        "Users must have all selected active Topics.",
      );
      await expect(page.getByTestId("searches-minimum-input")).toHaveValue("2");
      await expect(page.getByTestId("searches-duration-input")).toHaveValue("60");
      await expect(page.getByTestId("searches-timezone-input")).toHaveValue(
        "America/Los_Angeles",
      );
      await captureState(page, "organizer/search-form", "defaults");

      const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
      await topicCheckboxes.nth(0).check();
      await topicCheckboxes.nth(1).check();
      await captureState(page, "organizer/search-form", "topics-selected");

      await page.getByTestId("searches-run-button").click();
      await page.waitForURL(/\/searches\/[a-f0-9-]+$/);
      await expect(
        page.getByRole("heading", { name: "Search Result" }),
      ).toBeVisible();
    });

    test("failure path: zero Topics selected renders the inline selected_topics_required error", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      await page.goto("/searches");
      await expect(page.getByTestId("searches-form")).toBeVisible();

      await page.getByTestId("searches-run-button").click();
      await page.waitForURL(/\/searches\?feedback=/);
      await expect(
        page.getByTestId("searches-field-error-selectedTopics"),
      ).toBeVisible();
    });
  });

  test.describe("search result surface", () => {
    test.beforeEach(async () => {
      await seedJourneyFixture({ withStaleConnection: true });
    });

    test("happy path: renders the immutable Search Result, weekly grid, stale-data note, and Next week link", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      const searchId = await runSearchThroughForm(page);

      await expect(
        page.getByRole("heading", { name: "Search Result" }),
      ).toBeVisible();
      await expect(page.getByText("Open in history")).toBeVisible();
      await expect(page.getByText("Re-run Search")).toBeVisible();
      await expect(
        page.getByText("Cells marked ⚠ include stale calendar data."),
      ).toBeVisible();
      const headerText = await page
        .getByText("Search ID:", { exact: false })
        .first()
        .innerText();
      expect(headerText).toContain(searchId);
      await captureState(page, "organizer/search-result", "grid");

      await page.getByRole("link", { name: "Next week" }).click();
      await page.waitForURL(/\/searches\/[a-f0-9-]+\?week=\d{4}-\d{2}-\d{2}/);
      await expect(
        page.getByRole("heading", { name: "Search Result" }),
      ).toBeVisible();
      await captureState(page, "organizer/search-result", "next-week");
    });
  });

  test.describe("slot details drawer surface", () => {
    test.beforeEach(async () => {
      await seedJourneyFixture({ withStaleConnection: true });
    });

    test("happy path: opens a stale Slot with accessible dialog semantics, focus trap, Escape close, and the no-booking footer", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      await runSearchThroughForm(page);

      const staleSlot = page
        .getByTestId(/^slot-\d+-\d+$/)
        .filter({ has: page.locator("[data-stale='true']") })
        .first();
      await expect(staleSlot).toBeVisible();
      await expect(staleSlot).toHaveAttribute("data-stale", "true");
      await expect(staleSlot).toHaveAttribute(
        "aria-label",
        /contains stale calendar data/,
      );
      await staleSlot.click();

      const drawer = page.getByTestId("slot-details-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("role", "dialog");
      await expect(drawer).toHaveAttribute("aria-modal", "true");
      await expect(drawer).toHaveAttribute("aria-labelledby", "drawer-title");
      await expect(drawer).toHaveAttribute("aria-describedby", "drawer-description");
      await expect(drawer.getByText("No booking actions in MVP.")).toBeVisible();
      await expect(
        drawer.getByText("No export/share actions in MVP."),
      ).toBeVisible();
      await expect(drawer.locator(".calendar-stale")).toHaveCount(1);
      await captureState(page, "organizer/search-result", "drawer-stale");

      const closeButton = page.getByTestId("drawer-close");
      await expect(closeButton).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(closeButton).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("slot-details-drawer")).toHaveCount(0);
      await expect(staleSlot).toBeFocused();
    });
  });

  test.describe("search history surface", () => {
    test.beforeEach(async () => {
      await seedJourneyFixture();
    });

    test("happy path: lists the source snapshot, opens it, and confirms the source id remains readable", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      const sourceSearchId = await runSearchThroughForm(page);

      await page.goto("/searches/history");
      await expect(
        page.getByRole("heading", { name: "Search History" }),
      ).toBeVisible();
      const historyRows = page.getByTestId("search-history-row");
      await expect(historyRows.first()).toBeVisible();
      await expect(historyRows).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: "Bob Organizer" }),
      ).toBeVisible();
      await expect(page.getByText("Minimum 2, 60 minutes")).toBeVisible();
      await captureState(page, "organizer/search-history", "list");

      const row = historyRows.first();
      await expect(
        row.getByTestId("search-history-open-snapshot"),
      ).toHaveAttribute(
        "href",
        new RegExp(`/searches/${sourceSearchId}\\?week=`),
      );
      await row.getByTestId("search-history-open-snapshot").click();
      await page.waitForURL(new RegExp(`/searches/${sourceSearchId}\\?week=`));
      await expect(
        page.getByRole("heading", { name: "Search Result" }),
      ).toBeVisible();
      await captureState(page, "organizer/search-result", "source-opened-from-history");
    });

    test("failure path: empty history renders the empty-state with a primary action linking to /searches", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      const db = getDb();
      await db.execute(
        "TRUNCATE TABLE search_results, searches RESTART IDENTITY CASCADE",
      );

      await page.goto("/searches/history");
      const emptyState = page.getByTestId("search-history-empty-state");
      await expect(emptyState).toBeVisible();
      await expect(
        emptyState.getByRole("link", { name: "Run your first Search" }),
      ).toHaveAttribute("href", "/searches");
    });
  });

  test.describe("rerun surface", () => {
    test.beforeEach(async () => {
      await seedJourneyFixture({ withStaleConnection: true });
    });

    test("happy path: re-runs a Search, redirects to a new Search Result, and keeps the source snapshot unchanged", async ({
      page,
    }) => {
      await page.clock.install({ time: FIXED_DATE });
      const sourceSearchId = await runSearchThroughForm(page);

      const sourceDateTime = await page
        .locator(".search-result-header-meta time")
        .first()
        .getAttribute("dateTime");
      expect(sourceDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      await page.goto("/searches/history");
      const historyRows = page.getByTestId("search-history-row");
      await expect(historyRows).toHaveCount(1);
      await captureState(page, "organizer/search-history", "before-rerun");

      await historyRows
        .first()
        .getByTestId("search-history-rerun")
        .click();
      await page.waitForURL(
        (url) =>
          /\/searches\/[a-f0-9-]+$/.test(url.pathname) &&
          url.pathname !== `/searches/${sourceSearchId}`,
      );
      const rerunSearchId = new URL(page.url()).pathname.split("/").at(-1)!;
      expect(rerunSearchId).not.toBe(sourceSearchId);
      await expect(
        page.getByRole("heading", { name: "Search Result" }),
      ).toBeVisible();
      await captureState(page, "organizer/search-result", "after-rerun");

      await page.goto("/searches/history");
      const twoSnapshots = page.getByTestId("search-history-row");
      await expect(twoSnapshots).toHaveCount(2);
      await captureState(page, "organizer/search-history", "two-snapshots");

      await page.goto(`/searches/${sourceSearchId}`);
      await expect(
        page.getByRole("heading", { name: "Search Result" }),
      ).toBeVisible();
      const reopenedDateTime = await page
        .locator(".search-result-header-meta time")
        .first()
        .getAttribute("dateTime");
      expect(reopenedDateTime).toBe(sourceDateTime);
      await captureState(page, "organizer/search-result", "source-reopened");
    });
  });
});
