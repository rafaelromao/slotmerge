import { describe, expect, it, vi } from "vitest";

import { createTopicProposal } from "../src/topics/proposals";

describe("createTopicProposal", () => {
  const now = new Date("2026-05-01T00:00:00.000Z");

  const mockRepository = {
    findSimilarTopics: vi.fn(),
    insertProposal: vi.fn(),
    findPendingByUserAndName: vi.fn(),
  };

  afterEach(() => {
    mockRepository.findSimilarTopics.mockReset();
    mockRepository.insertProposal.mockReset();
    mockRepository.findPendingByUserAndName.mockReset();
  });

  it("creates a pending proposal when name is not similar to any existing topic", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([]);
    mockRepository.findPendingByUserAndName.mockResolvedValue(null);
    mockRepository.insertProposal.mockResolvedValue({
      id: "proposal-1",
      proposedByUserId: "user-1",
      candidateName: "Sailing",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const result = await createTopicProposal(
      "user-1",
      "Sailing",
      now,
      mockRepository,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.id).toBe("proposal-1");
      expect(result.proposal.candidateName).toBe("Sailing");
      expect(result.proposal.status).toBe("pending");
    }
    expect(mockRepository.insertProposal).toHaveBeenCalledWith(
      "user-1",
      "Sailing",
      now,
    );
  });

  it("returns error when name is similar to an active topic", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([
      { name: "Sailing", type: "active" },
    ]);

    const result = await createTopicProposal(
      "user-1",
      "Sailing",
      now,
      mockRepository,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "too_similar") {
      expect(result.matches).toContainEqual({
        name: "Sailing",
        type: "active",
      });
    }
    expect(mockRepository.insertProposal).not.toHaveBeenCalled();
  });

  it("returns error when name is similar to a pending proposal", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([
      { name: "Sailing", type: "pending" },
    ]);

    const result = await createTopicProposal(
      "user-1",
      "Sailing",
      now,
      mockRepository,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("too_similar");
    }
    expect(mockRepository.insertProposal).not.toHaveBeenCalled();
  });

  it("returns error when user already has a pending proposal with same name", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([]);
    mockRepository.findPendingByUserAndName.mockResolvedValue({
      id: "existing-proposal",
      proposedByUserId: "user-1",
      candidateName: "Sailing",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const result = await createTopicProposal(
      "user-1",
      "Sailing",
      now,
      mockRepository,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "already_pending") {
      expect(result.proposalId).toBe("existing-proposal");
    }
    expect(mockRepository.insertProposal).not.toHaveBeenCalled();
  });

  it("returns error for empty name", async () => {
    const result = await createTopicProposal("user-1", "", now, mockRepository);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_name");
    }
    expect(mockRepository.insertProposal).not.toHaveBeenCalled();
  });

  it("returns error for whitespace-only name", async () => {
    const result = await createTopicProposal(
      "user-1",
      "   ",
      now,
      mockRepository,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_name");
    }
    expect(mockRepository.insertProposal).not.toHaveBeenCalled();
  });

  it("returns multiple matches when similar to multiple entries", async () => {
    mockRepository.findSimilarTopics.mockResolvedValue([
      { name: "Sailing", type: "active" },
      { name: "sailing", type: "pending" },
    ]);

    const result = await createTopicProposal(
      "user-1",
      "Sailing",
      now,
      mockRepository,
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "too_similar") {
      expect(result.matches).toHaveLength(2);
    }
  });
});
