import { describe, expect, it, vi } from "vitest";

import { buildTestClock } from "../../tests/test-clock";
import { createAdminTopicProposalsHandlers } from "./topic-proposals";
import type { TopicProposalAdminRepository } from "../topics/proposals.repository";

const testClock = buildTestClock(new Date("2026-07-12T00:00:00.000Z"));

describe("admin topic-proposals", () => {
  const mockPendingProposal = {
    id: "proposal-1",
    candidateName: "Sailing",
    status: "pending" as const,
    proposedByUserId: "user-1",
    proposedByUserEmail: "user@example.com",
    createdAt: new Date(),
  };

  it("renders a list of pending proposals with approve and reject forms", async () => {
    const { GET } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([mockPendingProposal]),
        approve: vi.fn(),
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const response = await GET(
      new Request("http://localhost/admin/topic-proposals"),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Sailing");
    expect(html).toContain("user@example.com");
    expect(html).toContain('name="action" value="approve"');
    expect(html).toContain('name="action" value="reject"');
    expect(html).toContain('name="_csrf"');
    expect(html).toContain('value="csrf-token-1"');
  });

  it("shows empty state when no pending proposals", async () => {
    const { GET } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([]),
        approve: vi.fn(),
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const response = await GET(
      new Request("http://localhost/admin/topic-proposals"),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("No pending proposals");
  });

  it("approves a proposal and redirects", async () => {
    const approve = vi.fn().mockResolvedValue({
      ok: true,
      topicId: "topic-1",
    });

    const { POST } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([mockPendingProposal]),
        approve,
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const response = await POST(
      new Request("http://localhost/admin/topic-proposals", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "proposal-1",
          action: "approve",
          _csrf: "csrf-token-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/topic-proposals",
    );
    expect(approve).toHaveBeenCalledWith({
      id: "proposal-1",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      now: expect.any(Date),
    });
  });

  it("rejects a proposal and redirects", async () => {
    const reject = vi.fn().mockResolvedValue({ ok: true });

    const { POST } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([mockPendingProposal]),
        approve: vi.fn(),
        reject,
      } as unknown as TopicProposalAdminRepository,
    });

    const response = await POST(
      new Request("http://localhost/admin/topic-proposals", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "proposal-1",
          action: "reject",
          _csrf: "csrf-token-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/topic-proposals",
    );
    expect(reject).toHaveBeenCalledWith({
      id: "proposal-1",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      now: expect.any(Date),
    });
  });

  it("returns 403 for wrong CSRF token on approve", async () => {
    const approve = vi.fn();

    const { POST } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([mockPendingProposal]),
        approve,
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const response = await POST(
      new Request("http://localhost/admin/topic-proposals", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "proposal-1",
          action: "approve",
          _csrf: "wrong-csrf-token",
        }).toString(),
      }),
    );

    expect(response.status).toBe(403);
    expect(approve).not.toHaveBeenCalled();
  });

  it("shows error when proposal already processed on approve", async () => {
    const approve = vi.fn().mockResolvedValue({
      ok: false,
      reason: "already_processed",
    });

    const { POST } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([mockPendingProposal]),
        approve,
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const response = await POST(
      new Request("http://localhost/admin/topic-proposals", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "proposal-1",
          action: "approve",
          _csrf: "csrf-token-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(409);
    const html = await response.text();
    expect(html).toContain("This proposal has already been processed.");
  });

  it("returns 403 for non-admin session", async () => {
    const { GET, POST } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          email: "user@example.com",
          displayName: null,
          role: "user",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([]),
        approve: vi.fn(),
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const getResponse = await GET(
      new Request("http://localhost/admin/topic-proposals"),
    );
    expect(getResponse.status).toBe(403);

    const postResponse = await POST(
      new Request("http://localhost/admin/topic-proposals", {
        method: "POST",
      }),
    );
    expect(postResponse.status).toBe(403);
  });

  it("returns 401 for unauthenticated session", async () => {
    const { GET, POST } = createAdminTopicProposalsHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue(null),
      topicProposalRepository: {
        listPending: vi.fn().mockResolvedValue([]),
        approve: vi.fn(),
        reject: vi.fn(),
      } as unknown as TopicProposalAdminRepository,
    });

    const getResponse = await GET(
      new Request("http://localhost/admin/topic-proposals"),
    );
    expect(getResponse.status).toBe(401);

    const postResponse = await POST(
      new Request("http://localhost/admin/topic-proposals", {
        method: "POST",
      }),
    );
    expect(postResponse.status).toBe(401);
  });
});
