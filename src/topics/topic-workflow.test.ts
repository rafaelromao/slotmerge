import { describe, expect, it, vi } from "vitest";

import {
  createTopicWorkflow,
  TOPIC_NAME_MAX_LENGTH,
  TOPIC_NAME_MIN_LENGTH,
  type TopicProposalRow,
  type TopicRow,
  type TopicWorkflow,
} from "./topic-workflow";
import type { CreateTopicProposalResult, SimilarMatch } from "./proposals";
import type { Clock } from "../system/clock";

const FIXED_DATE = new Date("2026-07-12T12:00:00.000Z");

function fixedClock(): Clock {
  return { now: () => FIXED_DATE };
}

function buildWorkflow(
  overrides: Partial<{
    catalogue: TopicRow[];
    selectedTopicIds: string[];
    userProposals: TopicProposalRow[];
  }> = {},
): TopicWorkflow {
  return createTopicWorkflow({
    catalogue: {
      listActive: () => Promise.resolve(overrides.catalogue ?? []),
      listSelectedTopicIds: () =>
        Promise.resolve(overrides.selectedTopicIds ?? []),
    },
    proposals: {
      listUserProposals: () =>
        Promise.resolve(overrides.userProposals ?? []),
    },
    clock: fixedClock(),
  });
}

describe("topic workflow — loadPageState", () => {
  it("returns the active catalogue sorted alphabetically and the selected ids", async () => {
    const workflow = buildWorkflow({
      catalogue: [
        { id: "topic-zeta", name: "Product strategy", status: "active" },
        { id: "topic-alpha", name: "AI engineering", status: "active" },
        { id: "topic-retired", name: "Legacy codebase", status: "retired" },
      ],
      selectedTopicIds: ["topic-alpha"],
    });

    const state = await workflow.loadPageState({ userId: "user-1" });

    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.catalogue.map((t) => t.name)).toEqual([
      "AI engineering",
      "Product strategy",
    ]);
    expect(state.value.selectedTopicIds).toEqual(["topic-alpha"]);
  });

  it("joins proposals with their underlying topic to derive the displayed status", async () => {
    const workflow = buildWorkflow({
      catalogue: [
        { id: "topic-1", name: "AI engineering", status: "active" },
        {
          id: "topic-2",
          name: "Newly approved topic",
          status: "active",
        },
      ],
      selectedTopicIds: ["topic-1"],
      userProposals: [
        {
          id: "proposal-pending",
          candidateName: "Brand new topic",
          status: "pending",
        },
        {
          id: "proposal-approved",
          candidateName: "Newly approved topic",
          status: "approved",
        },
        {
          id: "proposal-rejected",
          candidateName: "Already rejected",
          status: "rejected",
        },
        {
          id: "proposal-retired",
          candidateName: "Old retired topic",
          status: "approved",
        },
      ],
    });

    const state = await workflow.loadPageState({ userId: "user-1" });

    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const proposals = state.value.proposals;
    expect(proposals).toHaveLength(4);
    expect(proposals.map((p) => p.displayStatus)).toEqual([
      "pending",
      "active",
      "rejected",
      "retired",
    ]);
    expect(
      proposals.find((p) => p.id === "proposal-retired")?.topicId,
    ).toBeUndefined();
  });

  it("returns an empty list when the user has no proposals", async () => {
    const workflow = buildWorkflow();
    const state = await workflow.loadPageState({ userId: "user-1" });
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.proposals).toEqual([]);
    expect(state.value.catalogue).toEqual([]);
    expect(state.value.selectedTopicIds).toEqual([]);
  });
});

describe("topic workflow — saveSelection", () => {
  it("returns ok with the selected ids after delegating to replaceUserTopics", async () => {
    let capturedTopicIds: string[] | null = null;
    let capturedUserId: string | null = null;
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "AI engineering", status: "active" },
            { id: "topic-2", name: "Product strategy", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: { listUserProposals: () => Promise.resolve([]) },
      clock: fixedClock(),
      replaceUserTopics: ({ userId, topicIds }) => {
        capturedUserId = userId;
        capturedTopicIds = topicIds;
        return Promise.resolve();
      },
    });

    const result = await workflow.saveSelection({
      userId: "user-1",
      topicIds: ["topic-1", "topic-2"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.selectedTopicIds).toEqual(["topic-1", "topic-2"]);
    expect(capturedUserId).toBe("user-1");
    expect(capturedTopicIds).toEqual(["topic-1", "topic-2"]);
  });

  it("rejects an empty selection as an explicit no-op that replaces with no active associations", async () => {
    let savedTopicIds: string[] | null = null;
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "AI engineering", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: { listUserProposals: () => Promise.resolve([]) },
      clock: fixedClock(),
      replaceUserTopics: ({ topicIds }) => {
        savedTopicIds = topicIds;
        return Promise.resolve();
      },
    });

    const result = await workflow.saveSelection({
      userId: "user-1",
      topicIds: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.selectedTopicIds).toEqual([]);
    expect(savedTopicIds).toEqual([]);
  });

  it("returns invalid_topic_ids when an unknown id is present", async () => {
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "AI engineering", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: { listUserProposals: () => Promise.resolve([]) },
      clock: fixedClock(),
    });

    const result = await workflow.saveSelection({
      userId: "user-1",
      topicIds: ["topic-1", "topic-unknown"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "invalid_topic_ids",
      invalidIds: ["topic-unknown"],
    });
  });

  it("returns invalid_topic_ids when an id is an empty string", async () => {
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "AI engineering", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: { listUserProposals: () => Promise.resolve([]) },
      clock: fixedClock(),
    });

    const result = await workflow.saveSelection({
      userId: "user-1",
      topicIds: ["topic-1", ""],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_topic_ids");
  });
});

function makeSuccessResult(
  overrides: Partial<{
    id: string;
    candidateName: string;
    status: string;
    createdAt: Date;
  }> = {},
): CreateTopicProposalResult {
  return {
    ok: true,
    proposal: {
      id: overrides.id ?? "proposal-1",
      candidateName: overrides.candidateName ?? "Sailing",
      status: overrides.status ?? "pending",
      createdAt: overrides.createdAt ?? FIXED_DATE,
    },
  };
}

function makeTooSimilarResult(matches: SimilarMatch[]): CreateTopicProposalResult {
  return { ok: false, reason: "too_similar", matches };
}

function makeAlreadyPendingResult(id: string): CreateTopicProposalResult {
  return { ok: false, reason: "already_pending", proposalId: id };
}

describe("topic workflow — propose", () => {
  it("returns ok with the inserted proposal row on success", async () => {
    const createProposal = vi.fn(async () => makeSuccessResult());
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "AI engineering", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "Sailing",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal).toEqual({
      id: "proposal-1",
      candidateName: "Sailing",
      status: "pending",
      createdAt: FIXED_DATE,
    });
    expect(createProposal).toHaveBeenCalledOnce();
    expect(createProposal).toHaveBeenCalledWith(
      "user-1",
      "Sailing",
      FIXED_DATE,
    );
  });

  it("trims and collapses internal whitespace before delegating to createProposal", async () => {
    const createProposal = vi.fn(async () => makeSuccessResult());
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () => Promise.resolve([]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    await workflow.propose({
      userId: "user-1",
      candidateName: "  New   Topic  ",
    });

    expect(createProposal).toHaveBeenCalledWith(
      "user-1",
      "New Topic",
      FIXED_DATE,
    );
  });

  it("returns too_similar with the matching names when createTopicProposal blocks on similarity", async () => {
    const matches: SimilarMatch[] = [
      { name: "Product strategy", type: "active" },
    ];
    const createProposal = vi.fn(async () => makeTooSimilarResult(matches));
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "Product strategy", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "Product strateg",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("too_similar");
    if (result.error.code === "too_similar") {
      expect(result.error.matches).toEqual(matches);
    }
  });

  it("returns already_pending when the user already has a pending proposal of this name", async () => {
    const createProposal = vi.fn(async () =>
      makeAlreadyPendingResult("proposal-pending"),
    );
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () =>
          Promise.resolve([
            { id: "topic-1", name: "AI engineering", status: "active" },
          ]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "Sailing",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("already_pending");
    if (result.error.code === "already_pending") {
      expect(result.error.proposalId).toBe("proposal-pending");
    }
  });

  it("returns invalid_name when the trimmed name is shorter than the minimum length", async () => {
    const createProposal = vi.fn();
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () => Promise.resolve([]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "a",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_name");
    expect(createProposal).not.toHaveBeenCalled();
  });

  it("returns invalid_name when the trimmed name is longer than the maximum length", async () => {
    const createProposal = vi.fn();
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () => Promise.resolve([]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "x".repeat(TOPIC_NAME_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_name");
    expect(createProposal).not.toHaveBeenCalled();
  });

  it("treats whitespace-only input as invalid", async () => {
    const createProposal = vi.fn();
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () => Promise.resolve([]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "    ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_name");
    expect(createProposal).not.toHaveBeenCalled();
  });

  it("accepts the minimum-length name", async () => {
    const createProposal = vi.fn(async () =>
      makeSuccessResult({ candidateName: "ab" }),
    );
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () => Promise.resolve([]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "ab",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts the maximum-length name", async () => {
    const createProposal = vi.fn(async () =>
      makeSuccessResult({ candidateName: "x".repeat(TOPIC_NAME_MAX_LENGTH) }),
    );
    const workflow = createTopicWorkflow({
      catalogue: {
        listActive: () => Promise.resolve([]),
        listSelectedTopicIds: () => Promise.resolve([]),
      },
      proposals: {
        listUserProposals: () => Promise.resolve([]),
      },
      createProposal,
      clock: fixedClock(),
    });

    const result = await workflow.propose({
      userId: "user-1",
      candidateName: "x".repeat(TOPIC_NAME_MAX_LENGTH),
    });
    expect(result.ok).toBe(true);
  });
});

describe("TOPIC_NAME bounds", () => {
  it("uses 2 as the minimum length", () => {
    expect(TOPIC_NAME_MIN_LENGTH).toBe(2);
  });
  it("uses 60 as the maximum length", () => {
    expect(TOPIC_NAME_MAX_LENGTH).toBe(60);
  });
});
