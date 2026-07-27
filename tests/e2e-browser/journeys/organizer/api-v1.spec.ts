import { test, expect } from "@playwright/test";

import { FIXTURE_DATE, seedAll } from "../../../fixtures/seeds";
import { getDb } from "../../../../src/db/client";
import { searches, searchResults } from "../../../../src/db/schema";

const FIXED_DATE = new Date(FIXTURE_DATE);

const SEED_SEARCH_ID = "11111111-1111-1111-1111-111111111111";
const SEED_SNAPSHOT_ID = "22222222-2222-2222-2222-222222222222";

async function seedSearchFixture(): Promise<void> {
  const db = getDb();
  await db.execute(
    "TRUNCATE TABLE search_results, searches RESTART IDENTITY CASCADE",
  );

  const now = new Date(FIXTURE_DATE);
  await db.insert(searches).values({
    id: SEED_SEARCH_ID,
    organizerId: "00000000-0000-0000-0000-000000000002",
    selectedTopicIds: ["00000000-0000-0000-0000-000000000010"],
    minimumMatchingUsers: 2,
    durationMinutes: 60,
    rangeStart: new Date("2026-07-06T03:00:00.000Z"),
    rangeEnd: new Date("2026-08-10T03:00:00.000Z"),
    organizerTimezone: "America/Los_Angeles",
    generatedAt: now,
    snapshotReference: SEED_SNAPSHOT_ID,
  });

  await db.insert(searchResults).values({
    id: SEED_SNAPSHOT_ID,
    searchId: SEED_SEARCH_ID,
    snapshotJson: {
      generatedAt: now.toISOString(),
      organizerTimezone: "America/Los_Angeles",
      dateRangeStart: "2026-07-06T03:00:00.000Z",
      dateRangeEnd: "2026-08-10T03:00:00.000Z",
      durationMinutes: 60,
      slots: [],
    },
    createdAt: now,
  });
}

test.describe("/api/v1 read adapters journey (organizer)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/organizer.json" });

  test("organizer: GET /api/v1/searches returns the canonical history DTO", async ({
    request,
  }) => {
    await test.step("seed baseline users, topics, and a search", async () => {
      await seedAll(getDb());
    });

    const response = await request.get("/api/v1/searches");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = (await response.json()) as {
      history: Array<{
        id: string;
        organizerId: string;
        organizerDisplayName: string;
        selectedTopicNames: string[];
        minimumMatchingUsers: number;
        stale: boolean;
      }>;
    };

    expect(Array.isArray(body.history)).toBe(true);
  });

  test("organizer: GET /api/v1/searches/{id} returns the canonical snapshot DTO", async ({
    request,
  }) => {
    await test.step("seed baseline users, topics, and a search snapshot", async () => {
      await seedAll(getDb());
      await seedSearchFixture();
    });

    const response = await request.get(`/api/v1/searches/${SEED_SEARCH_ID}`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = (await response.json()) as {
      search: { id: string; organizerTimezone: string; durationMinutes: number };
      snapshot: {
        generatedAt: string;
        organizerTimezone: string;
        durationMinutes: number;
      };
      selectedTopics: Array<{ id: string; name: string }>;
    };

    expect(body.search.id).toBe(SEED_SEARCH_ID);
    expect(body.search.organizerTimezone).toBe("America/Los_Angeles");
    expect(body.search.durationMinutes).toBe(60);
    expect(body.snapshot.generatedAt).toBeTruthy();
    expect(body.selectedTopics.length).toBeGreaterThanOrEqual(1);
  });

  test("organizer: GET /api/v1/me/setup-status returns the canonical five-card DTO", async ({
    request,
  }) => {
    await test.step("seed baseline users, topics, and a search", async () => {
      await seedAll(getDb());
    });

    const response = await request.get("/api/v1/me/setup-status");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = (await response.json()) as {
      complete: boolean;
      items: Array<{
        key: string;
        label: string;
        required: boolean;
        complete: boolean;
      }>;
    };

    expect(body.items).toHaveLength(5);
    expect(body.items.map((i) => i.key)).toEqual([
      "profile",
      "discoverability",
      "topics",
      "availability",
      "calendarConnection",
    ]);
    expect(body.items.map((i) => i.label)).toEqual([
      "Profile",
      "Discoverability",
      "Topics",
      "Availability",
      "Calendar Connection",
    ]);
  });

  test("organizer: GET /api/v1/searches/{missing} returns problem+json 404", async ({
    request,
  }) => {
    await test.step("seed baseline users, topics, and a search snapshot", async () => {
      await seedAll(getDb());
      await seedSearchFixture();
    });

    const response = await request.get(
      "/api/v1/searches/00000000-0000-0000-0000-deadbeefcafe",
    );

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toBe(
      "application/problem+json",
    );

    const body = (await response.json()) as {
      type: string;
      title: string;
      status: number;
    };

    expect(body.type).toBe("about:blank");
    expect(body.status).toBe(404);
    expect(body.title).toBe("Search not found");
  });
});

test.describe("/api/v1 read adapters — failure paths (user role)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "playwright/.auth/user.json" });

  test("user role: GET /api/v1/searches returns problem+json 403", async ({
    request,
  }) => {
    await test.step("seed baseline users, topics, and a search", async () => {
      await seedAll(getDb());
    });

    const response = await request.get("/api/v1/searches");

    expect(response.status()).toBe(403);
    expect(response.headers()["content-type"]).toBe(
      "application/problem+json",
    );

    const body = (await response.json()) as {
      type: string;
      title: string;
      status: number;
    };

    expect(body.type).toBe("about:blank");
    expect(body.status).toBe(403);
  });
});

test.describe("/api/v1 read adapters — failure paths (no session)", () => {
  test.describe.configure({ mode: "serial" });

  test("no session: GET /api/v1/me/setup-status returns problem+json 401", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const response = await context.request.get("/api/v1/me/setup-status");
    await context.close();

    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toBe(
      "application/problem+json",
    );

    const body = (await response.json()) as {
      type: string;
      title: string;
      status: number;
    };

    expect(body.title).toBe("Sign in required");
    expect(body.status).toBe(401);
  });
});

void FIXED_DATE;