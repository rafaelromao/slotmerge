import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../src/db/client";
import { topics } from "../../src/db/schema";
import { seedAll } from "../fixtures/seeds";
import { resetAdminFixtures } from "./playwright/admin-fixtures";

vi.mock("../fixtures/seeds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fixtures/seeds")>();
  return { ...actual, seedAll: vi.fn() };
});

describe("admin fixtures", () => {
  it("seeds canonical state and removes the approval-created Topic", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const deleteQuery = vi.fn().mockReturnValue({ where });
    const db = { delete: deleteQuery } as unknown as AppDb;

    await resetAdminFixtures(db);

    expect(seedAll).toHaveBeenCalledWith(db);
    expect(deleteQuery).toHaveBeenCalledWith(topics);
    expect(where).toHaveBeenCalledWith(
      eq(topics.name, "Engineering management"),
    );
  });
});
