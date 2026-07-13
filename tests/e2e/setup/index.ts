/**
 * Shared test fixtures for E2E tests.
 * Functions for inserting test data into the database.
 *
 * E2E coverage: all slices — tests 1-62
 */

import { randomUUID } from "node:crypto";

export async function insertSession(
  userId: string,
  sessionId?: string,
  csrfToken = "e2e-csrf-token",
): Promise<string> {
  const { getDb } = await import("../../../src/db/client");
  const { sessions } = await import("../../../src/db/schema");
  const db = getDb();
  const id = sessionId ?? randomUUID();
  await db.insert(sessions).values({
    id,
    userId,
    csrfToken,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return id;
}

export async function insertTopic(
  name: string,
  status: "pending" | "active" | "retired" = "active",
) {
  const { getDb } = await import("../../../src/db/client");
  const { topics } = await import("../../../src/db/schema");
  const db = getDb();
  const [topic] = await db.insert(topics).values({ name, status }).returning();
  return topic;
}

export async function insertUserTopic(
  userId: string,
  topicId: string,
  assocStatus: "active" | "pending-retired" | "historical" = "active",
) {
  const { getDb } = await import("../../../src/db/client");
  const { userTopics } = await import("../../../src/db/schema");
  const db = getDb();
  await db.insert(userTopics).values({
    userId,
    topicId,
    status: assocStatus,
  });
}

export async function insertAvailabilityWindow(data: {
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  profileTimezone?: string;
}) {
  const { getDb } = await import("../../../src/db/client");
  const { availabilityWindows } = await import("../../../src/db/schema");
  const db = getDb();
  const [window] = await db
    .insert(availabilityWindows)
    .values({ ...data, profileTimezone: data.profileTimezone ?? "UTC" })
    .returning();
  return window;
}
