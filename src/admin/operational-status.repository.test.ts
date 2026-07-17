import { describe, expect, it, vi } from "vitest";

import { createPostgresOperationalStatusRepository } from "./operational-status.repository";

describe("createPostgresOperationalStatusRepository", () => {
  it("summarizeEmailDelivery aggregates counts by status and the since window", async () => {
    const since = new Date("2026-01-01T00:00:00Z");
    const failedRow = {
      emailEventId: "evt-1",
      recipient: "alice@example.com",
      type: "invite",
      code: "smtp-timeout",
      message: "Upstream SMTP timed out",
      failedAt: new Date("2026-01-01T23:55:00Z"),
    };

    const groupBy = vi.fn().mockImplementation((_column: unknown) => {
      const inner = (handler: (rows: unknown[]) => unknown) =>
        handler([
          { status: "queued", value: "2" },
          { status: "sent", value: "17" },
          { status: "failed", value: "4" },
        ]);
      void inner;
      return Promise.resolve({
        queued: 2,
        sending: 0,
        sent: 17,
        failed: 4,
      });
    });
    const gteWhere = vi
      .fn()
      .mockReturnValueOnce({ groupBy })
      .mockReturnValueOnce({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([failedRow]),
        }),
      });
    const fromEmail = vi.fn().mockReturnValue({ where: gteWhere });
    const fromCal = vi.fn().mockReturnValue({ groupBy: vi.fn() });
    const select = vi.fn().mockReturnValueOnce({ from: fromEmail });
    void select;
    void fromCal;

    // Use a single chainable db whose .select().from() can vary per call.
    let callIndex = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callIndex += 1;
        if (callIndex === 1) {
          // counts by status
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([
                  { status: "queued", value: "2" },
                  { status: "sent", value: "17" },
                  { status: "failed", value: "4" },
                ]),
              }),
            }),
          };
        }
        // recent failures
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([failedRow]),
              }),
            }),
          }),
        };
      }),
    };

    const repo = createPostgresOperationalStatusRepository(
      db as unknown as Parameters<
        typeof createPostgresOperationalStatusRepository
      >[0],
    );

    const summary = await repo.summarizeEmailDelivery({ since });

    expect(summary).toEqual({
      since,
      counts: { queued: 2, sending: 0, sent: 17, failed: 4 },
      recentFailures: [failedRow],
    });
  });

  it("summarizeCalendarConnections returns the counts and three refresh buckets", async () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const expiredAt = new Date(now.getTime() - 60 * 1000);
    const expiringSoonAt = new Date(now.getTime() + 2 * 60 * 1000);

    let callIndex = 0;
    const db = {
      select: vi.fn().mockImplementation(() => {
        callIndex += 1;
        if (callIndex === 1) {
          return {
            from: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([
                { status: "pending", value: "1" },
                { status: "connected", value: "5" },
                { status: "disconnected", value: "2" },
              ]),
            }),
          };
        }
        if (callIndex === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  connectionId: "conn-expired",
                  userId: "user-1",
                  provider: "google",
                  accountIdentifier: "alice@example.com",
                  status: "connected",
                  accessTokenExpiresAt: expiredAt,
                },
              ]),
            }),
          };
        }
        if (callIndex === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  connectionId: "conn-soon",
                  userId: "user-2",
                  provider: "google",
                  accountIdentifier: "bob@example.com",
                  status: "connected",
                  accessTokenExpiresAt: expiringSoonAt,
                },
              ]),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                connectionId: "conn-unset",
                userId: "user-3",
                provider: "google",
                accountIdentifier: "carol@example.com",
                status: "connected",
                accessTokenExpiresAt: null,
              },
            ]),
          }),
        };
      }),
    };

    const repo = createPostgresOperationalStatusRepository(
      db as unknown as Parameters<
        typeof createPostgresOperationalStatusRepository
      >[0],
    );

    const summary = await repo.summarizeCalendarConnections({ now });

    expect(summary.counts).toEqual({
      pending: 1,
      connected: 5,
      disconnected: 2,
    });
    expect(summary.tokensNeedingRefresh).toHaveLength(3);
    expect(summary.tokensNeedingRefresh[0].bucket).toBe("expired");
    expect(summary.tokensNeedingRefresh[1].bucket).toBe("expiring_soon");
    expect(summary.tokensNeedingRefresh[2].bucket).toBe("unset");
  });
});
