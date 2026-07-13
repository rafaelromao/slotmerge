import { describe, expect, it, vi } from "vitest";

import { createTopicProposalsHandlers } from "../src/topics/proposals-route";

describe("POST /topic-proposals", () => {
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
    findSimilarTopics: vi.fn(),
    findPendingByUserAndName: vi.fn(),
    insertProposal: vi.fn(),
    listUserTopicProposals: vi.fn(),
  };

  const mockGetSession = vi.fn();

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(mockSession);
    mockRepository.findSimilarTopics.mockReset();
    mockRepository.findPendingByUserAndName.mockReset();
    mockRepository.insertProposal.mockReset();
  });

  async function makeRequest(body: unknown, contentType = "application/json") {
    const headers: Record<string, string> = {
      "content-type": contentType,
    };
    const request = new Request("http://localhost/topic-proposals", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const handlers = createTopicProposalsHandlers({
      getSession: mockGetSession,
      repository: mockRepository,
    });
    return handlers.POST(request);
  }

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await makeRequest({ candidateName: "Sailing" });

    expect(response.status).toBe(401);
  });

  it("returns 400 for missing candidateName", async () => {
    const response = await makeRequest({});

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_name");
  });

  it("returns 409 when name is too similar to active topic", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([
      { name: "Sailing", type: "active" },
    ]);

    const response = await makeRequest({ candidateName: "Sailing" });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      matches: { name: string; type: string }[];
    };
    expect(body.error).toBe("too_similar");
    expect(body.matches).toContainEqual({ name: "Sailing", type: "active" });
  });

  it("returns 409 when user already has a pending proposal with same name", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([]);
    mockRepository.findPendingByUserAndName.mockResolvedValue({ id: "existing" });

    const response = await makeRequest({ candidateName: "Sailing" });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      proposalId: string;
    };
    expect(body.error).toBe("already_pending");
    expect(body.proposalId).toBe("existing");
  });

  it("returns 201 and creates proposal on success", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([]);
    mockRepository.findPendingByUserAndName.mockResolvedValue(null);
    mockRepository.insertProposal.mockResolvedValue({
      id: "proposal-1",
      candidateName: "Sailing",
      status: "pending",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    });

    const response = await makeRequest({ candidateName: "Sailing" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      candidateName: string;
      status: string;
    };
    expect(body.id).toBe("proposal-1");
    expect(body.candidateName).toBe("Sailing");
    expect(body.status).toBe("pending");
  });

  it("rejects empty candidateName", async () => {
    const response = await makeRequest({ candidateName: "" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_name");
  });

  it("rejects whitespace-only candidateName", async () => {
    const response = await makeRequest({ candidateName: "   " });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_name");
  });
});
