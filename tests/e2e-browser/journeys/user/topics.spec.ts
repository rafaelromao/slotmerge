import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXTURE_DATE = new Date("2026-07-12T12:00:00.000Z");

test.describe("Topics page journey", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("happy path: select Topics + save + propose a new Topic + see the pending row", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/topics");

    await expect(
      page.getByRole("heading", { name: "My Topics" }),
    ).toBeVisible();
    await expect(page.getByTestId("topics-catalogue-section")).toBeVisible();
    await expect(page.getByTestId("topics-propose-section")).toBeVisible();
    await expect(page.getByTestId("topics-my-proposals-section")).toBeVisible();
    await captureState(page, "topics", "loaded");

    // The first active catalogue Topic's checkbox must be visible; the seed
    // ships the user with two pre-attached active Topics, so two of the
    // three seeded catalogue checkboxes are checked on first render.
    const catalogueCheckboxes = page.getByTestId(/^topics-catalogue-checkbox-/);
    await expect(catalogueCheckboxes.first()).toBeVisible();
    const checkedCount = await catalogueCheckboxes
      .evaluateAll((els) =>
        els.filter((el) => (el as HTMLInputElement).checked).length,
      );
    expect(checkedCount).toBeGreaterThanOrEqual(1);

    // Toggle the first unchecked catalogue row on, then save.
    const uncheckedCheckbox = catalogueCheckboxes
      .locator("input:not([checked])")
      .first();
    await uncheckedCheckbox.check();
    await page.getByTestId("topics-catalogue-save").click();

    await page.waitForURL(/\/me\/topics\?saved=1/);
    await expect(page.getByTestId("topics-saved-indicator")).toBeVisible();
    await captureState(page, "topics", "saved");

    // Navigate fresh and confirm the Saved indicator disappears on the
    // next render without `?saved=1`.
    await page.goto("/");
    await page.goto("/me/topics");
    await expect(page.getByTestId("topics-saved-indicator")).toHaveCount(0);

    // Propose a brand-new Topic. Use a unique candidate name so the
    // similarity threshold never trips across re-runs.
    const candidate = `Brand-new topic ${Date.now()}`;
    await page.getByTestId("topics-propose-input").fill(candidate);
    await page.getByTestId("topics-propose-submit").click();

    await expect(page.getByTestId("topics-propose-success")).toBeVisible();
    await captureState(page, "topics", "pending-proposal");

    // Visit the page afresh and confirm the proposal row appears in My
    // Proposals with the Pending review badge.
    await page.goto("/me/topics");
    await expect(page.getByText(candidate, { exact: false })).toBeVisible();
    await expect(
      page.getByText("Pending review", { exact: false }),
    ).toBeVisible();
  });

  test("similarity failure: a near-duplicate propose names the matching Topic and preserves the input", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/topics");

    // "Product strateg" is one Levenshtein edit away from "Product strategy"
    // (the seeded catalogue row) and lives at similarity > 0.8.
    await page.getByTestId("topics-propose-input").fill("Product strateg");
    await page.getByTestId("topics-propose-submit").click();

    const error = page.getByTestId("topics-propose-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Product strategy");
    await captureState(page, "topics", "similarity-error");

    // The input must preserve the user's value across the round-trip so they
    // can edit and resubmit without retyping.
    await expect(page.getByTestId("topics-propose-input")).toHaveValue(
      "Product strateg",
    );

    // No success banner and no new pending row.
    await expect(page.getByTestId("topics-propose-success")).toHaveCount(0);
  });

  // Cross-journey with T17 (Admin-approves-topic-proposal). Once T17 lands
  // and exposes an Admin approval UI surface, this test drives the full
  // flow — proposing as the User, approving as the Admin, and re-visiting
  // /me/topics as the User to confirm the proposal row now renders the
  // `Active` badge and the corresponding entry appears in the catalogue.
  // Until T17 ships, we mark this test as fixme so the acceptance criterion
  // is documented in this file without the assertion failing the suite.
  test.fixme(
    "cross-journey: post-approval row surfaces active badge after Admin approves",
    async ({ page }) => {
      await page.clock.install({ time: FIXTURE_DATE });
      await page.goto("/me/topics");

      const candidate = `Cross-journey candidate ${Date.now()}`;
      await page.getByTestId("topics-propose-input").fill(candidate);
      await page.getByTestId("topics-propose-submit").click();
      await expect(page.getByTestId("topics-propose-success")).toBeVisible();

      // The Admin approval journey ships in T17. Once it lands, drive it
      // here through the standard `storageState: 'playwright/.auth/admin.json'`
      // context, then re-render /me/topics and assert the badge becomes
      // "Active".
    },
  );
});
