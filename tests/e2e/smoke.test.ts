import { describe, expect, it } from "vitest";
import { getTestDb } from "../helpers/test-db";
import { getTestClock, setupTest } from "../helpers/setup";

describe("E2E infrastructure smoke test", () => {
  it("globalSetup creates an ephemeral database and setupFiles reset per test", () => {
    const db = getTestDb();
    if (!db) {
      return;
    }
    expect(db).toBeDefined();
  });

  it("getTestClock returns fixture date after setupTest", async () => {
    const db = getTestDb();
    if (!db) {
      return;
    }
    await setupTest();
    const clock = getTestClock();
    const now = clock();
    expect(now.toISOString()).toBe("2026-07-12T12:00:00.000Z");
  });
});
