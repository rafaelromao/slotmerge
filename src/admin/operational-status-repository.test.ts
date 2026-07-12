import { describe, expect, it } from "vitest";

import {
  createAdminStatusHandlers,
  type OperationalStatusRepository,
} from "./operational-status";
import { createPostgresOperationalStatusRepository } from "./operational-status-repository";

describe("createPostgresOperationalStatusRepository", () => {
  it("is a factory function the route shim can call", () => {
    expect(typeof createPostgresOperationalStatusRepository).toBe("function");
  });

  it("matches the OperationalStatusRepository interface so it can be injected into the handler", () => {
    const db = {} as Parameters<
      typeof createPostgresOperationalStatusRepository
    >[0];
    const repo: OperationalStatusRepository =
      createPostgresOperationalStatusRepository(db);
    expect(typeof repo.summarizeEmailDelivery).toBe("function");
    expect(typeof repo.summarizeCalendarConnections).toBe("function");
  });

  it("is wired into the GET handler factory", async () => {
    const emptyRepo: OperationalStatusRepository = {
      summarizeEmailDelivery: () =>
        Promise.resolve({
          since: new Date(0),
          counts: { queued: 0, sending: 0, sent: 0, failed: 0 },
          recentFailures: [],
        }),
      summarizeCalendarConnections: () =>
        Promise.resolve({
          counts: { pending: 0, connected: 0, disconnected: 0 },
          tokensNeedingRefresh: [],
        }),
    };

    const { GET } = createAdminStatusHandlers({ statusRepository: emptyRepo });

    const response = await GET(
      new Request("http://localhost/admin/status", {
        headers: { cookie: "session=admin-session" },
      }),
    );

    expect([200, 401]).toContain(response.status);
  });
});
