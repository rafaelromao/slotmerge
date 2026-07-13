import { describe, expect, it, vi } from "vitest";

import { findSimilarTopics } from "../src/topics/proposals";

describe("findSimilarTopics", () => {
  const mockRepository = {
    listActiveTopics: vi.fn(),
    listPendingProposals: vi.fn(),
  };

  afterEach(() => {
    mockRepository.listActiveTopics.mockReset();
    mockRepository.listPendingProposals.mockReset();
  });

  it("returns empty array when no topics or proposals exist", async () => {
    mockRepository.listActiveTopics.mockResolvedValue([]);
    mockRepository.listPendingProposals.mockResolvedValue([]);

    const result = await findSimilarTopics("Sailing", mockRepository);

    expect(result).toEqual([]);
  });

  it("finds similar active topic by name", async () => {
    mockRepository.listActiveTopics.mockResolvedValue([
      { id: "topic-1", name: "Sailing", status: "active" as const },
    ]);
    mockRepository.listPendingProposals.mockResolvedValue([]);

    const result = await findSimilarTopics("Sailing", mockRepository);

    expect(result).toEqual([{ name: "Sailing", type: "active" as const }]);
  });

  it("finds similar pending proposal by name", async () => {
    mockRepository.listActiveTopics.mockResolvedValue([]);
    mockRepository.listPendingProposals.mockResolvedValue([
      {
        id: "proposal-1",
        candidateName: "Sailing",
        status: "pending" as const,
      },
    ]);

    const result = await findSimilarTopics("Sailing", mockRepository);

    expect(result).toEqual([{ name: "Sailing", type: "pending" as const }]);
  });

  it("returns multiple matches above threshold", async () => {
    mockRepository.listActiveTopics.mockResolvedValue([
      { id: "topic-1", name: "Product Strategy", status: "active" as const },
    ]);
    mockRepository.listPendingProposals.mockResolvedValue([
      {
        id: "proposal-1",
        candidateName: "Product strategy",
        status: "pending" as const,
      },
    ]);

    const result = await findSimilarTopics("Product  Strategy", mockRepository);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ name: "Product Strategy", type: "active" });
    expect(result).toContainEqual({
      name: "Product strategy",
      type: "pending",
    });
  });

  it("does not return non-matching topics", async () => {
    mockRepository.listActiveTopics.mockResolvedValue([
      { id: "topic-1", name: "Engineering", status: "active" as const },
    ]);
    mockRepository.listPendingProposals.mockResolvedValue([]);

    const result = await findSimilarTopics("Sailing", mockRepository);

    expect(result).toEqual([]);
  });

  it("excludes retired topics from active topics check", async () => {
    mockRepository.listActiveTopics.mockResolvedValue([
      { id: "topic-1", name: "Retired Topic", status: "retired" as const },
    ]);
    mockRepository.listPendingProposals.mockResolvedValue([]);

    const result = await findSimilarTopics("Retired Topic", mockRepository);

    expect(result).toEqual([]);
  });
});
