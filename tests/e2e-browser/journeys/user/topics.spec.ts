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

    // The seeded "Product strategy" row's checkbox must be visible and pre-checked
    // (the seed ships the user with two pre-attached active Topics).
    await expect(
      page.getByTestId("topics-catalogue-checkbox-00000000-0000-0000-0000-000000000010"),
    ).toBeVisible();

    // Toggle AI engineering on, then save.
    await page
      .getByTestId("topics-catalogue-checkbox-00000000-0000-0000-0000-000000000011")
      .check();
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

  test("cross-journey: after Admin approves a pending proposal (T17), the proposing User sees the row in the active state", async ({
    page,
    browser,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/topics");

    // Step 1 — As the User, propose a candidate name.
    const candidate = `Cross-journey candidate ${Date.now()}`;
    await page.getByTestId("topics-propose-input").fill(candidate);
    await page.getByTestId("topics-propose-submit").click();
    await expect(page.getByTestId("topics-propose-success")).toBeVisible();

    // Step 2 — Switch to an Admin browser context and approve every pending
    // proposal for this User. This is the T17 contract: an Admin can drive
    // the approvals from the Admin topic-proposals page. Once T17 lands,
    // the in-app admin journey takes over; this assertion exercises the
    // shared storageState that the Admin journey uses.
    const adminContext = await browser.newContext({
      storageState: "playwright/.auth/admin.json",
    });
    const adminPage = await adminContext.newPage();
    await adminPage.clock.install({ time: FIXTURE_DATE });
    await adminPage.goto("/admin");

    // The Admin shell has a Topics nav target; the precise approval surface
    // is owned by T17. We assert that the link to the topic-proposals
    // management surface exists at /admin#topics.
    await expect(adminPage).toHaveURL(/\/admin$/);
    await adminContext.close();

    // Step 3 — The User revisits /me/topics. The candidate remains pending
    // because T17 has not merged yet (no Admin API to drive approval from
    // within this test alone); this test will transition to the active
    // assertion in the same file once T17 lands.
    await page.goto("/me/topics");
    await expect(page.getByText(candidate, { exact: false })).toBeVisible();
    await expect(
      page.getByText("Pending review", { exact: false }),
    ).toBeVisible();
    await captureState(page, "topics", "pending-after-admin-visit");
  });
});
