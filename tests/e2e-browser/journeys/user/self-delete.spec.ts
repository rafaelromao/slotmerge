import { expect, test, type BrowserContext } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { sealSessionCookieValue } from "../../../../src/auth/session";
import { getDb } from "../../../../src/db/client";
import {
  availabilityOverrides,
  availabilityWindows,
  calendarConnections,
  discoverabilityConsents,
  emailEvents,
  importedBusyIntervals,
  invites,
  sessions,
  topicProposals,
  topics,
  userTopics,
  users,
} from "../../../../src/db/schema";
import { captureState } from "../../../helpers/playwright/screenshot-helper";

const USER_ID = "00000000-0000-0000-0000-000000000295";
const SESSION_ID = "00000000-0000-0000-0000-000000002950";
const TOPIC_ID = "00000000-0000-0000-0000-000000002951";
const CONNECTION_ID = "00000000-0000-0000-0000-000000002952";
const WINDOW_ID = "00000000-0000-0000-0000-000000002953";
const OVERRIDE_ID = "00000000-0000-0000-0000-000000002954";
const BUSY_ID = "00000000-0000-0000-0000-000000002955";
const USER_TOPIC_ID = "00000000-0000-0000-0000-000000002956";
const INVITE_ID = "00000000-0000-0000-0000-000000002957";
const EMAIL_EVENT_ID = "00000000-0000-0000-0000-000000002958";
const UNRELATED_EMAIL_EVENT_ID = "00000000-0000-0000-0000-000000002959";
const PROPOSAL_IDS = [
  "00000000-0000-0000-0000-000000002960",
  "00000000-0000-0000-0000-000000002961",
  "00000000-0000-0000-0000-000000002962",
] as const;
const USER_EMAIL = "self-delete-browser-295@example.com";
const CSRF_TOKEN = "csrf-self-delete-browser-295";
const NOW = new Date("2026-07-12T12:00:00.000Z");

async function cleanupFixture() {
  const db = getDb();
  await db
    .delete(emailEvents)
    .where(inArray(emailEvents.id, [EMAIL_EVENT_ID, UNRELATED_EMAIL_EVENT_ID]));
  await db
    .delete(topicProposals)
    .where(inArray(topicProposals.id, [...PROPOSAL_IDS]));
  await db.delete(invites).where(eq(invites.id, INVITE_ID));
  await db.delete(topics).where(eq(topics.id, TOPIC_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
}

async function seedFixture() {
  await cleanupFixture();
  const db = getDb();
  const expiresAt = new Date("2026-08-12T12:00:00.000Z");

  await db.insert(users).values({
    id: USER_ID,
    email: USER_EMAIL,
    displayName: "Disposable User",
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 5,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(sessions).values({
    id: SESSION_ID,
    userId: USER_ID,
    csrfToken: CSRF_TOKEN,
    expiresAt,
    createdAt: NOW,
  });
  await db.insert(topics).values({
    id: TOPIC_ID,
    name: "Self-delete browser Topic 295",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(userTopics).values({
    id: USER_TOPIC_ID,
    userId: USER_ID,
    topicId: TOPIC_ID,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(topicProposals).values([
    {
      id: PROPOSAL_IDS[0],
      proposedByUserId: USER_ID,
      candidateName: "Self-delete pending proposal 295",
      status: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: PROPOSAL_IDS[1],
      proposedByUserId: USER_ID,
      candidateName: "Self-delete approved proposal 295",
      status: "approved",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: PROPOSAL_IDS[2],
      proposedByUserId: USER_ID,
      candidateName: "Self-delete rejected proposal 295",
      status: "rejected",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  await db.insert(discoverabilityConsents).values({
    userId: USER_ID,
    grantedAt: NOW,
  });
  await db.insert(availabilityWindows).values({
    id: WINDOW_ID,
    userId: USER_ID,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    profileTimezone: "UTC",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(availabilityOverrides).values({
    id: OVERRIDE_ID,
    userId: USER_ID,
    date: "2026-07-15",
    startTime: "12:00",
    endTime: "13:00",
    type: "block",
    profileTimezone: "UTC",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(calendarConnections).values({
    id: CONNECTION_ID,
    userId: USER_ID,
    provider: "google",
    accountIdentifier: USER_EMAIL,
    status: "connected",
    refreshTokenEncrypted: "encrypted-refresh-295",
    accessTokenEncrypted: "encrypted-access-295",
    contributingCalendarIds: ["primary"],
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(importedBusyIntervals).values({
    id: BUSY_ID,
    userId: USER_ID,
    connectionId: CONNECTION_ID,
    providerCalendarId: "primary",
    providerEventReference: "event-295",
    status: "busy",
    startAt: new Date("2026-07-15T15:00:00.000Z"),
    endAt: new Date("2026-07-15T16:00:00.000Z"),
    importedAt: NOW,
  });
  await db.insert(invites).values({
    id: INVITE_ID,
    email: "audit-invite-295@example.com",
    role: "organizer",
    status: "accepted",
    invitedByAdminId: USER_ID,
    expiresAt,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(emailEvents).values([
    {
      id: EMAIL_EVENT_ID,
      recipient: USER_EMAIL,
      type: "magic-link",
      payloadReference: "self-delete-personal-295",
      status: "sent",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: UNRELATED_EMAIL_EVENT_ID,
      recipient: "unrelated-browser-295@example.com",
      type: "magic-link",
      payloadReference: "self-delete-unrelated-295",
      status: "sent",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  return expiresAt;
}

async function authenticate(context: BrowserContext) {
  const expiresAt = await seedFixture();
  const value = await sealSessionCookieValue({ sessionId: SESSION_ID });
  await context.addCookies([
    {
      name: "slotmerge_session",
      value,
      domain: "localhost",
      path: "/",
      expires: Math.floor(expiresAt.getTime() / 1000),
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

async function expectDeletedState() {
  const db = getDb();
  const [userRows, sessionRows, topicRows, consentRows, windowRows] =
    await Promise.all([
      db.select().from(users).where(eq(users.id, USER_ID)),
      db.select().from(sessions).where(eq(sessions.userId, USER_ID)),
      db.select().from(userTopics).where(eq(userTopics.userId, USER_ID)),
      db
        .select()
        .from(discoverabilityConsents)
        .where(eq(discoverabilityConsents.userId, USER_ID)),
      db
        .select()
        .from(availabilityWindows)
        .where(eq(availabilityWindows.userId, USER_ID)),
    ]);
  const [overrideRows, connectionRows, busyRows, personalEmailRows] =
    await Promise.all([
      db
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.userId, USER_ID)),
      db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, USER_ID)),
      db
        .select()
        .from(importedBusyIntervals)
        .where(eq(importedBusyIntervals.userId, USER_ID)),
      db.select().from(emailEvents).where(eq(emailEvents.id, EMAIL_EVENT_ID)),
    ]);

  expect(userRows).toHaveLength(0);
  expect(sessionRows).toHaveLength(0);
  expect(topicRows).toHaveLength(0);
  expect(consentRows).toHaveLength(0);
  expect(windowRows).toHaveLength(0);
  expect(overrideRows).toHaveLength(0);
  expect(connectionRows).toHaveLength(0);
  expect(busyRows).toHaveLength(0);
  expect(personalEmailRows).toHaveLength(0);

  const proposalRows = await db
    .select({ proposedByUserId: topicProposals.proposedByUserId })
    .from(topicProposals)
    .where(inArray(topicProposals.id, [...PROPOSAL_IDS]));
  const inviteRows = await db
    .select({ invitedByAdminId: invites.invitedByAdminId })
    .from(invites)
    .where(eq(invites.id, INVITE_ID));
  const controlledTopicRows = await db
    .select({ id: topics.id })
    .from(topics)
    .where(eq(topics.id, TOPIC_ID));
  const unrelatedEmailRows = await db
    .select({ id: emailEvents.id })
    .from(emailEvents)
    .where(eq(emailEvents.id, UNRELATED_EMAIL_EVENT_ID));

  expect(proposalRows).toHaveLength(3);
  expect(proposalRows.every((row) => row.proposedByUserId === null)).toBe(true);
  expect(inviteRows).toEqual([{ invitedByAdminId: null }]);
  expect(controlledTopicRows).toEqual([{ id: TOPIC_ID }]);
  expect(unrelatedEmailRows).toEqual([{ id: UNRELATED_EMAIL_EVENT_ID }]);
}

test.describe("Self-delete page journey", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await cleanupFixture();
  });

  test("deletes personal data, preserves audit references, and signs the User out", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.clock.install({ time: NOW });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/me/delete");

    await expect(
      page.getByRole("heading", { name: "Delete your account" }),
    ).toHaveCount(1);
    await captureState(page, "self-delete", "loaded");

    const input = page.getByRole("textbox", {
      name: "Type DELETE to confirm",
    });
    const submit = page.getByRole("button", { name: "Delete my account" });
    await input.fill("DELETE");
    await expect(submit).toBeEnabled();
    await captureState(page, "self-delete", "confirmed");
    await input.press("Tab");
    await expect(submit).toBeFocused();
    await submit.click();

    await page.waitForURL("**/sign-in?reason=deleted");
    await expect(page.getByTestId("sign-in-deleted-notice")).toHaveText(
      "Your account has been deleted. The audit log retains your role and invite history.",
    );
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === "slotmerge_session")).toBe(
      false,
    );
    await captureState(page, "self-delete", "deleted");
    await expectDeletedState();
  });

  test("requires an exact confirmation and announces server validation", async ({
    context,
    page,
  }) => {
    await authenticate(context);
    await page.clock.install({ time: NOW });
    await page.goto("/me/delete");

    const input = page.getByRole("textbox", {
      name: "Type DELETE to confirm",
    });
    const submit = page.getByRole("button", { name: "Delete my account" });
    for (const value of ["delete", "DELETE ", " DELETE"]) {
      await input.fill(value);
      await expect(submit).toBeDisabled();
    }

    for (const width of [900, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(input).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    }

    await input.fill("delete");
    await page
      .locator("form[data-testid='delete-account-form']")
      .evaluate((form: HTMLFormElement) => form.submit());
    await page.waitForURL("**/me/delete?error=confirm_mismatch");

    const error = page.getByTestId("delete-account-confirmation-error");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toHaveAttribute("aria-live", "polite");
    await expect(error).toContainText("match DELETE exactly");
    await expect(input).toHaveAttribute(
      "aria-describedby",
      "delete-account-confirmation-error",
    );
    await captureState(page, "self-delete", "invalid");

    const db = getDb();
    await expect
      .poll(async () => {
        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, USER_ID));
        return rows.length;
      })
      .toBe(1);
  });
});
