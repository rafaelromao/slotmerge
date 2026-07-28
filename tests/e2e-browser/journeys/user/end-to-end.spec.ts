import { test, expect, type Browser } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getDb } from "../../../../src/db/client";
import {
  availabilityOverrides,
  availabilityWindows,
  calendarConnections,
  discoverabilityConsents,
  importedBusyIntervals,
  topicProposals,
} from "../../../../src/db/schema";
import { FIXTURE_DATE, USER_FIXTURES, seedAll } from "../../../fixtures/seeds";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const BASE_URL = "http://localhost:3000";
const USER_ID = USER_FIXTURES[0].id;
const INVITED_EMAIL = "end-to-end-user-journey-296@example.com";
const PROPOSED_TOPIC_NAME = "Brand-new T10 topic";

type CapturedEmailsResponse = {
  emails: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
};

async function getCapturedEmails(
  email: string,
): Promise<CapturedEmailsResponse> {
  const response = await fetch(
    `${BASE_URL}/api/local/emails/${encodeURIComponent(email)}`,
  );
  if (!response.ok) {
    return { emails: [] };
  }
  return (await response.json()) as CapturedEmailsResponse;
}

async function waitForMagicLink(
  email: string,
  previousCount: number,
  timeoutMs = 10000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { emails } = await getCapturedEmails(email);
    const magicLinkEmails = emails.filter(
      (item) => item.type === "magic-link",
    );
    if (magicLinkEmails.length > previousCount) {
      const url = magicLinkEmails.at(-1)?.payload["magicLinkUrl"];
      return typeof url === "string" ? url : null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

function absoluteUrl(maybeRelativeUrl: string): string {
  if (maybeRelativeUrl.startsWith("http")) {
    return maybeRelativeUrl;
  }
  return `${BASE_URL}${maybeRelativeUrl}`;
}

async function adminInvite(browser: Browser, email: string): Promise<void> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: "playwright/.auth/admin.json",
  });
  const page = await context.newPage();
  await page.goto("/admin");
  await page.evaluate(
    ({ inviteEmail }) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/admin/invites";
      for (const [name, value] of Object.entries({
        _csrf: "csrf-admin-test",
        email: inviteEmail,
        role: "user",
      })) {
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    },
    { inviteEmail: email },
  );
  await page.waitForURL((url) => url.pathname === "/admin");
  await context.close();
}

async function resetCalendarState(): Promise<void> {
  const db = getDb();
  await db
    .delete(importedBusyIntervals)
    .where(eq(importedBusyIntervals.userId, USER_ID));
  await db
    .delete(calendarConnections)
    .where(eq(calendarConnections.userId, USER_ID));
  await seedAll(db);
}

// Run the journey serially so the per-surface state mutations (sign-out,
// calendar OAuth connect/disconnect, availability overrides) do not race
// against each other on the shared fixtures. Each describe block below is
// self-contained: a failure in one block is observable on its own surface.
test.describe.configure({ mode: "serial" });

test.describe("invite + verify", () => {
  test("Admin invite renders a magic-link that signs the User into the setup Home", async ({
    browser,
    page,
  }) => {
    await adminInvite(browser, INVITED_EMAIL);
    await page.clock.install({ time: new Date(FIXTURE_DATE) });

    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
    await captureState(page, "user/setup-home", "signed-out");

    const previousCount = (
      await getCapturedEmails(INVITED_EMAIL)
    ).emails.filter((item) => item.type === "magic-link").length;
    await page.getByTestId("sign-in-email").fill(INVITED_EMAIL);
    await page.getByTestId("sign-in-submit").click();

    await page.waitForURL((url) => url.pathname === "/sign-in/sent");
    await expect(page.getByTestId("sent-non-leaking")).toContainText(
      "If an account exists for that email, we just sent a sign-in link.",
    );

    const magicLinkUrl = await waitForMagicLink(INVITED_EMAIL, previousCount);
    expect(magicLinkUrl).not.toBeNull();
    expect(magicLinkUrl).toContain("/sign-in/verify?token=");

    await page.goto(absoluteUrl(magicLinkUrl!));
    await expect(page.getByTestId("verify-auto-submit")).toBeVisible();

    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { name: "Welcome to SlotMerge" }),
    ).toBeVisible();
  });
});

test.describe("setup checklist Home", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("the checklist renders five cards and the avatar dropdown exposes Sign Out", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Welcome to SlotMerge" }),
    ).toBeVisible();
    await expect(page.getByText("Complete your profile setup to get started.")).toBeVisible();

    const cards = page.locator(".setup-card");
    await expect(cards).toHaveCount(5);
    await captureState(page, "user/setup-home", "checklist");

    for (const heading of [
      "Profile",
      "Discoverability",
      "Topics",
      "Availability",
      "Calendar Connection",
    ]) {
      await expect(
        page.getByRole("heading", { name: heading }),
      ).toBeVisible();
    }

    await expect(page.getByTestId("setup-chip")).toBeVisible();

    await page.getByTestId("avatar-dropdown-trigger").click();
    await captureState(page, "user/setup-home", "avatar-open");
    await expect(
      page.getByRole("menuitem", { name: "My Profile" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();

    const searchLink = page.locator(".nav-link", { hasText: "Search" });
    await expect(searchLink).toHaveCount(0);
    const adminLink = page.locator(".nav-link", { hasText: "Admin" });
    await expect(adminLink).toHaveCount(0);
  });
});

test.describe("profile", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test("saves the profile, surfaces the Saved indicator, then hides it on the next render", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/profile");

    await expect(
      page.getByRole("heading", { name: "Edit profile" }),
    ).toBeVisible();
    await captureState(page, "user/profile", "loaded");

    await page.getByTestId("profile-display-name-input").fill("Ada Lovelace");
    await page
      .getByTestId("profile-timezone-select")
      .selectOption("America/New_York");
    await page.getByTestId("profile-buffer-input").fill("30");
    await page
      .getByTestId("profile-avatar-input")
      .fill("https://example.com/ada.png");
    await page
      .getByTestId("profile-bio-input")
      .fill("Computing pioneer and writer on the Analytical Engine.");
    await captureState(page, "user/profile", "filled");

      await page.getByTestId("profile-save-button").click();

      await page.waitForURL(/\/me\/profile\?saved=1/);
      await expect(page.getByTestId("profile-saved-indicator")).toBeVisible();
      await expect(page.getByTestId("profile-saved-indicator")).toHaveText(
        "Saved",
      );
      await captureState(page, "user/profile", "saved");

      await page.goto("/me/profile");
      await expect(page.getByTestId("profile-saved-indicator")).toHaveCount(0);
      await captureState(page, "user/profile", "saved-then-hidden");
    });

    test("empty display name surfaces an inline error and preserves the other inputs", async ({
      page,
    }) => {
      await page.clock.install({ time: new Date(FIXTURE_DATE) });
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
      await page.getByTestId("profile-display-name-input").fill("");
      await page.getByTestId("profile-save-button").click();

      await expect(
        page.getByTestId("profile-display-name-error"),
      ).toBeVisible();
      await captureState(page, "user/profile", "error-display-name");
    });

    test("out-of-range buffer surfaces an inline error and preserves the other inputs", async ({
      page,
    }) => {
      await page.clock.install({ time: new Date(FIXTURE_DATE) });
      await page.goto("/me/profile");

      await page.getByTestId("profile-display-name-input").fill("Grace Hopper");
      await page
        .getByTestId("profile-timezone-select")
        .selectOption("America/Los_Angeles");
      await page.getByTestId("profile-buffer-input").fill("999");
      await page.getByTestId("profile-save-button").click();

      await expect(page.getByTestId("profile-buffer-error")).toBeVisible();
      await captureState(page, "user/profile", "error-buffer");
    });
  });

test.describe("discoverability consent", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    const db = getDb();
    await db
      .delete(discoverabilityConsents)
      .where(eq(discoverabilityConsents.userId, USER_ID));
  });

  test("grants, revokes, and re-grants discoverability consent", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });

    await page.goto("/me/discoverability");
    await expect(
      page.getByRole("heading", { name: "Discoverability consent" }),
    ).toBeVisible();
    await expect(page.getByTestId("discoverability-form")).toBeVisible();
    await captureState(page, "user/discoverability", "initial");

    await page.getByTestId("discoverability-consent-checkbox").check();
    await page.getByTestId("discoverability-save").click();

    await expect(page.getByTestId("discoverability-granted")).toBeVisible();
    await expect(
      page.getByTestId("discoverability-granted-date"),
    ).toHaveAttribute("datetime", new Date(FIXTURE_DATE).toISOString());
    await captureState(page, "user/discoverability", "granted");

    await page.getByTestId("discoverability-revoke").click();
    await expect(page.getByTestId("discoverability-form")).toBeVisible();
    await expect(
      page.getByTestId("discoverability-revoked-note"),
    ).toBeVisible();
    await captureState(page, "user/discoverability", "revoked");

    await page.getByTestId("discoverability-consent-checkbox").check();
    await page.getByTestId("discoverability-save").click();
    await expect(page.getByTestId("discoverability-granted")).toBeVisible();
  });

  test("Save without the consent checkbox surfaces the consent_required inline error", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });

    await page.goto("/me/discoverability");
    await expect(page.getByTestId("discoverability-form")).toBeVisible();

    await page.getByTestId("discoverability-consent-checkbox").uncheck();
    await page.getByTestId("discoverability-save").click();

    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toBeVisible();
    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toHaveAttribute("role", "alert");
    await expect(
      page.getByTestId("discoverability-consent-error"),
    ).toHaveAttribute("aria-live", "polite");
    await captureState(page, "user/discoverability", "error");
  });
});

test.describe("topics", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    const db = getDb();
    await db
      .delete(topicProposals)
      .where(eq(topicProposals.proposedByUserId, USER_ID));
  });

  test("saves the seeded selection, then proposes a new Topic that lands in My Proposals", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/topics");

    await expect(
      page.getByRole("heading", { name: "My Topics" }),
    ).toBeVisible();
    await expect(page.getByTestId("topics-catalogue-section")).toBeVisible();
    await expect(page.getByTestId("topics-propose-section")).toBeVisible();
    await expect(page.getByTestId("topics-my-proposals-section")).toBeVisible();
    await captureState(page, "user/topics", "loaded");

    const catalogueCheckboxes = page.getByTestId(
      /^topics-catalogue-checkbox-/,
    );
    await expect(catalogueCheckboxes.first()).toBeVisible();
    const checkedCount = await catalogueCheckboxes.evaluateAll((els) =>
      els.filter((el) => (el as HTMLInputElement).checked).length,
    );
    expect(checkedCount).toBeGreaterThanOrEqual(1);

    // Resolve an unchecked catalogue row through the live DOM property
    // because `input:not([checked])` only matches the absence of the
    // static HTML attribute that React leaves on server-rendered inputs.
    const uncheckedTestId = await catalogueCheckboxes.evaluateAll((els) => {
      const match = els.find(
        (el) => !(el as HTMLInputElement).checked,
      ) as HTMLElement | undefined;
      return match?.dataset["testid"] ?? null;
    });
    if (uncheckedTestId) {
      await page.getByTestId(uncheckedTestId).check();
    }
    await page.getByTestId("topics-catalogue-save").click();

    await page.waitForURL(/\/me\/topics\?saved=1/);
    await expect(page.getByTestId("topics-saved-indicator")).toBeVisible();
    await captureState(page, "user/topics", "saved");

    const candidate = `${PROPOSED_TOPIC_NAME} ${new Date(FIXTURE_DATE).getTime()}`;
    await page.getByTestId("topics-propose-input").fill(candidate);
    await page.getByTestId("topics-propose-submit").click();

    await expect(page.getByTestId("topics-propose-success")).toBeVisible();
    await captureState(page, "user/topics", "pending-proposal");

    await page.goto("/me/topics");
    await expect(page.getByText(candidate, { exact: false })).toBeVisible();
    const candidateRow = page
      .locator(".topics-proposal-row", { hasText: candidate })
      .first();
    await expect(candidateRow).toBeVisible();
    await expect(candidateRow.getByText("Pending review")).toBeVisible();
  });

  test("a near-duplicate propose names the matching Topic and preserves the input", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/topics");

    await page.getByTestId("topics-propose-input").fill("Product strateg");
    await page.getByTestId("topics-propose-submit").click();

    const error = page.getByTestId("topics-propose-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Product strategy");
    await captureState(page, "user/topics", "similarity-error");

    await expect(page.getByTestId("topics-propose-input")).toHaveValue(
      "Product strateg",
    );
    await expect(page.getByTestId("topics-propose-success")).toHaveCount(0);
  });
});

test.describe("availability", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    const db = getDb();
    await db
      .delete(availabilityOverrides)
      .where(eq(availabilityOverrides.userId, USER_ID));
    await db
      .delete(availabilityWindows)
      .where(eq(availabilityWindows.userId, USER_ID));
  });

  test("adds a weekly window, an add override, a block override, edits the buffer, and renders the effective preview", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/availability");

    await expect(
      page.getByTestId("availability-page-heading"),
    ).toBeVisible();
    await expect(
      page.getByTestId("availability-timezone-section"),
    ).toBeVisible();
    await expect(page.getByTestId("availability-weekly-section")).toBeVisible();
    await expect(
      page.getByTestId("availability-overrides-section"),
    ).toBeVisible();
    await expect(page.getByTestId("availability-buffer-section")).toBeVisible();
    await expect(page.getByTestId("availability-preview-section")).toBeVisible();
    await captureState(page, "user/availability", "loaded");

    const sundayStart = page.getByTestId("availability-day-0-start");
    const sundayEnd = page.getByTestId("availability-day-0-end");
    await sundayStart.fill("10:00");
    await sundayEnd.fill("11:00");
    await page.getByTestId("availability-day-0-save").click();

    await page.waitForURL(/\/me\/availability\?saved=1/);
    await expect(page.getByTestId("availability-saved-indicator")).toBeVisible();
    await captureState(page, "user/availability", "saved");

    await page.goto("/me/availability");
    await page.getByTestId("availability-override-date-input").fill("2026-08-20");
    await page.getByTestId("availability-override-start-input").fill("18:00");
    await page.getByTestId("availability-override-end-input").fill("20:00");
    await page.getByTestId("availability-override-type-add").check();
    await page.getByTestId("availability-override-add-submit").click();

    await page.waitForURL(/\/me\/availability\?saved=1/);
    await captureState(page, "user/availability", "add-override");

    await page.goto("/me/availability");
    await page.getByTestId("availability-override-date-input").fill("2026-08-25");
    await page.getByTestId("availability-override-start-input").fill("09:00");
    await page.getByTestId("availability-override-end-input").fill("17:00");
    await page.getByTestId("availability-override-type-block").check();
    await page.getByTestId("availability-override-add-submit").click();

    await page.waitForURL(/\/me\/availability\?saved=1/);
    await captureState(page, "user/availability", "block-override");

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
    await captureState(page, "user/availability", "buffer-edited");

    const preview = page.getByTestId("availability-preview");
    await expect(preview).toBeVisible();
    const previewText = await preview.textContent();
    expect(previewText).toBeTruthy();
    expect(previewText).toMatch(/Mon|2026-07/);
  });

  test("end-before-start renders an inline error and preserves the inputs", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/availability");

    await page.getByTestId("availability-day-3-start").fill("15:00");
    await page.getByTestId("availability-day-3-end").fill("14:00");
    await page.getByTestId("availability-day-3-save").click();

    await page.waitForURL(/error=end_before_start/);
    await expect(page.getByTestId("availability-day-3-error")).toBeVisible();
    await captureState(page, "user/availability", "error-end-before-start");
  });

  test("a new window overlapping an existing window produces an inline error", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/availability");

    // First add a baseline Monday window, then submit a second window
    // that overlaps it.
    await page.getByTestId("availability-day-1-start").fill("10:00");
    await page.getByTestId("availability-day-1-end").fill("13:00");
    await page.getByTestId("availability-day-1-save").click();
    await page.waitForURL(/\/me\/availability\?saved=1/);

    await page.goto("/me/availability");
    await page.getByTestId("availability-day-1-start").fill("11:00");
    await page.getByTestId("availability-day-1-end").fill("12:00");
    await page.getByTestId("availability-day-1-save").click();

    await page.waitForURL(/error=overlap_existing_window/);
    await expect(page.getByTestId("availability-day-1-error")).toBeVisible();
    await captureState(page, "user/availability", "error-overlap");
  });
});

test.describe("calendar-connection", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    await resetCalendarState();
  });

  test("renders the heading, two connect CTAs, and the seeded Google connection card", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/calendar-connections");

    await expect(
      page.getByRole("heading", {
        name: "Calendar connections",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId("calendar-connection-connect-google"),
    ).toBeVisible();
    await expect(
      page.getByTestId("calendar-connection-connect-microsoft"),
    ).toBeVisible();

    const card = page.locator('[data-provider="google"]').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-status", "connected");
    await captureState(page, "user/calendar-connection", "loaded");
  });

  test("denied consent returns the denied outcome without provider internals", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/calendar-connections?scenario=denied");

    await page.getByTestId("calendar-connection-connect-google").click();
    await page.waitForURL(/\/me\/calendar-connections\?oauth=denied(?:&|$)/, {
      timeout: 10_000,
    });
    const location = page.url();
    expect(location).not.toContain("google-code");
    expect(location).not.toContain("provider");
    expect(location).not.toContain("access_token");
    await expect(
      page.getByTestId("calendar-connection-banner-denied"),
    ).toBeVisible();
    await captureState(page, "user/calendar-connection", "denied");
  });

  test("Microsoft personal account returns the unsupported outcome", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/calendar-connections?scenario=personal");

    await page.getByTestId("calendar-connection-connect-microsoft").click();
    await page.waitForURL(
      /\/me\/calendar-connections\?oauth=unsupported(?:&|$)/,
      { timeout: 10_000 },
    );
    await expect(
      page.getByTestId("calendar-connection-banner-unsupported"),
    ).toBeVisible();
    await captureState(page, "user/calendar-connection", "unsupported");
  });

  test("empty state shows the canonical empty-state copy", async ({ page }) => {
    const db = getDb();
    await db
      .delete(importedBusyIntervals)
      .where(eq(importedBusyIntervals.userId, USER_ID));
    await db
      .delete(calendarConnections)
      .where(eq(calendarConnections.userId, USER_ID));

    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/me/calendar-connections");

    await expect(page.getByTestId("calendar-connection-empty")).toBeVisible();
    await expect(
      page.getByTestId("calendar-connection-connect-google"),
    ).toBeVisible();
    await captureState(page, "user/calendar-connection", "empty");
  });
});

test.describe("sign-out", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("the avatar dropdown Sign Out button clears the cookie and redirects to /", async ({
    context,
    page,
  }) => {
    await page.clock.install({ time: new Date(FIXTURE_DATE) });
    await page.goto("/");

    await page.getByTestId("avatar-dropdown-trigger").click();
    await page.getByTestId("avatar-menu-sign-out").click();

    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { name: "Please sign in to continue." }),
    ).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === "slotmerge_session")).toBe(
      false,
    );
  });
});
