/**
 * E2E tests for Organizer Search.
 *
 * E2E coverage: PRD stories 35-46 → tests 33-43
 *
 * Behaviors:
 * - B: Only Organizers and Admins can run searches; normal Users receive 403
 * - B: Search with one topic matches only users with that active Topic
 * - B: Search with multiple topics matches only users with ALL selected topics
 * - B: Searcher never appears in results and never counts toward minimum matching users
 * - B: User counted in slot only if available for the full meeting duration
 * - B: Default minimum matching users is 2; configurable per search
 * - B: Slots align to the hourly grid; start times are on the hour
 * - B: Search result calendar shows per-slot match counts and stale markers
 * - B: Clicking a slot opens a drawer listing matching users with details
 * - B: Every search creates an immutable snapshot; later data changes do not affect it
 * - B: All Organizers/Admins can view search history
 */

import { describe, expect, it } from "vitest";

import { sealSessionCookie } from "../../../src/auth/session";
import { SearchResultSnapshotSchema } from "../helpers/search-result-snapshot";
import { searchResultPage } from "../helpers/search-result-page";
import { createUser } from "../helpers/db";
import { insertSession, insertTopic, insertUserTopic } from "../setup/index";

async function createSearcher() {
  const user = await createUser({
    id: `searcher-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    email: `searcher-${Date.now()}@example.com`,
    displayName: "Searcher User",
    role: "organizer",
    status: "active",
  });
  return user;
}

describe("Organizer search", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Tests 33-34 — Permission and one-topic search
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-33: only Organizers and Admins can run searches", async () => {
    const { POST: createSearch } = await import("../../../app/searches/route");

    const normalUser = await createUser({
      id: `normal-user-search-${Date.now()}`,
      email: `normal-${Date.now()}@example.com`,
      displayName: "Normal User",
      role: "user",
      status: "active",
    });

    await insertSession(normalUser.id, `session-normal-search`);
    const cookie = await sealSessionCookie({
      sessionId: `session-normal-search`,
    });

    const res = await createSearch(
      new Request("http://localhost/searches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          selectedTopicIds: [],
          minimumMatchingUsers: 2,
          durationMinutes: 60,
        }),
      }),
    );

    expect(res.status).toBe(403);
  });

  it("test-34: search with one topic matches only users with that topic", async () => {
    const topic = await insertTopic("Distributed Systems", "active");

    const user1 = await createUser({
      id: `user-with-topic-${Date.now()}-1`,
      email: `with-topic-1-${Date.now()}@example.com`,
      displayName: "Topic User 1",
      role: "user",
      status: "active",
    });
    await insertUserTopic(user1.id, topic.id, "active");

    const user2 = await createUser({
      id: `user-without-topic-${Date.now()}`,
      email: `without-topic-${Date.now()}@example.com`,
      displayName: "No Topic User",
      role: "user",
      status: "active",
    });

    const searcher = await createSearcher();
    await insertSession(searcher.id, `session-searcher-${Date.now()}`);
    const cookie = await sealSessionCookie({
      sessionId: `session-searcher-${Date.now()}`,
    });

    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshot = SearchResultSnapshotSchema.parse(result.snapshot);
    expect(snapshot.parameters.selectedTopicIds).toEqual([topic.id]);

    const allMatches = Object.values(snapshot.weeklyGrid).flat();
    const userIds = allMatches.flatMap((slot) =>
      slot.matches.map((m) => m.userId),
    );

    expect(userIds).toContain(user1.id);
    expect(userIds).not.toContain(user2.id);
    expect(userIds).not.toContain(searcher.id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 35 — Multi-topic search
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-35: search with multiple topics matches users with ALL selected topics", async () => {
    const topicA = await insertTopic("Machine Learning", "active");
    const topicB = await insertTopic("Distributed Systems", "active");

    const userWithBoth = await createUser({
      id: `user-both-topics-${Date.now()}`,
      email: `both-${Date.now()}@example.com`,
      displayName: "Both Topics User",
      role: "user",
      status: "active",
    });
    await insertUserTopic(userWithBoth.id, topicA.id, "active");
    await insertUserTopic(userWithBoth.id, topicB.id, "active");

    const userWithOnlyA = await createUser({
      id: `user-only-a-${Date.now()}`,
      email: `only-a-${Date.now()}@example.com`,
      displayName: "Only A User",
      role: "user",
      status: "active",
    });
    await insertUserTopic(userWithOnlyA.id, topicA.id, "active");

    const searcher = await createSearcher();
    await insertSession(searcher.id, `session-searcher-multi-${Date.now()}`);
    const cookie = await sealSessionCookie({
      sessionId: `session-searcher-multi-${Date.now()}`,
    });

    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topicA.id, topicB.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshot = SearchResultSnapshotSchema.parse(result.snapshot);
    const allMatches = Object.values(snapshot.weeklyGrid).flat();
    const userIds = allMatches.flatMap((slot) =>
      slot.matches.map((m) => m.userId),
    );

    expect(userIds).toContain(userWithBoth.id);
    expect(userIds).not.toContain(userWithOnlyA.id);
    expect(userIds).not.toContain(searcher.id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 36 — Searcher never appears in results
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-36: searcher never appears in results and never counts toward minimum", async () => {
    const topic = await insertTopic("Networking", "active");

    const searcher = await createSearcher();
    await insertUserTopic(searcher.id, topic.id, "active");

    await insertSession(searcher.id, `session-searcher-self-${Date.now()}`);
    const cookie = await sealSessionCookie({
      sessionId: `session-searcher-self-${Date.now()}`,
    });

    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshot = SearchResultSnapshotSchema.parse(result.snapshot);
    const allMatches = Object.values(snapshot.weeklyGrid).flat();
    const userIds = allMatches.flatMap((slot) =>
      slot.matches.map((m) => m.userId),
    );

    expect(userIds).not.toContain(searcher.id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tests 37-38 — Hourly grid alignment
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-37: slots align to the hourly grid; all start times are on the hour", async () => {
    const topic = await insertTopic("Cloud Computing", "active");

    const searcher = await createSearcher();
    await insertSession(searcher.id, `session-searcher-grid-${Date.now()}`);
    const cookie = await sealSessionCookie({
      sessionId: `session-searcher-grid-${Date.now()}`,
    });

    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshot = SearchResultSnapshotSchema.parse(result.snapshot);
    const allSlots = Object.values(snapshot.weeklyGrid).flat();

    for (const slot of allSlots) {
      const startTime = new Date(slot.startTime);
      expect(startTime.getMinutes()).toBe(0);
      expect(startTime.getSeconds()).toBe(0);
      expect(startTime.getMilliseconds()).toBe(0);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tests 39-40 — Stale data markers
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-39: stale data markers appear in results when calendar data is stale", async () => {
    const topic = await insertTopic("Security", "active");

    const staleUser = await createUser({
      id: `stale-user-${Date.now()}`,
      email: `stale-${Date.now()}@example.com`,
      displayName: "Stale User",
      role: "user",
      status: "active",
    });
    await insertUserTopic(staleUser.id, topic.id, "active");

    const { getDb } = await import("../../../src/db/client");
    const { calendarConnections } = await import("../../../src/db/schema");
    const db = getDb();
    await db.insert(calendarConnections).values({
      id: `conn-stale-${Date.now()}`,
      userId: staleUser.id,
      provider: "google",
      providerAccountKey: `google:stale-${Date.now()}`,
      accountIdentifier: `stale-${Date.now()}@example.com`,
      scopes: "https://www.googleapis.com/auth/calendar.freebusy",
      status: "needs_reconnect",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: "stale",
      lastErrorMessage: "Sync has not run for more than 7 days",
      contributingCalendarIds: [],
    });

    const searcher = await createSearcher();
    await insertSession(searcher.id, `session-searcher-stale-${Date.now()}`);
    const cookie = await sealSessionCookie({
      sessionId: `session-searcher-stale-${Date.now()}`,
    });

    const result = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshot = SearchResultSnapshotSchema.parse(result.snapshot);
    const slotsWithStaleUsers = Object.values(snapshot.weeklyGrid).flat()
      .filter((slot) => slot.matches.some((m) => m.userId === staleUser.id));

    expect(slotsWithStaleUsers.length).toBeGreaterThan(0);
    const hasStaleMarker = slotsWithStaleUsers.some((slot) =>
      slot.matches.some((m) => m.userId === staleUser.id && m.calendarFresh === false),
    );
    expect(hasStaleMarker).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 41 — Search creates immutable snapshot
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-41: search creates immutable snapshot; later data changes do not affect it", async () => {
    const topic = await insertTopic("Databases", "active");

    const user = await createUser({
      id: `immutable-user-${Date.now()}`,
      email: `immutable-${Date.now()}@example.com`,
      displayName: "Immutable User",
      role: "user",
      status: "active",
    });
    await insertUserTopic(user.id, topic.id, "active");

    const searcher = await createSearcher();
    await insertSession(searcher.id, `session-immutable-${Date.now()}`);
    const cookie = await sealSessionCookie({
      sessionId: `session-immutable-${Date.now()}`,
    });

    const result1 = await searchResultPage(cookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const snapshotId = result1.snapshot.searchId;

    await dbDeleteUser(user.id);

    const { GET: getSearch } = await import("../../../app/searches/[id]/route");
    const getRes = await getSearch(
      new Request(`http://localhost/searches/${snapshotId}`, {
        headers: { cookie },
      }),
    );

    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { snapshot: unknown };
    const fetchedSnapshot = SearchResultSnapshotSchema.parse(fetched.snapshot);

    expect(fetchedSnapshot.weeklyGrid).toEqual(result1.snapshot.weeklyGrid);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 42 — All Organizers/Admins can view search history
  // ─────────────────────────────────────────────────────────────────────────────

  it("test-42: all Organizers and Admins can view search history", async () => {
    const topic = await insertTopic("Compilers", "active");

    const searcher = await createSearcher();
    await insertSession(searcher.id, `session-searcher-history-${Date.now()}`);
    const searcherCookie = await sealSessionCookie({
      sessionId: `session-searcher-history-${Date.now()}`,
    });

    await searchResultPage(searcherCookie, {
      selectedTopicIds: [topic.id],
      minimumMatchingUsers: 1,
      durationMinutes: 60,
    });

    const anotherOrganizer = await createUser({
      id: `another-organizer-${Date.now()}`,
      email: `another-org-${Date.now()}@example.com`,
      displayName: "Another Organizer",
      role: "organizer",
      status: "active",
    });
    await insertSession(anotherOrganizer.id, `session-another-org-${Date.now()}`);
    const anotherCookie = await sealSessionCookie({
      sessionId: `session-another-org-${Date.now()}`,
    });

    const { GET: listSearches } = await import("../../../app/searches/route");
    const res = await listSearches(
      new Request("http://localhost/searches", {
        headers: { cookie: anotherCookie },
      }),
    );

    expect(res.status).toBe(200);
    const searches = (await res.json()) as Array<{ searchId: string }>;
    expect(searches.length).toBeGreaterThan(0);
  });
});

async function dbDeleteUser(userId: string) {
  const { getDb } = await import("../../../src/db/client");
  const { users } = await import("../../../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  await db.delete(users).where(eq(users.id, userId));
}
