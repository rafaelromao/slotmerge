import { test, expect } from "@playwright/test";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const FIXTURE_DATE = new Date("2026-07-12T12:00:00.000Z");

test.describe("Profile page journey", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("happy path: save profile, see Saved indicator, indicator disappears on next render", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/profile");

    await expect(
      page.getByRole("heading", { name: "Edit profile" }),
    ).toBeVisible();
    await captureState(page, "profile", "loaded");

    await page.getByTestId("profile-display-name-input").fill("Ada Lovelace");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/New_York");
    await page.getByTestId("profile-buffer-input").fill("30");
    await page
      .getByTestId("profile-bio-input")
      .fill("Computing pioneer and writer on the Analytical Engine.");
    await page
      .getByTestId("profile-avatar-input")
      .fill("https://example.com/ada.png");

    await captureState(page, "profile", "filled");

    await page.getByTestId("profile-save-button").click();

    // The Server Action redirects to /me/profile?saved=1; the Saved
    // indicator must appear on this render.
    await page.waitForURL(/\/me\/profile\?saved=1/);
    await expect(page.getByTestId("profile-saved-indicator")).toBeVisible();
    await expect(page.getByTestId("profile-saved-indicator")).toHaveText(
      "Saved",
    );
    await captureState(page, "profile", "saved");

    // Navigating away and back, then a fresh visit without ?saved=1,
    // must hide the indicator on the next render.
    await page.goto("/");
    await page.goto("/me/profile");
    await expect(page.getByTestId("profile-saved-indicator")).toHaveCount(0);
    await captureState(page, "profile", "saved-then-hidden");
  });

  test("display name validation: empty value produces an inline error and preserves the other inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/profile");

    await page.getByTestId("profile-display-name-input").fill("Grace Hopper");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/Los_Angeles");
    await page.getByTestId("profile-buffer-input").fill("15");
    await page
      .getByTestId("profile-avatar-input")
      .fill("https://example.com/grace.png");
    await page.getByTestId("profile-bio-input").fill("Compiler pioneer");

    // Clear the display name (after a valid initial value) to trigger validation.
    await page.getByTestId("profile-display-name-input").fill("");
    await page.getByTestId("profile-save-button").click();

    await expect(
      page.getByTestId("profile-display-name-error"),
    ).toBeVisible();

    // Other inputs are preserved.
    await expect(page.getByTestId("profile-timezone-select")).toHaveValue(
      "America/Los_Angeles",
    );
    await expect(page.getByTestId("profile-buffer-input")).toHaveValue("15");
    await expect(page.getByTestId("profile-avatar-input")).toHaveValue(
      "https://example.com/grace.png",
    );
    await expect(page.getByTestId("profile-bio-input")).toHaveValue(
      "Compiler pioneer",
    );
    await captureState(page, "profile", "error-display-name");
  });

  test("timezone validation: unsupported value produces an inline error and preserves the other inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/profile");

    await page.getByTestId("profile-display-name-input").fill("Grace Hopper");
    // The select only contains IANA names from Intl.supportedValuesOf; to
    // exercise the server-side validator we set the raw value via JS and
    // submit. The browser won't surface this option through the picker.
    await page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>(
        '[data-testid="profile-timezone-select"]',
      );
      if (!select) throw new Error("timezone select not found");
      const option = document.createElement("option");
      option.value = "Mars/Olympus_Mons";
      option.textContent = "Mars/Olympus_Mons";
      option.selected = true;
      select.appendChild(option);
    });
    await page.getByTestId("profile-buffer-input").fill("15");
    await page.getByTestId("profile-save-button").click();

    await expect(page.getByTestId("profile-timezone-error")).toBeVisible();

    await expect(page.getByTestId("profile-display-name-input")).toHaveValue(
      "Grace Hopper",
    );
    await expect(page.getByTestId("profile-buffer-input")).toHaveValue("15");
    await captureState(page, "profile", "error-timezone");
  });

  test("buffer validation: out-of-range value produces an inline error and preserves the other inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/profile");

    await page.getByTestId("profile-display-name-input").fill("Grace Hopper");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/Los_Angeles");
    await page.getByTestId("profile-buffer-input").fill("999");
    await page.getByTestId("profile-save-button").click();

    await expect(page.getByTestId("profile-buffer-error")).toBeVisible();

    await expect(page.getByTestId("profile-display-name-input")).toHaveValue(
      "Grace Hopper",
    );
    await expect(page.getByTestId("profile-timezone-select")).toHaveValue(
      "America/Los_Angeles",
    );
    await captureState(page, "profile", "error-buffer");
  });

  test("avatar validation: http:// URL produces an inline error and preserves the other inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/profile");

    await page.getByTestId("profile-display-name-input").fill("Grace Hopper");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/Los_Angeles");
    await page.getByTestId("profile-buffer-input").fill("15");
    await page
      .getByTestId("profile-avatar-input")
      .fill("http://insecure.example.com/grace.png");
    await page.getByTestId("profile-save-button").click();

    await expect(page.getByTestId("profile-avatar-error")).toBeVisible();

    await expect(page.getByTestId("profile-display-name-input")).toHaveValue(
      "Grace Hopper",
    );
    await expect(page.getByTestId("profile-timezone-select")).toHaveValue(
      "America/Los_Angeles",
    );
    await expect(page.getByTestId("profile-buffer-input")).toHaveValue("15");
    await captureState(page, "profile", "error-avatar");
  });

  test("bio validation: longer than 280 chars produces an inline error and preserves the other inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXTURE_DATE });
    await page.goto("/me/profile");

    await page.getByTestId("profile-display-name-input").fill("Grace Hopper");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/Los_Angeles");
    await page.getByTestId("profile-buffer-input").fill("15");
    await page.getByTestId("profile-bio-input").fill("x".repeat(281));
    await page.getByTestId("profile-save-button").click();

    await expect(page.getByTestId("profile-bio-error")).toBeVisible();

    await expect(page.getByTestId("profile-display-name-input")).toHaveValue(
      "Grace Hopper",
    );
    await expect(page.getByTestId("profile-timezone-select")).toHaveValue(
      "America/Los_Angeles",
    );
    await expect(page.getByTestId("profile-buffer-input")).toHaveValue("15");
    await captureState(page, "profile", "error-bio");
  });
});
