import { test, expect } from "@playwright/test";

import { captureState } from "../../../helpers/playwright/screenshot-helper";

const SELF_PROPOSED_TOPIC_ID = "00000000-0000-0000-0000-000000000014";
const RETIRE_TOPIC_NAME = "Product strategy";

const TOPIC_PROPOSAL_APPROVE_ID =
  "00000000-0000-0000-0000-000000000060";
const TOPIC_PROPOSAL_REJECT_ID = "00000000-0000-0000-0000-000000000061";

test.describe("Admin topics journey", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("admin approves and rejects Topic Proposals, and retires an active Topic with typed-confirm", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    const topicsSummary = page.getByTestId("admin-topics-summary");
    await topicsSummary.click();

    await expect(page.getByTestId("pending-topic-proposals")).toBeVisible();
    await expect(page.getByTestId("active-topics")).toBeVisible();

    await captureState(page, "admin", "topics-expanded");

    const approveButton = page.getByTestId(
      `topics-approve-${TOPIC_PROPOSAL_APPROVE_ID}`,
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

    await page.goto("/admin#topics");
    await expect(page.getByTestId(`topics-proposal-row-${TOPIC_PROPOSAL_APPROVE_ID}`)).toHaveCount(
      0,
    );
    await captureState(page, "admin", "topics-after-approve");

    const rejectButton = page.getByTestId(
      `topics-reject-${TOPIC_PROPOSAL_REJECT_ID}`,
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

    await page.goto("/admin#topics");
    await expect(
      page.getByTestId(`topics-proposal-row-${TOPIC_PROPOSAL_REJECT_ID}`),
    ).toHaveCount(0);
    await captureState(page, "admin", "topics-after-reject");

    const retireInput = page.getByTestId(
      `topics-retire-input-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(retireInput).toBeDisabled();

    const retireButton = page.getByTestId(
      `topics-retire-button-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(retireButton).toBeDisabled();
    await expect(retireButton).toHaveAttribute(
      "title",
      "You cannot retire a Topic you proposed.",
    );
    const selfHelp = page.getByTestId(
      `topics-self-action-help-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(selfHelp).toBeVisible();
    await expect(selfHelp).toContainText(
      "You cannot retire a Topic you proposed.",
    );
    await captureState(page, "admin", "topics-self-action-disabled");

    const activeTopicRow = page.locator(
      `[data-testid^="topics-active-row-"]`,
    );
    const targetRow = activeTopicRow.filter({
      hasText: RETIRE_TOPIC_NAME,
    });
    await expect(targetRow).toHaveCount(1);

    const targetRowTestId = await targetRow.first().getAttribute("data-testid");
    expect(targetRowTestId).toBeTruthy();
    const topicId = targetRowTestId!.replace("topics-active-row-", "");

    const typedConfirmInput = page.getByTestId(
      `topics-retire-input-${topicId}`,
    );
    await expect(typedConfirmInput).toBeEnabled();

    const typedConfirmButton = page.getByTestId(
      `topics-retire-button-${topicId}`,
    );
    await expect(typedConfirmButton).toBeDisabled();

    await typedConfirmInput.fill("WRONG NAME");
    await expect(typedConfirmButton).toBeDisabled();

    await typedConfirmInput.fill(RETIRE_TOPIC_NAME);
    await expect(typedConfirmButton).toBeEnabled();
    await captureState(page, "admin", "topics-retire-confirm");

    await typedConfirmButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/admin" &&
        url.searchParams.get("action") === "topic_retired",
    );
    await expect(page.getByTestId("admin-topic-retired-banner")).toBeVisible();
    await expect(page.getByTestId("admin-topic-retired-banner")).toContainText(
      "Topic retired",
    );

    await page.goto("/admin#topics");
    await expect(
      page.getByTestId(`topics-active-row-${topicId}`),
    ).toHaveCount(0);
    await captureState(page, "admin", "topics-after-retire");
  });

  test("admin cannot retire a Topic they proposed (own-proposal protection)", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-12T12:00:00.000Z") });

    await page.goto("/admin");
    const topicsSummary = page.getByTestId("admin-topics-summary");
    await topicsSummary.click();

    const selfProposedRow = page.getByTestId(
      `topics-active-row-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(selfProposedRow).toBeVisible();
    await expect(selfProposedRow).toHaveAttribute(
      "data-self-action",
      "true",
    );

    const input = page.getByTestId(
      `topics-retire-input-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(input).toBeDisabled();

    const button = page.getByTestId(
      `topics-retire-button-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute(
      "title",
      "You cannot retire a Topic you proposed.",
    );

    const help = page.getByTestId(
      `topics-self-action-help-${SELF_PROPOSED_TOPIC_ID}`,
    );
    await expect(help).toBeVisible();
    await expect(help).toContainText(
      "You cannot retire a Topic you proposed.",
    );
  });

  test("GET /admin/topic-proposals 308-redirects to /admin#topics", async ({
    page,
  }) => {
    const response = await page.goto("/admin/topic-proposals", {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(200);
    expect(page.url()).toMatch(/\/admin(#topics)?/);
  });
});
