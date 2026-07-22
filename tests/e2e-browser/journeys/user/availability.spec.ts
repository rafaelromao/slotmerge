import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXTURE_DATE = new Date("2026-07-12T12:00:00.000Z");

test.describe("Availability page journey", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("happy path: add weekly window, add override, block override, edit buffer, see effective Availability preview", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");

    await expect(
      page.getByRole("heading", { name: "Availability" }),
    ).toBeVisible();
    await expect(page.getByTestId("availability-timezone-section")).toBeVisible();
    await expect(page.getByTestId("availability-weekly-section")).toBeVisible();
    await expect(page.getByTestId("availability-overrides-section")).toBeVisible();
    await expect(page.getByTestId("availability-buffer-section")).toBeVisible();
    await expect(page.getByTestId("availability-preview-section")).toBeVisible();
    await captureState(page, "availability", "loaded");

    // Add a new weekly window on Sunday via the per-day Save form.
    const sundayStart = page.getByTestId("availability-day-0-start");
    const sundayEnd = page.getByTestId("availability-day-0-end");
    await sundayStart.fill("10:00");
    await sundayEnd.fill("11:00");
    await page.getByTestId("availability-day-0-save").click();

    await page.waitForURL(/\/me\/availability\?saved=1/);
    await expect(page.getByTestId("availability-saved-indicator")).toBeVisible();
    await captureState(page, "availability", "saved");

    // Confirm the new Sunday window now appears in the list.
    await page.goto("/me/availability");
    await expect(page.getByTestId("availability-day-0-windows")).toBeVisible();

    // Add an "add" override for a specific date.
    await page.getByTestId("availability-override-date-input").fill("2026-08-20");
    await page.getByTestId("availability-override-start-input").fill("18:00");
    await page.getByTestId("availability-override-end-input").fill("20:00");
    await page.getByTestId("availability-override-type-add").check();
    await page.getByTestId("availability-override-add-submit").click();

    await page.waitForURL(/\/me\/availability\?saved=1/);
    await expect(page.getByTestId("availability-saved-indicator")).toBeVisible();
    await captureState(page, "availability", "add-override");

    // Add a "block" override on a different date.
    await page.goto("/me/availability");
    await page.getByTestId("availability-override-date-input").fill("2026-08-25");
    await page.getByTestId("availability-override-start-input").fill("09:00");
    await page.getByTestId("availability-override-end-input").fill("17:00");
    await page.getByTestId("availability-override-type-block").check();
    await page.getByTestId("availability-override-add-submit").click();

    await page.waitForURL(/\/me\/availability\?saved=1/);
    await captureState(page, "availability", "block-override");

    // Edit the buffer via the /me/profile round-trip.
    await page.goto("/me/availability");
    await page.getByTestId("availability-buffer-edit-link").click();
    await page.waitForURL(/\/me\/profile/);
    await page.getByTestId("profile-buffer-input").fill("20");
    await page.getByTestId("profile-save-button").click();
    await page.waitForURL(/\/me\/profile\?saved=1/);

    await page.goto("/me/availability");
    await expect(page.getByTestId("availability-buffer-summary")).toContainText(
      "20 minutes",
    );
    await captureState(page, "availability", "buffer-edited");

    // The effective Availability preview must be present and contain at
    // least one day interval for the seeded Monday window.
    const preview = page.getByTestId("availability-preview");
    await expect(preview).toBeVisible();
    const previewText = await preview.textContent();
    expect(previewText).toBeTruthy();
    expect(previewText).toMatch(/Mon|2026-07/);
  });

  test("end_before_start: end time before start time renders an inline error and preserves the inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");

    await page.getByTestId("availability-day-3-start").fill("15:00");
    await page.getByTestId("availability-day-3-end").fill("14:00");
    await page.getByTestId("availability-day-3-save").click();

    await page.waitForURL(/error=end_before_start/);
    await expect(page.getByTestId("availability-day-3-error")).toBeVisible();
    await expect(page.getByTestId("availability-day-3-start")).toHaveValue("15:00");
    await expect(page.getByTestId("availability-day-3-end")).toHaveValue("14:00");
    await captureState(page, "availability", "error-end-before-start");
  });

  test("overlap_existing_window: a new window overlapping the seeded Monday window produces an inline error", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");

    // The seeded user has a Monday 09:00-17:00 window. Submit a 11:00-12:00 window.
    await page.getByTestId("availability-day-1-start").fill("11:00");
    await page.getByTestId("availability-day-1-end").fill("12:00");
    await page.getByTestId("availability-day-1-save").click();

    await page.waitForURL(/error=overlap_existing_window/);
    await expect(page.getByTestId("availability-day-1-error")).toBeVisible();
    await captureState(page, "availability", "error-overlap");
  });

  test("invalid_time: an invalid time format produces an inline error", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");

    // Bypass the time input constraint by setting the raw value via JS.
    await page.evaluate(() => {
      const start = document.querySelector<HTMLInputElement>(
        '[data-testid="availability-day-4-start"]',
      );
      const end = document.querySelector<HTMLInputElement>(
        '[data-testid="availability-day-4-end"]',
      );
      if (!start || !end) throw new Error("day inputs not found");
      start.value = "not-a-time";
      end.value = "10:00";
      start.dispatchEvent(new Event("input", { bubbles: true }));
      end.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByTestId("availability-day-4-save").click();

    await page.waitForURL(/error=invalid_time/);
    await expect(page.getByTestId("availability-day-4-error")).toBeVisible();
    await captureState(page, "availability", "error-invalid-time");
  });

  test("date_required: submitting an override without a date renders an inline error", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");

    // The browser will block an empty date submit on a required input;
    // remove the required attribute and submit to exercise the server-side
    // validation.
    await page.evaluate(() => {
      const date = document.querySelector<HTMLInputElement>(
        '[data-testid="availability-override-date-input"]',
      );
      if (!date) throw new Error("date input not found");
      date.removeAttribute("required");
      date.value = "";
    });
    await page.getByTestId("availability-override-add-submit").click();

    await page.waitForURL(/error=date_required/);
    await expect(page.getByTestId("availability-override-error")).toBeVisible();
    await captureState(page, "availability", "error-date-required");
  });

  test("profile_timezone_required: the page shows the timezone summary when the seeded profile timezone is set", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");
    await expect(page.getByTestId("availability-timezone-summary")).toBeVisible();
    await expect(page.getByTestId("availability-timezone-summary")).toContainText(
      "America/New_York",
    );
    await captureState(page, "availability", "timezone-summary");
  });

  test("invalid_buffer: out-of-range buffer is rejected on /me/profile, and the availability page surfaces the saved buffer", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });

    // Out-of-range buffer is rejected by the profile validator, so the
    // saved bufferMinutes stays at the seeded value (5). The
    // invalid_buffer page surface is exercised in the component test.
    await page.goto("/me/profile");
    await page.getByTestId("profile-display-name-input").fill("Alice User");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/New_York");
    await page.getByTestId("profile-buffer-input").fill("999");
    await page.getByTestId("profile-save-button").click();

    await expect(page.getByTestId("profile-buffer-error")).toBeVisible();
    await page.goto("/me/availability");
    await expect(page.getByTestId("availability-buffer-summary")).toContainText(
      "5 minutes",
    );
    await captureState(page, "availability", "buffer-invalid-on-profile");
  });

  test("empty state: the seeded user has windows and overrides, so the empty-state copy is not shown", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/availability");

    // The seeded user has windows and overrides; the empty-state path is
    // exercised in the component test for render-to-String and in the
    // Vitest workflow boundary tests.
    await expect(page.getByTestId("availability-empty")).toHaveCount(0);
    await captureState(page, "availability", "non-empty");
  });
});
