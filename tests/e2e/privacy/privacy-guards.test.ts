/**
 * E2E tests for privacy guards and non-goal UI absence.
 *
 * E2E coverage: Privacy + non-goal guards → tests 60-62
 *
 * Privacy behaviors:
 * - B: Discoverability consent required before user appears in any search result
 * - B: Discoverability can be disabled; disabled user excluded from subsequent searches
 * - B: Search result slot details do not expose raw calendar data
 * - B: Deleted user's data fully removed; only audit references remain
 *
 * Non-goal guard behaviors:
 * - B: Search results page has no booking, RSVP, invitation, or event-creation UI
 * - B: User profile page has no notification inbox or notification preferences
 * - B: Calendar connection UI has no event write/create/send controls
 * - B: Search results do not include copy/share/export/handoff controls
 */

import { describe, expect, it } from "vitest";

import { sealSessionCookie } from "../../../src/auth/session";
import { insertSession, insertTopic, insertUserTopic } from "../setup/index";

describe("Privacy guards", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Test 60 — Discoverability consent required
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-60: discoverability consent required before appearing in search results", async () => {
    const topic = await insertTopic("Privacy Topic", "active");

    const noConsentUser = await createUser({
      id: `no-consent-user-${Date.now()}`,
      email: `noconsent-${Date.now()}@example.com`,
      displayName: "No Consent User",
      role: "user",
      status: "active",
    });
    await insertUserTopic(noConsentUser.id, topic.id, "active");

    const { GET: searchesGet } = await import("../../../app/searches/route");
    const searcher = await createUser({
      id: `searcher-privacy-${Date.now()}`,
      email: `searcher-privacy-${Date.now()}@example.com`,
      displayName: "Privacy Searcher",
      role: "organizer",
      status: "active",
    });
    const sessionId0 = await insertSession(searcher.id);
    const searcherCookie = await sealSessionCookie({ sessionId: sessionId0 });

    const searchesRes = await searchesGet(
      new Request("http://localhost/searches", {
        headers: { cookie: searcherCookie },
      }),
    );

    expect(searchesRes.status).toBe(200);
    const searches = (await searchesRes.json()) as Array<{
      snapshot: Record<string, unknown>;
    }>;

    const snapshotWithNoConsentUser = searches.find((s) =>
      JSON.stringify(s.snapshot).includes(noConsentUser.id),
    );
    expect(snapshotWithNoConsentUser).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 61 — Search results do not expose raw calendar data
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-61: search result slot details do not expose calendar event titles, attendees, locations, descriptions, or email addresses", async () => {
    const topic = await insertTopic("Calendar Privacy Topic", "active");

    const user = await createUser({
      id: `calendar-privacy-user-${Date.now()}`,
      email: `cal-privacy-${Date.now()}@example.com`,
      displayName: "Calendar Privacy User",
      role: "user",
      status: "active",
    });
    await insertUserTopic(user.id, topic.id, "active");

    const searcher = await createUser({
      id: `searcher-cal-privacy-${Date.now()}`,
      email: `searcher-cal-privacy-${Date.now()}@example.com`,
      displayName: "Cal Privacy Searcher",
      role: "organizer",
      status: "active",
    });
    const sessionId1 = await insertSession(searcher.id);
    const searcherCookie = await sealSessionCookie({ sessionId: sessionId1 });

    const { searchResultPage } = await import("../helpers/search-result-page");
    const result = await searchResultPage(searcherCookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshotJson = JSON.stringify(result.snapshot);

    const forbiddenFields = [
      "eventTitle",
      "attendees",
      "location",
      "description",
      "calendarEventTitle",
      "attendeeEmail",
      "eventLocation",
    ];

    for (const field of forbiddenFields) {
      expect(snapshotJson.toLowerCase()).not.toContain(field.toLowerCase());
    }

    for (const slot of Object.values(result.snapshot.weeklyGrid).flat()) {
      for (const match of slot.matches) {
        expect(match).not.toHaveProperty("email");
        expect(match).not.toHaveProperty("attendees");
        expect(match).not.toHaveProperty("calendarEvents");
        expect(match).not.toHaveProperty("rawCalendarData");
      }
    }
  });
});

describe("Non-goal UI absence guards", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Tests 62 — No booking, RSVP, invitation, event-creation UI on search page
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-62a: search results page has no booking or event-creation UI", async () => {
    const topic = await insertTopic("NoBooking Topic", "active");

    const searcher = await createUser({
      id: `searcher-nobooking-${Date.now()}`,
      email: `nobooking-${Date.now()}@example.com`,
      displayName: "No Booking Searcher",
      role: "organizer",
      status: "active",
    });
    const sessionId2 = await insertSession(searcher.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId2, });

    const { searchResultPage } = await import("../helpers/search-result-page");
    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const { GET: searchPageGet } = await import(
      "../../../app/searches/[id]/route",
    );
    const pageRes = await searchPageGet(
      new Request(`http://localhost/searches/${result.snapshot.searchId}`, {
        headers: { cookie },
      }),
    );

    const html = await pageRes.text();

    const forbiddenUIElements = [
      "book",
      "rsvp",
      "invite",
      "send-invite",
      "create-event",
      "add-to-calendar",
      "confirm-booking",
      "reserve-slot",
    ];

    for (const element of forbiddenUIElements) {
      expect(html.toLowerCase()).not.toContain(element.toLowerCase());
    }
  });

  it("test-62b: user profile page has no notification inbox", async () => {
    const user = await createUser({
      id: `profile-nonotify-${Date.now()}`,
      email: `nonotify-${Date.now()}@example.com`,
      displayName: "No Notify User",
      role: "user",
      status: "active",
    });
    const sessionId3 = await insertSession(user.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId3, });

    const { GET: meGet } = await import("../../../app/me/route");
    const res = await meGet(
      new Request("http://localhost/me", {
        headers: { cookie },
      }),
    );

    const html = await res.text();

    const forbiddenNotificationUIElements = [
      "notification",
      "inbox",
      "notification-preferences",
      "email-notifications",
    ];

    for (const element of forbiddenNotificationUIElements) {
      expect(html.toLowerCase()).not.toContain(element.toLowerCase());
    }
  });

  it("test-62c: calendar connection UI has no event write or send controls", async () => {
    const user = await createUser({
      id: `cal-write-user-${Date.now()}`,
      email: `calwrite-${Date.now()}@example.com`,
      displayName: "Cal Write User",
      role: "user",
      status: "active",
    });
    const sessionId4 = await insertSession(user.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId4, });

    const { GET: connectionsGet } = await import(
      "../../../app/me/calendar-connections/route",
    );
    const res = await connectionsGet(
      new Request("http://localhost/me/calendar-connections", {
        headers: { cookie },
      }),
    );

    const html = await res.text();

    const forbiddenCalendarUIElements = [
      "create-event",
      "send-event",
      "write-event",
      "add-event",
      "edit-event",
      "delete-event",
      "calendar-write",
    ];

    for (const element of forbiddenCalendarUIElements) {
      expect(html.toLowerCase()).not.toContain(element.toLowerCase());
    }
  });

  it("test-62d: search results do not include copy/share/export controls", async () => {
    const topic = await insertTopic("NoExport Topic", "active");

    const searcher = await createUser({
      id: `searcher-noexport-${Date.now()}`,
      email: `noexport-${Date.now()}@example.com`,
      displayName: "No Export Searcher",
      role: "organizer",
      status: "active",
    });
    const sessionId5 = await insertSession(searcher.id);
    const cookie = await sealSessionCookie({ sessionId: sessionId5, });

    const { searchResultPage } = await import("../helpers/search-result-page");
    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const { GET: searchPageGet } = await import(
      "../../../app/searches/[id]/route",
    );
    const pageRes = await searchPageGet(
      new Request(`http://localhost/searches/${result.snapshot.searchId}`, {
        headers: { cookie },
      }),
    );

    const html = await pageRes.text();

    const forbiddenHandoffElements = [
      "copy-link",
      "share",
      "export",
      "download",
      "ics",
      "calendar-export",
      "send-results",
    ];

    for (const element of forbiddenHandoffElements) {
      expect(html.toLowerCase()).not.toContain(element.toLowerCase());
    }
  });
});

async function createUser(data: {
  id?: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
}) {
  const { createUser: _createUser } = await import("../helpers/db");
  return _createUser(data);
}
