import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

test.describe("Discoverability consent journey", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("user can grant, revoke, and re-grant discoverability consent", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/me/discoverability");

    await expect(
      page.getByRole("heading", { name: "Discoverability consent" }),
    ).toBeVisible();
    await expect(page.getByTestId("discoverability-form")).toBeVisible();
    await captureState(page, "discoverability", "initial");

    await page.getByTestId("discoverability-consent-checkbox").check();
    await page.getByTestId("discoverability-save").click();

    await expect(page.getByTestId("discoverability-granted")).toBeVisible();
    await expect(
      page.getByTestId("discoverability-granted-date"),
    ).toHaveAttribute("datetime", "2026-07-12T12:00:00.000Z");
    await expect(
      page.getByText("Consent granted on"),
    ).toContainText("Consent granted on");
    await captureState(page, "discoverability", "granted");

    await page.getByTestId("discoverability-revoke").click();

    await expect(page.getByTestId("discoverability-form")).toBeVisible();
    await expect(page.getByTestId("discoverability-revoked-note")).toBeVisible();
    await expect(
      page.getByTestId("discoverability-revoked-date"),
    ).toHaveAttribute("datetime", new Date().toISOString());
    await expect(
      page.getByText("Consent revoked on"),
    ).toContainText("Consent revoked on");
    await captureState(page, "discoverability", "revoked");

    await page.getByTestId("discoverability-consent-checkbox").check();
    await page.getByTestId("discoverability-save").click();

    await expect(page.getByTestId("discoverability-granted")).toBeVisible();
    await expect(
      page.getByTestId("discoverability-granted-date"),
    ).toHaveAttribute("datetime", "2026-07-12T12:00:00.000Z");
  });

  test("Save without the consent checkbox surfaces the consent_required inline error", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/me/discoverability");

    await expect(page.getByTestId("discoverability-form")).toBeVisible();

    await page.getByTestId("discoverability-consent-checkbox").uncheck();
    await page.getByTestId("discoverability-save").click();

    await expect(page.getByTestId("discoverability-form")).toBeVisible();
    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toBeVisible();
    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toHaveAttribute("role", "alert");
    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toHaveAttribute("aria-live", "polite");
    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toContainText(/checkbox/i);
    await captureState(page, "discoverability", "error");
  });

  test("re-submitting Save after a successful grant keeps the granted view visible", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/me/discoverability");
    await page.getByTestId("discoverability-consent-checkbox").check();
    await page.getByTestId("discoverability-save").click();

    await expect(page.getByTestId("discoverability-granted")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("discoverability-form")).toBeVisible();

    await page.getByTestId("discoverability-consent-checkbox").check();
    await page.getByTestId("discoverability-save").click();

    await expect(page.getByTestId("discoverability-granted")).toBeVisible();
    await expect(page.getByTestId("discoverability-form")).toHaveCount(0);
  });
});
