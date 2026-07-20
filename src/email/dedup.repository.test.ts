import { describe, expect, it, vi } from "vitest";

import { createPostgresEmailDedupLookup } from "./dedup.repository";

describe("createPostgresEmailDedupLookup", () => {
  it("findMostRecent queries by type, payloadReference, and since when no status is supplied", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ createdAt: new Date("2026-01-01T01:00:00.000Z") }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const lookup = createPostgresEmailDedupLookup(
      db as unknown as Parameters<typeof createPostgresEmailDedupLookup>[0],
    );

    const result = await lookup.findMostRecent({
      type: "admin-critical",
      payloadReference: "ref-1",
      since: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual(new Date("2026-01-01T01:00:00.000Z"));
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("findMostRecent narrows to status=sent when status is supplied", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const lookup = createPostgresEmailDedupLookup(
      db as unknown as Parameters<typeof createPostgresEmailDedupLookup>[0],
    );

    const result = await lookup.findMostRecent({
      type: "calendar-action-required",
      payloadReference: "ref-2",
      since: new Date("2026-01-01T00:00:00.000Z"),
      status: "sent",
    });

    expect(result).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("findMostRecent returns null when there is no matching dispatch", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const lookup = createPostgresEmailDedupLookup(
      db as unknown as Parameters<typeof createPostgresEmailDedupLookup>[0],
    );

    const result = await lookup.findMostRecent({
      type: "admin-critical",
      payloadReference: "ref-missing",
      since: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toBeNull();
  });
});
