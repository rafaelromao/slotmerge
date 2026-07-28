import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";
import {
  cleanupLocalTestRows,
  insertLocalTestRows,
} from "../../../helpers/local-test-rows";

test.describe("Admin Status journey", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test.beforeEach(async () => {
    await cleanupLocalTestRows();
  });

  test.afterEach(async () => {
    await cleanupLocalTestRows();
  });

  test("renders all three sub-blocks with green pills when the system is healthy", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin#status");

    await expect(page.getByTestId("admin-status-body")).toBeVisible();
    await expect(
      page.getByTestId("admin-status-email-block"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-status-calendar-block"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-status-tokens-block"),
    ).toBeVisible();

    await expect(
      page.getByTestId("admin-status-email-pill"),
    ).toHaveAttribute("data-status", "green");
    await expect(
      page.getByTestId("admin-status-calendar-pill"),
    ).toHaveAttribute("data-status", "green");
    await expect(
      page.getByTestId("admin-status-tokens-pill"),
    ).toHaveAttribute("data-status", "green");

    await captureState(page, "admin", "status-expanded");

    const html = await page.content();
    expect(html).not.toContain("Refresh now");
    expect(html).not.toContain("Send critical operational email");
  });

  test("surfaces warning banners when Email failure rate > 5% or >1 needs_reconnect", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await insertLocalTestRows({
      needsReconnectCount: 2,
      failedEmailCount: 3,
    });

    await page.goto("/admin#status");

    await expect(
      page.getByTestId("admin-status-email-warning"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-status-calendar-warning"),
    ).toBeVisible();

    const emailBanner = await page
      .getByTestId("admin-status-email-warning")
      .textContent();
    expect(emailBanner).toContain("Email delivery is degraded");
    expect(emailBanner).toContain("emailEvent");
    expect(emailBanner).toContain("the next retry window");

    const calendarBanner = await page
      .getByTestId("admin-status-calendar-warning")
      .textContent();
    expect(calendarBanner).toContain(
      "One or more Calendar connections need reconnect",
    );
    expect(calendarBanner).toContain("/me/calendar-connections");
    expect(calendarBanner).not.toContain("alice@example.com");
    expect(calendarBanner).not.toContain("user-1");
    expect(calendarBanner).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    await expect(
      page.getByTestId("admin-status-email-pill"),
    ).toHaveAttribute("data-status", "red");
    await expect(
      page.getByTestId("admin-status-calendar-pill"),
    ).toHaveAttribute("data-status", "red");

    await captureState(page, "admin", "status-warning");
  });

  test("renders tokens-needing-refresh rows with Refresh and Disconnect forms", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await insertLocalTestRows({ tokensExpiringSoonCount: 1 });

    await page.goto("/admin#status");

    const tokensTable = page.getByTestId("admin-status-tokens-table");
    await expect(tokensTable).toBeVisible();
    const rows = tokensTable.locator(
      '[data-testid^="admin-status-tokens-row-"]',
    );
    await expect(rows.first()).toBeVisible();
    await expect(
      page.locator('[data-testid^="admin-status-tokens-refresh-"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="admin-status-tokens-disconnect-"]').first(),
    ).toBeVisible();

    await captureState(page, "admin", "status-tokens-needing-refresh");
  });

  for (const [label, width, height] of [
    ["desktop", 1280, 900],
    ["tablet", 900, 1200],
    ["mobile", 480, 800],
  ] as const) {
    test(`renders the Status section at ${label} viewport (${width}x${height})`, async ({
      page,
    }) => {
      await page.clock.install({
        time: new Date("2026-07-12T12:00:00.000Z"),
      });
      await page.setViewportSize({ width, height });

      await page.goto("/admin#status");

      await expect(page.getByTestId("admin-status-body")).toBeVisible();
      await captureState(page, "admin", `status-expanded-${label}`);
    });
  }
});