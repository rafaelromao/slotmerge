import { test, expect } from "@playwright/test";

import { FIXTURE_DATE, seedAll } from "../../../fixtures/seeds";
import { getDb } from "../../../../src/db/client";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXED_DATE = new Date(FIXTURE_DATE);

test.describe("Organizer search history journey", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/organizer.json" });

  test.beforeEach(async () => {
    const db = getDb();
    await db.execute(
      "TRUNCATE TABLE search_results, searches RESTART IDENTITY CASCADE",
    );
    await seedAll(db);
  });

  test("happy path: list renders, Open snapshot lands /searches/{id}, Re-run lands a new Search Result, source snapshot stays open at /searches/{oldId}", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/searches");

    await page.getByRole("checkbox", { name: "AI engineering" }).check();
    await page.getByRole("checkbox", { name: "Product strategy" }).check();
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\/[a-f0-9-]+$/);
    const sourceSearchId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto("/searches/history");

    const historyRows = page.getByTestId("search-history-row");
    await expect(historyRows.first()).toBeVisible();
    await expect(historyRows).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Search History" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bob Organizer" }),
    ).toBeVisible();
    await expect(
      page.getByText("AI engineering, Product strategy"),
    ).toBeVisible();
    await captureState(page, "search-history", "list");

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
    await captureState(page, "search-history", "open-snapshot");

    await page.goto("/searches/history");
    await expect(historyRows.first()).toBeVisible();
    await historyRows.first().getByTestId("search-history-rerun").click();
    await page.waitForURL((url) => {
      const pathname = url.pathname;
      return (
        /^\/searches\/[a-f0-9-]+$/.test(pathname) &&
        pathname !== `/searches/${sourceSearchId}`
      );
    });
    const rerunSearchId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(rerunSearchId).not.toBe(sourceSearchId);
    await expect(
      page.getByRole("heading", { name: "Search Result" }),
    ).toBeVisible();
    await captureState(page, "search-history", "after-rerun");

    await page.goto(`/searches/${sourceSearchId}?week=2026-07-06`);
    await expect(
      page.getByRole("heading", { name: "Search Result" }),
    ).toBeVisible();
    const openedUrl = new URL(page.url());
    expect(openedUrl.pathname).toBe(`/searches/${sourceSearchId}`);
  });

  test("failure path: empty history shows the empty-state with a primary action linking to /searches", async ({
    page,
  }) => {
    void FIXED_DATE;
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });
    const db = getDb();
    await db.execute(
      "TRUNCATE TABLE search_results, searches RESTART IDENTITY CASCADE",
    );
    await page.goto("/searches/history");

    await expect(page.getByTestId("search-history-empty-state")).toBeVisible();
    const primaryAction = page
      .getByTestId("search-history-empty-state")
      .getByRole("link", { name: "Run your first Search" });
    await expect(primaryAction).toHaveAttribute("href", "/searches");
    await expect(page.getByTestId("search-history-list")).toHaveCount(0);
    await captureState(page, "search-history", "empty");
  });
});
