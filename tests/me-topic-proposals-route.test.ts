import { describe, expect, it, vi } from "vitest";

import { createMeTopicProposalsHandlers } from "../src/topics/me-topic-proposals-route";

describe("GET /me/topic-proposals", () => {
  const mockSession = {
    user: {
      id: "user-1",
      email: "user@example.com",
      displayName: null,
      role: "user" as const,
      status: "active" as const,
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken: "csrf-token-1",
  };

  const mockRepository = {
    listUserTopicProposals: vi.fn(),
  };

  const mockGetSession = vi.fn();

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(mockSession);
    mockRepository.listUserTopicProposals.mockReset();
  });

  async function makeGetRequest() {
    const request = new Request("http://localhost/me/topic-proposals", {
      method: "GET",
    });
    const handlers = createMeTopicProposalsHandlers({
      getSession: mockGetSession,
      repository: mockRepository,
    });
    return handlers.GET(request);
  }

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await makeGetRequest();

    expect(response.status).toBe(401);
  });

  it("returns list of user's topic proposals", async () => {
    const createdAt = new Date("2024-01-01");
    mockRepository.listUserTopicProposals.mockResolvedValue([
      { id: "proposal-1", candidateName: "Sailing", status: "pending", createdAt },
      {
        id: "proposal-2",
        candidateName: "Engineering",
        status: "approved",
        createdAt,
      },
    ]);

    const response = await makeGetRequest();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      proposals: { id: string; candidateName: string; status: string }[];
    };
    expect(body.proposals).toHaveLength(2);
    expect(body.proposals[0].id).toBe("proposal-1");
    expect(body.proposals[0].candidateName).toBe("Sailing");
    expect(body.proposals[0].status).toBe("pending");
  });

  it("returns empty array when user has no proposals", async () => {
    mockRepository.listUserTopicProposals.mockResolvedValue([]);

    const response = await makeGetRequest();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { proposals: unknown[] };
    expect(body.proposals).toEqual([]);
  });
});
