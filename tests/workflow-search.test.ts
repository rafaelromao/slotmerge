import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserProfile } from "../src/profile/repository";
import type { Clock } from "../src/system/clock";

import { InMemorySearchRepository } from "../src/search/in-memory-repository";

import {
  InMemoryActiveTopicsRepository,
  InMemoryDiscoverableUserRepository,
  InMemoryProfileRepository,
  InMemorySearchResultRepository,
  organizerProfile,
  pinnedClock,
  makeEligibleAssemblerDeps,
  utcProfile,
} from "./helpers/workflow-search-fixtures";

import {
  createSearchWorkflow,
  type SearchFormDefaults,
  type SearchWorkflow,
} from "../src/workflow/search";
import type { ActiveTopicsRepository } from "../src/search/search-input";
import type { DiscoverableUserRepository } from "../src/search/discoverable-user-repository";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { setSearchResultRepositoryForTests } from "../src/search/search-result-repository";
import { setDiscoverableUserRepositoryForTests } from "../src/search/discoverable-user-repository";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";

function buildWorkflow(
  overrides: {
    activeTopics?: Array<{ id: string; name: string }>;
    activeTopicsRepository?: ActiveTopicsRepository;
    clockIso?: string;
    profile?: UserProfile | null;
    discoverableUserIds?: string[];
    discoverableUserRepository?: DiscoverableUserRepository;
    assemblerDependencies?: ReturnType<typeof makeEligibleAssemblerDeps>;
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
  const workflowDiscoverableRepo =
    overrides.discoverableUserRepository ?? discoverableRepo;
  const assemblerDependencies =
    overrides.assemblerDependencies ??
    makeEligibleAssemblerDeps(
      overrides.discoverableUserIds ?? [],
      activeTopics,
    );
  setSearchRepositoryForTests(searchRepo);
  setSearchResultRepositoryForTests(resultRepo);
  setDiscoverableUserRepositoryForTests(discoverableRepo);
  setTopicCatalogueRepositoryForTests({
    listCatalogue: () =>
      Promise.resolve(
        activeTopics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          status: "active" as const,
        })),
      ),
    listSelectedTopicIds: () => Promise.resolve([]),
    listAssociations: () => Promise.resolve([]),
    saveAssociations: () => Promise.resolve(),
  });
  const workflow = createSearchWorkflow({
    clock,
    profileRepository: new InMemoryProfileRepository(profile),
    activeTopicsRepository:
      overrides.activeTopicsRepository ??
      new InMemoryActiveTopicsRepository(activeTopics),
    discoverableUserRepository: workflowDiscoverableRepo,
    searchResultRepository: resultRepo,
    assemblerDependencies,
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
    setTopicCatalogueRepositoryForTests(null);
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
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

describe("searchWorkflow.openSnapshot", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
  });

  it("returns the Search metadata together with the immutable Search Result snapshot", async () => {
    const { workflow, searchRepo } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });

    const runResult = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw(),
    });

    expect(runResult.ok).toBe(true);
    if (!runResult.ok) {
      throw new Error("expected search run to succeed");
    }

    const storedSearch = await searchRepo.findById(runResult.value.searchId);
    expect(storedSearch).not.toBeNull();
    if (!storedSearch) {
      throw new Error("expected stored search to exist");
    }

    const opened = await workflow.openSnapshot({
      userId: "organizer-1",
      searchId: storedSearch.id!,
    });

    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      throw new Error("expected openSnapshot to succeed");
    }

    expect(opened.value.search.id).toBe(storedSearch.id);
    expect(opened.value.search.organizerId).toBe("organizer-1");
    expect(opened.value.selectedTopics).toEqual([
      { id: "topic-1", name: "Product strategy" },
    ]);
    expect(opened.value.snapshot.generatedAt).toBe(
      storedSearch.generatedAt.toISOString(),
    );
    expect(opened.value.snapshot.slots.length).toBeGreaterThan(0);
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

  it("counts only all-topic matches and excludes the Organizer", async () => {
    const calls: Array<{
      selectedTopicIds: string[];
      options?: {
        excludeUserId?: string;
        requireAllTopics?: boolean;
      };
    }> = [];
    const discoverableUserRepository: DiscoverableUserRepository = {
      listDiscoverableUserIds(selectedTopicIds, options) {
        calls.push({ selectedTopicIds, options });
        return Promise.resolve(["user-with-all-topics"]);
      },
    };
    const { workflow } = buildWorkflow({
      discoverableUserRepository,
      assemblerDependencies: makeEligibleAssemblerDeps(
        ["user-with-all-topics"],
        undefined,
        discoverableUserRepository,
      ),
    });

    const result = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({ minimumMatchingUsers: 2 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.error.fieldErrors.minimumMatchingUsers).toBe(
      "minimum_out_of_range",
    );
    expect(calls).toEqual([
      {
        selectedTopicIds: ["topic-1"],
        options: { excludeUserId: "organizer-1", requireAllTopics: true },
      },
    ]);
  });

  it("returns minimum_out_of_range when a discoverable User is excluded by setup or availability", async () => {
    const discoverableUserRepository: DiscoverableUserRepository = {
      listDiscoverableUserIds() {
        return Promise.resolve(["user-ready", "user-missing-availability"]);
      },
    };
    const assemblerDependencies = makeEligibleAssemblerDeps([
      "user-ready",
      "user-missing-availability",
    ]);
    const { workflow } = buildWorkflow({
      discoverableUserRepository,
      assemblerDependencies: {
        ...assemblerDependencies,
        async loadUserAvailabilityData(userId: string) {
          if (userId === "user-missing-availability") {
            return {
              windows: [],
              overrides: [],
              busyIntervals: [],
            };
          }
          return assemblerDependencies.loadUserAvailabilityData(userId, {
            rangeStart: new Date("2026-07-06T03:00:00.000Z"),
            rangeEnd: new Date("2026-08-10T03:00:00.000Z"),
          });
        },
        computeEffectiveAvailability(inputs) {
          if (inputs.userId === "user-missing-availability") {
            return [];
          }
          return assemblerDependencies.computeEffectiveAvailability(inputs);
        },
      },
    });

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

describe("searchWorkflow.listHistory", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  async function seedTwoSearches(searchRepo: InMemorySearchRepository) {
    const earlier = await searchRepo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
      organizerTimezone: "America/Sao_Paulo",
      generatedAt: new Date("2026-07-08T09:00:00.000Z"),
    });
    searchRepo.setSnapshotId(earlier.id!, "snapshot-earlier");
    const later = await searchRepo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1", "topic-2"],
      minimumMatchingUsers: 3,
      durationMinutes: 30,
      dateRangeStart: new Date("2026-07-13T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-20T03:00:00.000Z"),
      organizerTimezone: "America/Sao_Paulo",
      generatedAt: new Date("2026-07-09T09:00:00.000Z"),
    });
    searchRepo.setSnapshotId(later.id!, "snapshot-later");
    return { earlier, later };
  }

  it("returns the shared chronological list newest first with display name and topic names", async () => {
    const { workflow, searchRepo } = buildWorkflow({
      activeTopics: [
        { id: "topic-1", name: "Product strategy" },
        { id: "topic-2", name: "AI engineering" },
      ],
      discoverableUserIds: ["user-1", "user-2", "user-3"],
    });
    const { earlier, later } = await seedTwoSearches(searchRepo);

    const result = await workflow.listHistory({ userId: "organizer-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected history result to succeed");
    const history = result.value;
    expect(history.map((item) => item.id)).toEqual([later.id, earlier.id]);
    expect(history).toHaveLength(2);

    const newest = history[0];
    expect(newest.organizerDisplayName).toBe("Organizer");
    expect(newest.selectedTopicIds).toEqual(["topic-1", "topic-2"]);
    expect(newest.selectedTopicNames).toEqual([
      "Product strategy",
      "AI engineering",
    ]);
    expect(newest.minimumMatchingUsers).toBe(3);
    expect(newest.durationMinutes).toBe(30);
    expect(newest.organizerTimezone).toBe("America/Sao_Paulo");
    expect(newest.snapshotId).toBe("snapshot-later");
    expect(newest.generatedAt.toISOString()).toBe(
      "2026-07-09T09:00:00.000Z",
    );

    const older = history[1];
    expect(older.selectedTopicNames).toEqual(["Product strategy"]);
    expect(older.snapshotId).toBe("snapshot-earlier");
  });

  it("is shared across Organizer and Admin callers", async () => {
    const { workflow, searchRepo } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });
    await seedTwoSearches(searchRepo);

    const organizerView = await workflow.listHistory({
      userId: "organizer-1",
    });
    const adminView = await workflow.listHistory({ userId: "admin-1" });

    expect(organizerView.ok).toBe(true);
    expect(adminView.ok).toBe(true);
    if (!organizerView.ok || !adminView.ok) {
      throw new Error("expected history results to succeed");
    }
    expect(organizerView.value.map((item) => item.id)).toEqual(
      adminView.value.map((item) => item.id),
    );
    expect(organizerView.value).toHaveLength(2);
    expect(adminView.value).toHaveLength(2);
  });

  it("returns an empty ok result when there are no Search Results yet", async () => {
    const { workflow } = buildWorkflow();
    const result = await workflow.listHistory({ userId: "organizer-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected history result to succeed");
    expect(result.value).toEqual([]);
  });

  it("returns history_unavailable when the underlying repository throws", async () => {
    let attempted = false;
    setSearchRepositoryForTests({
      listSearchHistory() {
        attempted = true;
        return Promise.reject(new Error("database unreachable"));
      },
      save() {
        return Promise.reject(new Error("not used"));
      },
      findById() {
        return Promise.resolve(null);
      },
      listByOrganizer() {
        return Promise.resolve([]);
      },
      listAll() {
        return Promise.resolve([]);
      },
    });
    const { createSearchWorkflow } = await import("../src/workflow/search");
    const {
      InMemoryActiveTopicsRepository,
      InMemoryDiscoverableUserRepository,
      InMemoryProfileRepository,
      InMemorySearchResultRepository,
      pinnedClock,
      organizerProfile,
    } = await import("./helpers/workflow-search-fixtures");
    const workflow = createSearchWorkflow({
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      activeTopicsRepository: new InMemoryActiveTopicsRepository(),
      discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
      searchResultRepository: new InMemorySearchResultRepository(),
    });
    const result = await workflow.listHistory({ userId: "organizer-1" });
    expect(attempted).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.reason).toBe("history_unavailable");
  });
});

describe("searchWorkflow.rerun", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  it("returns search_not_found when the source Search id is unknown", async () => {
    const { workflow } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2"],
    });
    const result = await workflow.rerun({
      userId: "organizer-1",
      searchId: "missing-search",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.reason).toBe("search_not_found");
  });

  it("persists a new Search and immutable Search Result using the source's parameters", async () => {
    const { workflow, searchRepo } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2", "user-3"],
    });

    const initial = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw(),
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error("expected initial run to succeed");
    const firstSearchId = initial.value.searchId;

    const result = await workflow.rerun({
      userId: "organizer-1",
      searchId: firstSearchId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected rerun to succeed");
    expect(result.value.searchId).not.toBe(firstSearchId);

    const newSearch = await searchRepo.findById(result.value.searchId);
    expect(newSearch).not.toBeNull();
    if (!newSearch) throw new Error("expected rerun search to exist");
    expect(newSearch.selectedTopicIds).toEqual(["topic-1"]);
    expect(newSearch.minimumMatchingUsers).toBe(2);
    expect(newSearch.durationMinutes).toBe(60);
    expect(newSearch.organizerTimezone).toBe("America/Sao_Paulo");
    expect(newSearch.organizerId).toBe("organizer-1");

    const source = await searchRepo.findById(firstSearchId);
    expect(source).not.toBeNull();

    const all = await searchRepo.listAll();
    expect(all).toHaveLength(2);
  });

  it("attributes the rerun to a different Organizer while keeping the source Parameters", async () => {
    const { workflow, searchRepo } = buildWorkflow({
      discoverableUserIds: ["user-1", "user-2", "user-3"],
    });

    const initial = await workflow.run({
      userId: "organizer-1",
      raw: defaultRaw({
        selectedTopicIds: ["topic-1"],
      }),
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error("expected initial run to succeed");
    const sourceSearchId = initial.value.searchId;

    const result = await workflow.rerun({
      userId: "organizer-2",
      searchId: sourceSearchId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected rerun to succeed");

    const rerun = await searchRepo.findById(result.value.searchId);
    expect(rerun).not.toBeNull();
    if (!rerun) throw new Error("expected rerun search to exist");
    expect(rerun.organizerId).toBe("organizer-2");
    expect(rerun.selectedTopicIds).toEqual(["topic-1"]);
    expect(rerun.minimumMatchingUsers).toBe(2);
    expect(rerun.durationMinutes).toBe(60);
    expect(rerun.organizerTimezone).toBe("America/Sao_Paulo");

    const source = await searchRepo.findById(sourceSearchId);
    expect(source).not.toBeNull();
    if (!source) throw new Error("expected source search to exist");
    expect(source.organizerId).toBe("organizer-1");

    const all = await searchRepo.listAll();
    expect(all).toHaveLength(2);
  });
});
