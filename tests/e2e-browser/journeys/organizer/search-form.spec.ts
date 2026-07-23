import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXTURE_DATE = new Date("2026-07-12T12:00:00.000Z");

test.describe("Search form journey", () => {
  test.use({ storageState: "playwright/.auth/organizer.json" });

  test("happy path: pre-filled defaults, select 2 Topics, Run Search → /searches/{newId}", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    await expect(
      page.getByRole("heading", { name: "Run a Search" }),
    ).toBeVisible();
    await expect(page.getByTestId("searches-form")).toBeVisible();
    await expect(page.getByTestId("searches-matching-rule")).toContainText(
      "Users must have all selected active Topics.",
    );
    await captureState(page, "search-form", "defaults");

    await expect(page.getByTestId("searches-minimum-input")).toHaveValue("2");
    await expect(page.getByTestId("searches-duration-input")).toHaveValue("60");
    await expect(page.getByTestId("searches-timezone-input")).toHaveValue(
      "America/Los_Angeles",
    );

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await expect(topicCheckboxes.first()).toBeVisible();
    const checkedCount = await topicCheckboxes.evaluateAll(
      (els) => els.filter((el) => (el as HTMLInputElement).checked).length,
    );
    expect(checkedCount).toBe(0);

    await topicCheckboxes.nth(0).check();
    await topicCheckboxes.nth(1).check();
    await captureState(page, "search-form", "topics-selected");

    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\/[^/]+$/);
    const url = page.url();
    expect(url).toMatch(/\/searches\/[a-f0-9-]+/);
    await expect(
      page.getByRole("heading", { name: "Search Result" }),
    ).toBeVisible();
    await captureState(page, "search-form", "after-run");
  });

  test("failure path: zero Topics selected renders selected_topics_required inline", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    await expect(page.getByTestId("searches-form")).toBeVisible();
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\?error=selected_topics_required/);
    await expect(
      page.getByTestId("searches-field-error-selectedTopics"),
    ).toBeVisible();
    await captureState(page, "search-form", "selected-topics-required");
  });

  test("failure path: topic_retired when a previously active Topic id is submitted", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    await expect(page.getByTestId("searches-form")).toBeVisible();
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        '[data-testid="searches-form"]',
      );
      if (!form) return;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "topicIds";
      input.value = "00000000-0000-0000-0000-000000000099";
      form.appendChild(input);
    });
    const firstCheckbox = page.getByTestId(/^searches-topic-checkbox-/).first();
    await firstCheckbox.check();
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\?error=topic_retired/);
    await expect(
      page.getByTestId("searches-field-error-selectedTopics"),
    ).toBeVisible();
    await expect(
      page.getByTestId("searches-field-error-selectedTopics"),
    ).toContainText("no longer active");
    await captureState(page, "search-form", "topic-retired");
  });

  test("failure path: minimumMatchingUsers=1 renders minimum_out_of_range", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await topicCheckboxes.nth(0).check();
    await page.getByTestId("searches-minimum-input").fill("1");
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\?error=minimum_out_of_range/);
    await expect(
      page.getByTestId("searches-field-error-minimumMatchingUsers"),
    ).toBeVisible();
    await captureState(page, "search-form", "minimum-out-of-range");
  });

  test("failure path: durationMinutes=10 renders duration_out_of_range", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await topicCheckboxes.nth(0).check();
    await page.getByTestId("searches-duration-input").fill("10");
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\?error=duration_out_of_range/);
    await expect(
      page.getByTestId("searches-field-error-durationMinutes"),
    ).toBeVisible();
    await captureState(page, "search-form", "duration-out-of-range");
  });

  test("failure path: dateRangeEnd before dateRangeStart renders date_range_invalid", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await topicCheckboxes.nth(0).check();
    await page.getByTestId("searches-daterange-start").fill("2026-08-10");
    await page.getByTestId("searches-daterange-end").fill("2026-07-06");
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\?error=date_range_invalid/);
    await expect(
      page.getByTestId("searches-field-error-dateRangeEnd"),
    ).toBeVisible();
    await captureState(page, "search-form", "date-range-invalid");
  });

  test("failure path: empty organizerTimezone renders organizer_timezone_required banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/searches");

    const topicCheckboxes = page.getByTestId(/^searches-topic-checkbox-/);
    await topicCheckboxes.nth(0).check();
    await page.getByTestId("searches-timezone-input").fill("");
    await page.getByTestId("searches-run-button").click();

    await page.waitForURL(/\/searches\?error=organizer_timezone_required/);
    await expect(page.getByTestId("searches-error-banner")).toBeVisible();
    await expect(page.getByTestId("searches-error-banner")).toContainText(
      "Set your profile timezone",
    );
    await captureState(page, "search-form", "timezone-required");
  });
});
