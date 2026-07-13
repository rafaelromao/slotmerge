import { afterEach, describe, expect, it } from "vitest";

import type { UserProfile } from "../profile/repository";

import { InMemorySearchRepository } from "./in-memory-repository";
import {
  type ActiveTopicsRepository,
  type Clock,
  type ProfileRepository,
  type SearchInput,
  createSearchInputBuilder,
  rerunSearch,
  submitSearch,
  validateSearchInput,
} from "./search-input";
import { setSearchRepositoryForTests } from "./repository";
import { setSearchResultRepositoryForTests } from "./search-result-repository";
import type {
  SearchResultRepository,
  SearchResultRecord,
  SearchSnapshot,
} from "./search-result-repository";
import type { DiscoverableUserRepository } from "./discoverable-user-repository";
import type { MatchingDependencies } from "../matching/find-eligible-matches";

class InMemoryActiveTopicsRepository implements ActiveTopicsRepository {
  constructor(
    private readonly activeTopics: Array<{ id: string; name: string }> = [],
  ) {}

  async listActive(): Promise<
    Array<{ id: string; name: string; status: "active" }>
  > {
    await Promise.resolve();
    return this.activeTopics.map((t) => ({ ...t, status: "active" as const }));
  }
}

class InMemoryProfileRepository implements ProfileRepository {
  constructor(private readonly profile: UserProfile | null) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    await Promise.resolve();
    if (!this.profile) return null;
    if (this.profile.id !== userId) return null;
    return this.profile;
  }
}

const pinnedClock = (iso: string): Clock => ({
  now: () => new Date(iso),
});

const organizerProfile: UserProfile = {
  id: "organizer-1",
  email: "organizer@example.com",
  displayName: "Organizer",
  avatarUrl: null,
  shortBio: null,
  role: "organizer",
  status: "active",
  profileTimezone: "America/Sao_Paulo",
  bufferMinutes: 0,
};

const utcProfile: UserProfile = {
  ...organizerProfile,
  id: "organizer-2",
  profileTimezone: null,
};

class InMemorySearchResultRepository implements SearchResultRepository {
  async save(record: SearchResultRecord) {
    await Promise.resolve();
    return { ...record, id: record.id ?? "sr-1" };
  }
  async findById() {
    await Promise.resolve();
    return null;
  }
  async findBySearchId() {
    await Promise.resolve();
    return null;
  }
}

class InMemoryDiscoverableUserRepository implements DiscoverableUserRepository {
  async listDiscoverableUserIds() {
    await Promise.resolve();
    return [];
  }
}

const mockMatchingDependencies: MatchingDependencies = {
  listSelectedTopicIds() {
    return Promise.resolve([]);
  },
  computeEffectiveAvailability() {
    return [];
  },
  getUserAvailabilityData() {
    return Promise.resolve({
      profileTimezone: "UTC",
      bufferMinutes: 0,
      windows: [],
      overrides: [],
      busyIntervals: [],
    });
  },
  isUserEligibleForSearch() {
    return Promise.resolve(false);
  },
};

describe("buildSearchInput", () => {
  it("returns the documented defaults when no overrides are supplied", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-1",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    const input = await builder.build({});

    expect(input.organizerId).toBe("organizer-1");
    expect(input.selectedTopicIds).toEqual([]);
    expect(input.minimumMatchingUsers).toBe(2);
    expect(input.durationMinutes).toBe(60);
    expect(input.organizerTimezone).toBe("America/Sao_Paulo");
    expect(input.dateRangeStart.toISOString()).toBe("2026-07-06T03:00:00.000Z");
    expect(input.dateRangeEnd.toISOString()).toBe("2026-08-10T03:00:00.000Z");
  });

  it("falls back to UTC when the organizer profile has no timezone", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-2",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([]),
      profileRepository: new InMemoryProfileRepository(utcProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    const input = await builder.build({});

    expect(input.organizerTimezone).toBe("UTC");
    expect(input.dateRangeStart.toISOString()).toBe("2026-07-06T00:00:00.000Z");
    expect(input.dateRangeEnd.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("honors organizer-supplied overrides for the fields that matter", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-1",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
        { id: "topic-2", name: "AI engineering" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    const input = await builder.build({
      selectedTopicIds: ["topic-1", "topic-2"],
      minimumMatchingUsers: 5,
      durationMinutes: 90,
      dateRangeStart: new Date("2026-08-03T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
      organizerTimezone: "America/New_York",
    });

    expect(input.selectedTopicIds).toEqual(["topic-1", "topic-2"]);
    expect(input.minimumMatchingUsers).toBe(5);
    expect(input.durationMinutes).toBe(90);
    expect(input.dateRangeStart.toISOString()).toBe("2026-08-03T03:00:00.000Z");
    expect(input.dateRangeEnd.toISOString()).toBe("2026-08-10T03:00:00.000Z");
    expect(input.organizerTimezone).toBe("America/New_York");
  });

  it("preserves default fields that are not overridden", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-1",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    const input = await builder.build({ minimumMatchingUsers: 4 });

    expect(input.minimumMatchingUsers).toBe(4);
    expect(input.durationMinutes).toBe(60);
    expect(input.selectedTopicIds).toEqual([]);
    expect(input.organizerTimezone).toBe("America/Sao_Paulo");
  });
});

describe("validateSearchInput", () => {
  const baseInput: SearchInput = {
    organizerId: "organizer-1",
    selectedTopicIds: ["topic-1"],
    minimumMatchingUsers: 2,
    durationMinutes: 60,
    dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
    dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
    organizerTimezone: "America/Sao_Paulo",
  };

  it("accepts the canonical valid input", () => {
    const result = validateSearchInput(baseInput, { matchingPoolSize: 5 });
    expect(result).toEqual({ ok: true });
  });

  it("rejects when no active Topic is selected", () => {
    const result = validateSearchInput(
      { ...baseInput, selectedTopicIds: [] },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "selectedTopicIds",
      message: "Select at least one active Topic.",
    });
  });

  it("rejects when minimumMatchingUsers is below 2", () => {
    const result = validateSearchInput(
      { ...baseInput, minimumMatchingUsers: 1 },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "minimumMatchingUsers",
      message: "Minimum matching Users must be at least 2.",
    });
  });

  it("rejects when minimumMatchingUsers exceeds the matching pool size", () => {
    const result = validateSearchInput(
      { ...baseInput, minimumMatchingUsers: 10 },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "minimumMatchingUsers",
      message:
        "Minimum matching Users cannot exceed the matching pool size (5).",
    });
  });

  it("rejects when durationMinutes is null", () => {
    const result = validateSearchInput(
      { ...baseInput, durationMinutes: null },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "durationMinutes",
      message: "Meeting duration is required.",
    });
  });

  it("rejects when durationMinutes is non-positive", () => {
    const result = validateSearchInput(
      { ...baseInput, durationMinutes: 0 },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "durationMinutes",
      message: "Meeting duration must be greater than zero.",
    });
  });

  it("rejects when the date range end is before or equal to start", () => {
    const result = validateSearchInput(
      {
        ...baseInput,
        dateRangeStart: new Date("2026-08-10T03:00:00.000Z"),
        dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
      },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "dateRangeEnd",
      message: "Date range end must be after the start.",
    });
  });

  it("rejects when the date range carries non-zero minutes or seconds", () => {
    const result = validateSearchInput(
      {
        ...baseInput,
        dateRangeStart: new Date("2026-07-06T03:30:00.000Z"),
      },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "dateRangeStart",
      message: "Date range start must align to whole minutes (:00 seconds).",
    });
  });

  it("rejects when organizerTimezone is not a valid IANA zone", () => {
    const result = validateSearchInput(
      { ...baseInput, organizerTimezone: "Mars/Olympus" },
      { matchingPoolSize: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors).toContainEqual({
      field: "organizerTimezone",
      message: "Organizer timezone must be a valid IANA zone.",
    });
  });

  it("collects multiple errors in a single result", () => {
    const result = validateSearchInput(
      {
        ...baseInput,
        selectedTopicIds: [],
        minimumMatchingUsers: 0,
        durationMinutes: -1,
        organizerTimezone: "",
      },
      { matchingPoolSize: 1 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    const fields = new Set(result.errors.map((e) => e.field));
    expect(fields).toEqual(
      new Set([
        "selectedTopicIds",
        "minimumMatchingUsers",
        "durationMinutes",
        "organizerTimezone",
      ]),
    );
  });
});

describe("buildSearchInput integration with validateSearchInput", () => {
  it("builds a default that validates when the active Topics and pool are large enough", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-1",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    const built = await builder.build({
      selectedTopicIds: ["topic-1"],
      durationMinutes: 60,
    });

    const result = validateSearchInput(built, { matchingPoolSize: 5 });
    expect(result.ok).toBe(true);
  });

  it("returns empty selectedTopicIds when the active Topics repository is empty", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-1",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    const input = await builder.build({});

    expect(input.selectedTopicIds).toEqual([]);
  });

  it("rejects overrides that name a Topic outside the active catalogue", async () => {
    const builder = createSearchInputBuilder({
      organizerId: "organizer-1",
      activeTopicsRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
    });

    await expect(
      builder.build({ selectedTopicIds: ["topic-1", "topic-99"] }),
    ).rejects.toThrow(/Topic topic-99 is not in the active Topics catalogue/);
  });
});

describe("submitSearch", () => {
  afterEach(() => {
    setSearchRepositoryForTests(null);
  });

  it("persists a validated Search and returns the stored record", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);
    const searchResultRepo = new InMemorySearchResultRepository();
    setSearchResultRepositoryForTests(searchResultRepo);

    const result = await submitSearch(
      {
        organizerId: "organizer-1",
        activeTopicsRepository: new InMemoryActiveTopicsRepository([
          { id: "topic-1", name: "Product strategy" },
        ]),
        profileRepository: new InMemoryProfileRepository(organizerProfile),
        clock: pinnedClock("2026-07-08T15:00:00.000Z"),
        matchingPoolSize: 5,
        matchingDependencies: mockMatchingDependencies,
        discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
        searchResultRepository: searchResultRepo,
      },
      {
        selectedTopicIds: ["topic-1"],
        durationMinutes: 60,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.search.id).toBeTypeOf("string");
    expect(result.search.organizerId).toBe("organizer-1");
    expect(result.search.selectedTopicIds).toEqual(["topic-1"]);
    expect(result.search.minimumMatchingUsers).toBe(2);
    expect(result.search.durationMinutes).toBe(60);
    expect(result.search.organizerTimezone).toBe("America/Sao_Paulo");
    expect(result.search.generatedAt.toISOString()).toBe(
      "2026-07-08T15:00:00.000Z",
    );
  });

  it("returns validation errors without persisting when the input is invalid", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);

    const result = await submitSearch(
      {
        organizerId: "organizer-1",
        activeTopicsRepository: new InMemoryActiveTopicsRepository([]),
        profileRepository: new InMemoryProfileRepository(organizerProfile),
        clock: pinnedClock("2026-07-08T15:00:00.000Z"),
        matchingPoolSize: 5,
        matchingDependencies: mockMatchingDependencies,
        discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
        searchResultRepository: new InMemorySearchResultRepository(),
      },
      {
        selectedTopicIds: [],
        durationMinutes: 0,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("validation_failed");
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.field === "selectedTopicIds")).toBe(
      true,
    );
    expect(result.errors.some((e) => e.field === "durationMinutes")).toBe(true);

    const stored = await repo.listByOrganizer("organizer-1");
    expect(stored.length).toBe(0);
  });
});

describe("rerunSearch", () => {
  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
  });

  it("returns not_found when the original search does not exist", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);

    const result = await rerunSearch("nonexistent-id", {
      matchingDependencies: mockMatchingDependencies,
      discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      searchResultRepository: new InMemorySearchResultRepository(),
      topicRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("not_found");
  });

  it("creates a new search with the same parameters but a new ID", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);
    const searchResultRepo = new InMemorySearchResultRepository();
    setSearchResultRepositoryForTests(searchResultRepo);

    const originalSearch = await repo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 3,
      durationMinutes: 90,
      dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T03:00:00.000Z"),
      organizerTimezone: "America/Sao_Paulo",
      generatedAt: new Date("2026-07-01T10:00:00.000Z"),
    });

    const result = await rerunSearch(originalSearch.id!, {
      matchingDependencies: mockMatchingDependencies,
      discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      searchResultRepository: searchResultRepo,
      topicRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.search.id).not.toBe(originalSearch.id);
    expect(result.search.organizerId).toBe(originalSearch.organizerId);
    expect(result.search.selectedTopicIds).toEqual(
      originalSearch.selectedTopicIds,
    );
    expect(result.search.minimumMatchingUsers).toBe(
      originalSearch.minimumMatchingUsers,
    );
    expect(result.search.durationMinutes).toBe(originalSearch.durationMinutes);
    expect(result.search.organizerTimezone).toBe(
      originalSearch.organizerTimezone,
    );
  });

  it("creates a new snapshot for the new search", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);
    let savedSnapshot: SearchResultRecord | null = null;
    const trackingRepo: SearchResultRepository = {
      save(record) {
        savedSnapshot = { ...record, id: record.id ?? "sr-tracked" };
        return Promise.resolve(savedSnapshot);
      },
      findById() {
        return Promise.resolve(null);
      },
      findBySearchId() {
        return Promise.resolve(savedSnapshot);
      },
    };
    setSearchResultRepositoryForTests(trackingRepo);

    const originalSearch = await repo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T03:00:00.000Z"),
      organizerTimezone: "America/Sao_Paulo",
      generatedAt: new Date("2026-07-01T10:00:00.000Z"),
    });

    const result = await rerunSearch(originalSearch.id!, {
      matchingDependencies: mockMatchingDependencies,
      discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      searchResultRepository: trackingRepo,
      topicRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(savedSnapshot).not.toBeNull();
    expect(savedSnapshot!.searchId).toBe(result.search.id);
  });

  it("returns topics_invalid when the original search topics are no longer active", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);

    const originalSearch = await repo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-deactivated"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T03:00:00.000Z"),
      organizerTimezone: "America/Sao_Paulo",
      generatedAt: new Date("2026-07-01T10:00:00.000Z"),
    });

    const result = await rerunSearch(originalSearch.id!, {
      matchingDependencies: mockMatchingDependencies,
      discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      searchResultRepository: new InMemorySearchResultRepository(),
      topicRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("topics_invalid");
  });

  it("preserves the original search and its snapshot when rerunning", async () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);

    const originalSearch = await repo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T03:00:00.000Z"),
      organizerTimezone: "America/Sao_Paulo",
      generatedAt: new Date("2026-07-01T10:00:00.000Z"),
    });

    const originalSnapshotJson: SearchSnapshot = {
      generatedAt: "2026-07-01T10:00:00.000Z",
      organizerTimezone: "America/Sao_Paulo",
      dateRangeStart: "2026-07-06T03:00:00.000Z",
      dateRangeEnd: "2026-07-13T03:00:00.000Z",
      durationMinutes: 60,
      slots: [],
    };

    const savedSnapshots: SearchResultRecord[] = [];
    const trackingRepo: SearchResultRepository = {
      save(record) {
        const saved = {
          ...record,
          id: record.id ?? `sr-${savedSnapshots.length}`,
        };
        savedSnapshots.push(saved);
        return Promise.resolve(saved);
      },
      findById() {
        return Promise.resolve(null);
      },
      findBySearchId(searchId: string) {
        const found =
          savedSnapshots.find((s) => s.searchId === searchId) ?? null;
        return Promise.resolve(found);
      },
    };

    savedSnapshots.push({
      id: "sr-original",
      searchId: originalSearch.id!,
      snapshotJson: originalSnapshotJson,
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
    });

    setSearchResultRepositoryForTests(trackingRepo);

    await rerunSearch(originalSearch.id!, {
      matchingDependencies: mockMatchingDependencies,
      discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      searchResultRepository: trackingRepo,
      topicRepository: new InMemoryActiveTopicsRepository([
        { id: "topic-1", name: "Product strategy" },
      ]),
      profileRepository: new InMemoryProfileRepository(organizerProfile),
    });

    const originalSearchStillExists = await repo.findById(originalSearch.id!);
    expect(originalSearchStillExists).not.toBeNull();
    expect(originalSearchStillExists!.id).toBe(originalSearch.id);

    const originalSnapshot = await trackingRepo.findBySearchId(
      originalSearch.id!,
    );
    expect(originalSnapshot).not.toBeNull();
    expect(originalSnapshot!.searchId).toBe(originalSearch.id);
    expect(originalSnapshot!.snapshotJson).toEqual(originalSnapshotJson);

    const allSnapshots = savedSnapshots.filter(
      (s) => s.searchId === originalSearch.id,
    );
    expect(allSnapshots.length).toBe(1);
    expect(allSnapshots[0].id).toBe("sr-original");
  });
});
