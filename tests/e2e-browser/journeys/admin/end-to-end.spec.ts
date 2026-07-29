import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getDb } from "../../../../src/db/client";
import { invites, users } from "../../../../src/db/schema";
import { FIXTURE_DATE, USER_FIXTURES, seedAll } from "../../../fixtures/seeds";
import { captureState } from "../../../helpers/playwright/screenshot-helper";
import { resetAdminFixtures } from "../../../helpers/playwright/admin-fixtures";

const FIXED_DATE = new Date(FIXTURE_DATE);
const ADMIN_ID = USER_FIXTURES[2].id;
const TARGET_USER_ID = USER_FIXTURES[0].id;
const TARGET_USER_EMAIL = USER_FIXTURES[0].email;

const NEW_INVITE_EMAIL = "t19-end-to-end-admin-journey-305@example.com";
const MASKED_INVITE_EMAIL = "t1***@example.com";

const APPROVE_PROPOSAL_ID = "00000000-0000-0000-0000-000000000060";
const APPROVE_PROPOSAL_NAME = "Engineering management";
const REJECT_PROPOSAL_ID = "00000000-0000-0000-0000-000000000061";
const REJECT_PROPOSAL_NAME = "Distributed tracing";

const RETIRE_TOPIC_ID = "00000000-0000-0000-0000-000000000010";
const RETIRE_TOPIC_NAME = "Product strategy";

// One storageState at the file top matches the Organizer pattern
// (`tests/e2e-browser/journeys/organizer/end-to-end.spec.ts:72`). Each
// `test.describe` block below owns a single Admin surface so a failure
// points at the right surface in the Playwright HTML report and in the
// per-test WebM.
test.use({ storageState: "playwright/.auth/admin.json" });

async function resetFixtures(): Promise<void> {
  await resetAdminFixtures(getDb());
}

test.describe("invite surface", () => {
  test.beforeEach(async () => {
    const db = getDb();
    await seedAll(db);
    await db.delete(invites).where(eq(invites.email, NEW_INVITE_EMAIL));
  });

  test("admin invites a new User, the page re-renders with the masked-email banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByTestId("invite-form")).toBeVisible();
    await expect(page.getByTestId("users-table")).toBeVisible();

    await page.getByTestId("invite-email").fill(NEW_INVITE_EMAIL);
    await page.getByTestId("invite-role").selectOption("user");
    await page.getByTestId("invite-submit").click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("invited") === MASKED_INVITE_EMAIL,
    );

    const banner = page.getByTestId("invite-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(MASKED_INVITE_EMAIL);

    await captureState(page, "admin/users", "invite-banner");

    const recentInvitesSection = page.getByTestId("recent-invites");
    await expect(recentInvitesSection).toContainText(NEW_INVITE_EMAIL);
  });
});

test.describe("role change surface", () => {
  test.beforeEach(async () => {
    await resetFixtures();
  });

  test("admin changes a non-self User's role, the page re-renders with the Role updated banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    const targetRow = page.getByTestId(`users-row-${TARGET_USER_ID}`);
    await expect(targetRow).toBeVisible();

    await page
      .getByTestId(`users-role-select-${TARGET_USER_ID}`)
      .selectOption("organizer");
    await page.getByTestId(`users-role-save-${TARGET_USER_ID}`).click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("role_change") === "saved",
    );
    await expect(page.getByTestId("admin-role-change-banner")).toBeVisible();
    await expect(page.getByTestId("admin-role-change-banner")).toContainText(
      "Role updated.",
    );

    await captureState(page, "admin/users", "role-changed");

    const updatedSelect = page.getByTestId(
      `users-role-select-${TARGET_USER_ID}`,
    );
    await expect(updatedSelect).toHaveValue("organizer");
  });
});

test.describe("suspend surface", () => {
  test.beforeEach(async () => {
    await resetFixtures();
  });
  test.afterEach(async () => {
    await resetFixtures();
  });

  test("admin suspends a non-self User with typed-confirm, the page re-renders with the Suspended banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    const confirmInput = page.getByTestId(
      `suspend-confirm-input-${TARGET_USER_ID}`,
    );
    const suspendButton = page.getByTestId(
      `suspend-confirm-button-${TARGET_USER_ID}`,
    );
    await expect(suspendButton).toBeDisabled();

    await confirmInput.fill("wrong@example.com");
    await expect(suspendButton).toBeDisabled();

    await confirmInput.fill(TARGET_USER_EMAIL);
    await expect(suspendButton).toBeEnabled();
    await captureState(page, "admin/users", "suspend-confirm");

    await suspendButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "suspended",
    );
    await expect(page.getByTestId("admin-suspend-banner")).toBeVisible();
    await expect(page.getByTestId("admin-suspend-banner")).toContainText(
      "User suspended",
    );

    await expect(page.getByTestId(`users-status-${TARGET_USER_ID}`)).toHaveText(
      "Suspended",
    );

    await captureState(page, "admin/users", "suspended");

    const reinstateButton = page.getByTestId(
      `users-reinstate-button-${TARGET_USER_ID}`,
    );
    await expect(reinstateButton).toBeVisible();
  });
});

test.describe("reinstate surface", () => {
  test.beforeEach(async () => {
    const db = getDb();
    await seedAll(db);
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, TARGET_USER_ID));
  });

  test("admin reinstates a suspended User with a single click, the page re-renders with the Reinstated banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    await expect(page.getByTestId(`users-status-${TARGET_USER_ID}`)).toHaveText(
      "Suspended",
    );

    const reinstateButton = page.getByTestId(
      `users-reinstate-button-${TARGET_USER_ID}`,
    );
    await expect(reinstateButton).toBeVisible();
    await reinstateButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "reinstated",
    );
    await expect(page.getByTestId("admin-reinstate-banner")).toBeVisible();
    await expect(page.getByTestId("admin-reinstate-banner")).toContainText(
      "User reinstated.",
    );

    await expect(page.getByTestId(`users-status-${TARGET_USER_ID}`)).toHaveText(
      "Active",
    );

    await captureState(page, "admin/users", "reinstated");
  });
});

test.describe("approve proposal surface", () => {
  test.beforeEach(async () => {
    await resetFixtures();
  });
  test.afterEach(async () => {
    await resetFixtures();
  });

  test("admin approves a pending Topic Proposal, the page re-renders with the Topic proposal approved banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin#topics");

    await expect(page.getByTestId("admin-topics-summary")).toBeVisible();
    await expect(page.getByTestId("pending-topic-proposals")).toBeVisible();

    const approveButton = page.getByTestId(
      `topics-approve-${APPROVE_PROPOSAL_ID}`,
    );
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "topic_approved",
    );
    await expect(page.getByTestId("admin-topic-approved-banner")).toBeVisible();
    await expect(page.getByTestId("admin-topic-approved-banner")).toContainText(
      "Topic proposal approved",
    );

    await captureState(page, "admin/topics", "approve-proposal");

    await page.goto("/admin#topics");
    await expect(
      page.getByTestId(`topics-proposal-row-${APPROVE_PROPOSAL_ID}`),
    ).toHaveCount(0);

    await expect(page.getByTestId("active-topics-table")).toContainText(
      APPROVE_PROPOSAL_NAME,
    );
  });
});

test.describe("reject proposal surface", () => {
  test.beforeEach(async () => {
    await resetFixtures();
  });

  test("admin rejects a pending Topic Proposal, the page re-renders with the Topic proposal rejected banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin#topics");

    await expect(page.getByTestId("admin-topics-summary")).toBeVisible();
    await expect(page.getByTestId("pending-topic-proposals")).toBeVisible();

    const rejectButton = page.getByTestId(
      `topics-reject-${REJECT_PROPOSAL_ID}`,
    );
    await expect(rejectButton).toBeVisible();
    await rejectButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "topic_rejected",
    );
    await expect(page.getByTestId("admin-topic-rejected-banner")).toBeVisible();
    await expect(page.getByTestId("admin-topic-rejected-banner")).toContainText(
      "Topic proposal rejected.",
    );

    await captureState(page, "admin/topics", "reject-proposal");

    await page.goto("/admin#topics");
    await expect(
      page.getByTestId(`topics-proposal-row-${REJECT_PROPOSAL_ID}`),
    ).toHaveCount(0);

    // The reject action does not create a new Topic; the proposal
    // candidateName must not appear in the Active Topics table.
    await expect(page.getByTestId("active-topics-table")).not.toContainText(
      REJECT_PROPOSAL_NAME,
    );
  });
});

test.describe("retire topic surface", () => {
  test.beforeEach(async () => {
    const db = getDb();
    await seedAll(db);
  });

  test("admin retires an active Topic with typed-confirm, the page re-renders with the Topic retired banner", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin#topics");

    await expect(page.getByTestId("admin-topics-summary")).toBeVisible();
    await expect(page.getByTestId("active-topics")).toBeVisible();

    const retireInput = page.getByTestId(
      `topics-retire-input-${RETIRE_TOPIC_ID}`,
    );
    const retireButton = page.getByTestId(
      `topics-retire-button-${RETIRE_TOPIC_ID}`,
    );
    await expect(retireInput).toBeEnabled();
    await expect(retireButton).toBeDisabled();

    await retireInput.fill("WRONG NAME");
    await expect(retireButton).toBeDisabled();

    await retireInput.fill(RETIRE_TOPIC_NAME);
    await expect(retireButton).toBeEnabled();
    await captureState(page, "admin/topics", "retire-confirm");

    await retireButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "topic_retired",
    );
    await expect(page.getByTestId("admin-topic-retired-banner")).toBeVisible();
    await expect(page.getByTestId("admin-topic-retired-banner")).toContainText(
      "Topic retired",
    );

    await captureState(page, "admin/topics", "retired");

    await page.goto("/admin#topics");
    await expect(
      page.getByTestId(`topics-active-row-${RETIRE_TOPIC_ID}`),
    ).toHaveCount(0);
  });
});

test.describe("status surface", () => {
  test.beforeEach(async () => {
    await resetFixtures();
  });

  test("admin opens the Status section, all three sub-blocks render with green pills", async ({
    page,
  }) => {
    await page.clock.install({ time: FIXED_DATE });
    await page.goto("/admin#status");

    await expect(page.getByTestId("admin-status-section")).toBeVisible();
    await expect(page.getByTestId("admin-status-email-block")).toBeVisible();
    await expect(page.getByTestId("admin-status-calendar-block")).toBeVisible();
    await expect(page.getByTestId("admin-status-tokens-block")).toBeVisible();

    await expect(page.getByTestId("admin-status-email-pill")).toHaveAttribute(
      "data-status",
      "green",
    );
    await expect(
      page.getByTestId("admin-status-calendar-pill"),
    ).toHaveAttribute("data-status", "green");
    await expect(page.getByTestId("admin-status-tokens-pill")).toHaveAttribute(
      "data-status",
      "green",
    );

    await captureState(page, "admin/status", "expanded");

    // Self-action protection cross-check: the Admin's own role-change
    // controls are disabled. The deeper self-suspend and self-retire
    // guards are exercised by the per-surface specs
    // (`users.spec.ts:50-63` for self-row-disabled and
    // `topics.spec.ts:146-185` for own-proposal retire).
    await expect(
      page.getByTestId(`users-role-select-${ADMIN_ID}`),
    ).toBeDisabled();
    await expect(
      page.getByTestId(`users-role-save-${ADMIN_ID}`),
    ).toBeDisabled();

    const html = await page.content();
    expect(html).not.toContain("Refresh now");
    expect(html).not.toContain("Send critical operational email");
  });
});
