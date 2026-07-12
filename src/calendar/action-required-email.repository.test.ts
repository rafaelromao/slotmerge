import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConnectionActionRequiredDedupReference,
  type CalendarActionRequiredDispatchLookup,
  type CalendarActionRequiredReason,
} from "./action-required-email";
import {
  createPostgresConnectionActionRequiredDispatchLookup,
  setConnectionActionRequiredDispatchLookupForTests,
} from "./action-required-email.repository";

describe("createPostgresConnectionActionRequiredDispatchLookup", () => {
  afterEach(() => {
    setConnectionActionRequiredDispatchLookupForTests(null);
    vi.unstubAllGlobals();
  });

  it("queries the email_events table for type=calendar-action-required with the per-(connection,reason) reference and a recent timestamp cutoff", async () => {
    const where = vi.fn().mockReturnThis();
    const orderBy = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue([
      { createdAt: new Date("2026-01-01T01:00:00.000Z") },
    ]);
    const from = vi.fn().mockReturnValue({ where, orderBy, limit });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const lookup = createPostgresConnectionActionRequiredDispatchLookup(
      db as unknown as Parameters<
        typeof createPostgresConnectionActionRequiredDispatchLookup
      >[0],
    );

    const result = await lookup.findMostRecentConnectionDispatch(
      "connection-1",
      "sync-failure",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(result).toEqual(new Date("2026-01-01T01:00:00.000Z"));
  });

  it("returns null when the email_events table has no matching dispatch inside the window", async () => {
    const where = vi.fn().mockReturnThis();
    const orderBy = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ where, orderBy, limit });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const lookup = createPostgresConnectionActionRequiredDispatchLookup(
      db as unknown as Parameters<
        typeof createPostgresConnectionActionRequiredDispatchLookup
      >[0],
    );

    const result = await lookup.findMostRecentConnectionDispatch(
      "connection-1",
      "token-revoked",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(result).toBeNull();
  });

  it("produces a different payload reference for each (connectionId, reason) so dedup is per-(connection,reason)", () => {
    expect(
      createConnectionActionRequiredDedupReference("c-1", "token-revoked"),
    ).not.toBe(
      createConnectionActionRequiredDedupReference("c-1", "sync-failure"),
    );
    expect(
      createConnectionActionRequiredDedupReference("c-1", "token-revoked"),
    ).not.toBe(
      createConnectionActionRequiredDedupReference("c-2", "token-revoked"),
    );
  });

  it("uses the test override when one is registered", async () => {
    const override: CalendarActionRequiredDispatchLookup = {
      findMostRecentConnectionDispatch: vi
        .fn()
        .mockResolvedValue(new Date("2026-01-02T00:00:00.000Z")),
    };
    setConnectionActionRequiredDispatchLookupForTests(override);

    const dispatchLookup = (
      await import("./action-required-email.repository")
    ).getConnectionActionRequiredDispatchLookup();

    const result = await dispatchLookup.findMostRecentConnectionDispatch(
      "any",
      "token-revoked" as CalendarActionRequiredReason,
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(result).toEqual(new Date("2026-01-02T00:00:00.000Z"));
  });
});