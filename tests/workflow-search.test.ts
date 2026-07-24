import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserProfile } from "../src/profile/repository";
import type { Clock } from "../src/system/clock";

import { InMemorySearchRepository } from "../src/search/in-memory-repository";

import {
  InMemoryActiveTopicsRepository,
  InMemoryDiscoverableUserRepository,
  InMemoryProfileRepository,
  InMemorySearchResultRepository,
  mockAssemblerDeps,
  organizerProfile,
  pinnedClock,
  utcProfile,
} from "./helpers/workflow-search-fixtures";

import {
  createSearchWorkflow,
  type SearchFormDefaults,
  type SearchWorkflow,
} from "../src/workflow/search";
import type { ActiveTopicsRepository } from "../src/search/search-input";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { setSearchResultRepositoryForTests } from "../src/search/search-result-repository";
import { setDiscoverableUserRepositoryForTests } from "../src/search/discoverable-user-repository";

function buildWorkflow(
  overrides: {
    activeTopics?: Array<{ id: string; name: string }>;
    activeTopicsRepository?: ActiveTopicsRepository;
    clockIso?: string;
    profile?: UserProfile | null;
    discoverableUserIds?: string[];
  } = {},
): {
  workflow: SearchWorkflow;
  clock: Clock;
  searchRepo: InMemorySearchRepository;
  resultRepo: InMemorySearchResultRepository;
  discoverableRepo: InMemoryDiscoverableUserRepository;
} {
  const clock = pinnedClock(overrides.clockIso ?? "2026-07-08T15:00:00.000Z");
  const activeTopics =
    overrides.activeTopics !== undefined
      ? overrides.activeTopics
      : [{ id: "topic-1", name: "Product strategy" }];
  const profile =
    overrides.profile !== undefined ? overrides.profile : organizerProfile;
  const searchRepo = new InMemorySearchRepository();
  const resultRepo = new InMemorySearchResultRepository();
  const discoverableRepo = new InMemoryDiscoverableUserRepository(
    overrides.discoverableUserIds ?? [],
  );
  setSearchRepositoryForTests(searchRepo);
  setSearchResultRepositoryForTests(resultRepo);
  setDiscoverableUserRepositoryForTests(discoverableRepo);
  const workflow = createSearchWorkflow({
    clock,
    profileRepository: new InMemoryProfileRepository(profile),
    activeTopicsRepository:
      overrides.activeTopicsRepository ??
      new InMemoryActiveTopicsRepository(activeTopics),
    discoverableUserRepository: discoverableRepo,
    searchResultRepository: resultRepo,
    assemblerDependencies: mockAssemblerDeps,
  });
  return { workflow, clock, searchRepo, resultRepo, discoverableRepo };
}

const defaultRaw = (
  overrides: Partial<SearchFormDefaults> = {},
): SearchFormDefaults => ({
  selectedTopicIds: ["topic-1"],
  minimumMatchingUsers: 2,
  durationMinutes: 60,
  dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
  dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
  organizerTimezone: "America/Sao_Paulo",
  ...overrides,
});

describe("searchWorkflow.buildForm", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
  });

  it("returns the per-Organizer defaults", async () => {
    const { workflow } = buildWorkflow();
    const state = await workflow.buildForm({ userId: "organizer-1" });

    expect(state.defaults.selectedTopicIds).toEqual([]);
    expect(state.defaults.minimumMatchingUsers).toBe(2);
    expect(state.defaults.durationMinutes).toBe(60);
    expect(state.defaults.dateRangeStart.toISOString()).toBe(
      "2026-07-06T03:00:00.000Z",
    );
    expect(state.defaults.dateRangeEnd.toISOString()).toBe(
      "2026-08-10T03:00:00.000Z",
    );
    expect(state.defaults.organizerTimezone).toBe("America/Sao_Paulo");
    expect(state.profileTimezone).toBe("America/Sao_Paulo");
  });

  it("falls back to UTC for the date range when the profile has no timezone", async () => {
    const { workflow } = buildWorkflow({ profile: utcProfile });
    const state = await workflow.buildForm({ userId: "organizer-2" });

    expect(state.defaults.organizerTimezone).toBe("");
    expect(state.profileTimezone).toBeNull();
    expect(state.defaults.dateRangeStart.toISOString()).toBe(
      "2026-07-06T00:00:00.000Z",
    );
    expect(state.defaults.dateRangeEnd.toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });
});

describe("searchWorkflow.run", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
  });

  it("returns selected_topics_required when zero topics are submitted", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ selectedTopicIds: [] }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.selectedTopics).toBe(
      "selected_topics_required",
    );
  });

  it("returns topic_retired when a selected topic is no longer active", async () => {
    const { workflow } = buildWorkflow({
      activeTopics: [{ id: "topic-1", name: "Product strategy" }],
    });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ selectedTopicIds: ["topic-1", "topic-retired"] }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.selectedTopics).toBe("topic_retired");
  });

  it("returns minimum_out_of_range when minimumMatchingUsers is below 2", async () => {
    const { workflow } = buildWorkflow({ discoverableUserIds: ["user-1"] });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ minimumMatchingUsers: 1 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.minimumMatchingUsers).toBe(
      "minimum_out_of_range",
    );
  });

  it("returns minimum_out_of_range when the matching pool has fewer than 2 Users", async () => {
    const { workflow } = buildWorkflow({ discoverableUserIds: ["user-1"] });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ minimumMatchingUsers: 2 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.minimumMatchingUsers).toBe(
      "minimum_out_of_range",
    );
  });

  it("returns minimum_out_of_range when minimumMatchingUsers exceeds the matching pool", async () => {
    const { workflow } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ minimumMatchingUsers: 5 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.minimumMatchingUsers).toBe(
      "minimum_out_of_range",
    );
  });

  it("returns duration_out_of_range when durationMinutes is below 15", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ durationMinutes: 10 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.durationMinutes).toBe(
      "duration_out_of_range",
    );
  });

  it("returns duration_out_of_range when durationMinutes is above 240", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ durationMinutes: 300 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.durationMinutes).toBe(
      "duration_out_of_range",
    );
  });

  it("parses a DST spring-forward date in the selected IANA timezone", async () => {
    const { workflow } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({
        organizerTimezone: "America/New_York",
        dateRangeStart: new Date("2026-03-08T05:00:00.000Z"),
        dateRangeEnd: new Date("2026-03-22T04:00:00.000Z"),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
  });

  it("parses a DST fall-back date in the selected IANA timezone", async () => {
    const { workflow } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({
        organizerTimezone: "America/New_York",
        dateRangeStart: new Date("2026-11-01T05:00:00.000Z"),
        dateRangeEnd: new Date("2026-11-15T05:00:00.000Z"),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
  });

  it("returns date_range_invalid for an invalid Date object", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: {
        ...defaultRaw(),
        dateRangeStart: new Date(NaN),
        dateRangeEnd: new Date("2026-03-15T03:00:00.000Z"),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.dateRangeEnd).toBe("date_range_invalid");
  });

  it("returns date_range_too_long when the date range exceeds 90 days", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({
        dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
        dateRangeEnd: new Date("2026-10-15T00:00:00.000Z"),
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.dateRangeEnd).toBe("date_range_too_long");
  });

  it("measures the maximum range in civil days across fall-back", async () => {
    const { workflow } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({
        organizerTimezone: "America/New_York",
        dateRangeStart: new Date("2026-08-04T04:00:00.000Z"),
        dateRangeEnd: new Date("2026-11-02T05:00:00.000Z"),
      }),
    });

    expect(result.ok).toBe(true);
  });

  it("returns date_range_invalid when end is not after start", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({
        dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
        dateRangeEnd: new Date("2026-07-06T03:00:00.000Z"),
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.dateRangeEnd).toBe("date_range_invalid");
  });

  it("returns organizer_timezone_required when the profile has no timezone and none was supplied", async () => {
    const { workflow } = buildWorkflow({
      profile: utcProfile,
      discoverableUserIds: [],
    });
    const result = await workflow.run({
      userId: "organizer-2",
      raw: defaultRaw({
        organizerTimezone: "",
        dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
        dateRangeEnd: new Date("2026-08-10T00:00:00.000Z"),
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.organizerTimezone).toBe(
      "organizer_timezone_required",
    );
  });

  it("uses civil dates for defaults across fall-back", async () => {
    const { workflow } = buildWorkflow({
      clockIso: "2026-10-14T12:00:00.000Z",
      profile: { ...organizerProfile, profileTimezone: "America/New_York" },
    });
    const state = await workflow.buildForm({ userId: "organizer-1" });

    expect(state.defaults.dateRangeStart.toISOString()).toBe(
      "2026-10-12T04:00:00.000Z",
    );
    expect(state.defaults.dateRangeEnd.toISOString()).toBe(
      "2026-11-16T05:00:00.000Z",
    );
  });

  it("uses one active-Topic snapshot for validation and persistence", async () => {
    let calls = 0;
    const activeTopicsRepository: ActiveTopicsRepository = {
      listActive() {
        calls += 1;
        return Promise.resolve(
          calls === 1
            ? [{ id: "topic-1", name: "Product strategy", status: "active" }]
            : [],
        );
      },
    };
    const { workflow } = buildWorkflow({
      activeTopicsRepository,
      discoverableUserIds: ["user-1", "user-2"],
    });

    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw(),
    });

    expect(result.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("persists a Search and immutable Search Result on valid input", async () => {
    const { workflow, searchRepo, resultRepo } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2", "user-3"],
    });
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.value.searchId).toMatch(/.+/);
    const stored = await searchRepo.findById(result.value.searchId);
    expect(stored?.selectedTopicIds).toEqual(["topic-1"]);
    const storedResult = await resultRepo.findBySearchId(result.value.searchId);
    expect(storedResult?.snapshotJson.generatedAt).toBe(
      "2026-07-08T15:00:00.000Z",
    );
  });

  it("does not persist a Search when validation fails", async () => {
    const { workflow, searchRepo } = buildWorkflow();
    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ selectedTopicIds: [] }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    const all = await searchRepo.listAll();
    expect(all).toHaveLength(0);
  });
});
