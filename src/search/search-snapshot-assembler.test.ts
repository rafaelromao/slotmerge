import { describe, expect, it } from "vitest";

import type { Clock } from "./search-input";
import type { ActiveTopicsRepository } from "./search-input";
import type { DiscoverableUserRepository } from "./discoverable-user-repository";
import type { UserProfile } from "../profile/repository";
import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";
import type { Interval } from "../matching/effective-availability";

import {
  SearchSnapshotAssembler,
  type SearchSnapshotAssemblerDeps,
  type SearchSnapshotAssemblerInput,
} from "./search-snapshot-assembler";

function pinnedClock(iso: string): Clock {
  return {
    now: () => new Date(iso),
  };
}

const emptyTopics: ActiveTopicsRepository = {
  listActive() {
    return Promise.resolve([]);
  },
};

const emptyDiscoverable: DiscoverableUserRepository = {
  listDiscoverableUserIds() {
    return Promise.resolve([]);
  },
};

function buildAssemblerDeps(
  overrides: Partial<SearchSnapshotAssemblerDeps> = {},
): SearchSnapshotAssemblerDeps {
  return {
    clock: pinnedClock("2026-07-12T12:00:00.000Z"),
    discoverableUserRepository: emptyDiscoverable,
    topicRepository: emptyTopics,
    profileRepository: {
      findByUserId() {
        return Promise.resolve(null);
      },
    },
    listSelectedTopicIds() {
      return Promise.resolve([]);
    },
    loadUserAvailabilityData() {
      return Promise.resolve({
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [] as WeeklyAvailabilityWindow[],
        overrides: [] as AvailabilityOverride[],
        busyIntervals: [] as ImportedBusyIntervalRecord[],
      });
    },
    getDiscoverabilityConsent() {
      return Promise.resolve(null);
    },
    hasTopicProposal() {
      return Promise.resolve(false);
    },
    computeEffectiveAvailability() {
      return [] as Interval[];
    },
    deriveCalendarFreshness() {
      return "none";
    },
    ...overrides,
  };
}

const baseInput: SearchSnapshotAssemblerInput = {
  organizerId: "organizer-1",
  selectedTopicIds: ["topic-1"],
  durationMinutes: 60,
  dateRangeStart: new Date("2026-07-13T16:00:00.000Z"),
  dateRangeEnd: new Date("2026-07-13T17:00:00.000Z"),
  organizerTimezone: "UTC",
  minimumMatchingUsers: 2,
};

describe("SearchSnapshotAssembler.assemble (tracer)", () => {
  it("returns a complete SearchSnapshot with documented shape when no candidates exist", async () => {
    const assembler = new SearchSnapshotAssembler(buildAssemblerDeps());

    const snapshot = await assembler.assemble(baseInput);

    expect(snapshot).toEqual({
      generatedAt: "2026-07-12T12:00:00.000Z",
      organizerTimezone: "UTC",
      dateRangeStart: "2026-07-13T16:00:00.000Z",
      dateRangeEnd: "2026-07-13T17:00:00.000Z",
      durationMinutes: 60,
      slots: [],
    });
  });

  it("captures generatedAt from the injected Clock exactly once per assemble call", async () => {
    let calls = 0;
    const clock: Clock = {
      now: () => {
        calls += 1;
        return new Date("2026-07-12T12:00:00.000Z");
      },
    };
    const assembler = new SearchSnapshotAssembler(
      buildAssemblerDeps({ clock }),
    );

    await assembler.assemble(baseInput);

    expect(calls).toBe(1);
  });
});

describe("SearchSnapshotAssembler.assemble (eligible candidate)", () => {
  const candidateId = "candidate-1";
  const candidateProfile: UserProfile = {
    id: candidateId,
    email: "candidate@example.com",
    displayName: "Candidate One",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  };
  const slotStart = new Date("2026-07-13T16:00:00.000Z");
  const slotEnd = new Date("2026-07-13T17:00:00.000Z");

  function eligibleDeps(
    overrides: Partial<SearchSnapshotAssemblerDeps> = {},
  ): SearchSnapshotAssemblerDeps {
    return buildAssemblerDeps({
      discoverableUserRepository: {
        listDiscoverableUserIds() {
          return Promise.resolve([candidateId]);
        },
      },
      topicRepository: {
        listActive() {
          return Promise.resolve([
            { id: "topic-1", name: "Product strategy", status: "active" },
          ]);
        },
      },
      profileRepository: {
        findByUserId(userId) {
          if (userId === candidateId) return Promise.resolve(candidateProfile);
          return Promise.resolve(null);
        },
      },
      listSelectedTopicIds(userId) {
        if (userId === candidateId) return Promise.resolve(["topic-1"]);
        return Promise.resolve([]);
      },
      loadUserAvailabilityData(userId) {
        if (userId === candidateId) {
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [
              {
                id: "window-1",
                userId: candidateId,
                dayOfWeek: 1,
                startTime: "00:00",
                endTime: "23:59",
                profileTimezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            overrides: [],
            busyIntervals: [],
          });
        }
        return Promise.resolve({
          profileTimezone: "UTC",
          bufferMinutes: 0,
          windows: [],
          overrides: [],
          busyIntervals: [],
        });
      },
      getDiscoverabilityConsent(userId) {
        if (userId === candidateId) {
          return Promise.resolve({
            userId,
            grantedAt: new Date("2026-07-12T12:00:00.000Z"),
          });
        }
        return Promise.resolve(null);
      },
      ...overrides,
    });
  }

  it("includes an eligible candidate whose effective availability fully covers the slot", async () => {
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T15:00:00.000Z"),
            endUtc: new Date("2026-07-13T18:00:00.000Z"),
          },
        ],
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([
      {
        startUtc: slotStart.toISOString(),
        matchCount: 1,
        matches: [
          {
            userId: candidateId,
            displayName: "Candidate One",
            avatarUrl: null,
            shortBio: null,
            topics: [{ id: "topic-1", name: "Product strategy" }],
            topicProfile: [{ id: "topic-1", name: "Product strategy" }],
            availabilityIndicator: "available",
            calendarFreshness: "none",
          },
        ],
      },
    ]);
  });

  it("excludes a candidate whose Discoverability consent is missing", async () => {
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T15:00:00.000Z"),
            endUtc: new Date("2026-07-13T18:00:00.000Z"),
          },
        ],
        getDiscoverabilityConsent() {
          return Promise.resolve(null);
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes a candidate whose profile has no display name", async () => {
    const profileWithoutDisplayName: UserProfile = {
      ...candidateProfile,
      displayName: null,
    };
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T15:00:00.000Z"),
            endUtc: new Date("2026-07-13T18:00:00.000Z"),
          },
        ],
        profileRepository: {
          findByUserId(userId) {
            if (userId === candidateId) {
              return Promise.resolve(profileWithoutDisplayName);
            }
            return Promise.resolve(null);
          },
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes a candidate whose profile is suspended", async () => {
    const suspendedProfile: UserProfile = {
      ...candidateProfile,
      status: "suspended",
    };
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T15:00:00.000Z"),
            endUtc: new Date("2026-07-13T18:00:00.000Z"),
          },
        ],
        profileRepository: {
          findByUserId(userId) {
            if (userId === candidateId) {
              return Promise.resolve(suspendedProfile);
            }
            return Promise.resolve(null);
          },
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes a candidate with no selected topics and no topic proposal", async () => {
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T15:00:00.000Z"),
            endUtc: new Date("2026-07-13T18:00:00.000Z"),
          },
        ],
        listSelectedTopicIds() {
          return Promise.resolve([]);
        },
        hasTopicProposal() {
          return Promise.resolve(false);
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes a candidate with no availability source", async () => {
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability() {
          return [];
        },
        loadUserAvailabilityData() {
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [],
            overrides: [],
            busyIntervals: [],
          });
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes the Organizer from candidates even when Organizer passes eligibility", async () => {
    const organizerProfile: UserProfile = {
      ...candidateProfile,
      id: "organizer-1",
    };
    const assembler = new SearchSnapshotAssembler(
      buildAssemblerDeps({
        discoverableUserRepository: {
          listDiscoverableUserIds() {
            return Promise.resolve(["organizer-1"]);
          },
        },
        topicRepository: {
          listActive() {
            return Promise.resolve([
              { id: "topic-1", name: "Product strategy", status: "active" },
            ]);
          },
        },
        profileRepository: {
          findByUserId() {
            return Promise.resolve(organizerProfile);
          },
        },
        listSelectedTopicIds() {
          return Promise.resolve(["topic-1"]);
        },
        getDiscoverabilityConsent() {
          return Promise.resolve({
            userId: "organizer-1",
            grantedAt: new Date("2026-07-12T12:00:00.000Z"),
          });
        },
        loadUserAvailabilityData() {
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [
              {
                id: "window-1",
                userId: "organizer-1",
                dayOfWeek: 1,
                startTime: "00:00",
                endTime: "23:59",
                profileTimezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            overrides: [],
            busyIntervals: [],
          });
        },
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T15:00:00.000Z"),
            endUtc: new Date("2026-07-13T18:00:00.000Z"),
          },
        ],
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes a candidate whose availability only partially covers the slot", async () => {
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [
          {
            startUtc: new Date("2026-07-13T16:00:00.000Z"),
            endUtc: new Date("2026-07-13T16:30:00.000Z"),
          },
        ],
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });

  it("excludes a candidate with no effective availability at all", async () => {
    const assembler = new SearchSnapshotAssembler(
      eligibleDeps({
        computeEffectiveAvailability: () => [],
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toEqual([]);
  });
});

describe("SearchSnapshotAssembler.assemble (per-candidate prep runs once)", () => {
  const candidateA = "candidate-a";
  const candidateB = "candidate-b";
  const profileA: UserProfile = {
    id: candidateA,
    email: "a@example.com",
    displayName: "Alpha",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  };
  const profileB: UserProfile = {
    ...profileA,
    id: candidateB,
    email: "b@example.com",
    displayName: "Bravo",
  };

  function multiDeps(
    overrides: Partial<SearchSnapshotAssemblerDeps> = {},
  ): SearchSnapshotAssemblerDeps {
    return buildAssemblerDeps({
      discoverableUserRepository: {
        listDiscoverableUserIds() {
          return Promise.resolve([candidateA, candidateB]);
        },
      },
      topicRepository: {
        listActive() {
          return Promise.resolve([
            { id: "topic-1", name: "Product strategy", status: "active" },
          ]);
        },
      },
      profileRepository: {
        findByUserId(userId) {
          if (userId === candidateA) return Promise.resolve(profileA);
          if (userId === candidateB) return Promise.resolve(profileB);
          return Promise.resolve(null);
        },
      },
      listSelectedTopicIds(userId) {
        if (userId === candidateA || userId === candidateB) {
          return Promise.resolve(["topic-1"]);
        }
        return Promise.resolve([]);
      },
      loadUserAvailabilityData(userId) {
        return Promise.resolve({
          profileTimezone: "UTC",
          bufferMinutes: 0,
          windows: [
            {
              id: `window-${userId}`,
              userId,
              dayOfWeek: 1,
              startTime: "00:00",
              endTime: "23:59",
              profileTimezone: "UTC",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          overrides: [],
          busyIntervals: [],
        });
      },
      getDiscoverabilityConsent(userId) {
        return Promise.resolve({
          userId,
          grantedAt: new Date("2026-07-12T12:00:00.000Z"),
        });
      },
      computeEffectiveAvailability: () => [
        {
          startUtc: new Date("2026-07-13T00:00:00.000Z"),
          endUtc: new Date("2026-07-14T00:00:00.000Z"),
        },
      ],
      ...overrides,
    });
  }

  it("runs each candidate-prep loader exactly once even when there are multiple slots", async () => {
    const calls: Record<string, number> = {
      profileRepository: 0,
      listSelectedTopicIds: 0,
      loadUserAvailabilityData: 0,
      getDiscoverabilityConsent: 0,
      hasTopicProposal: 0,
      computeEffectiveAvailability: 0,
    };

    const assembler = new SearchSnapshotAssembler(
      multiDeps({
        profileRepository: {
          findByUserId(userId) {
            calls.profileRepository += 1;
            if (userId === candidateA) return Promise.resolve(profileA);
            if (userId === candidateB) return Promise.resolve(profileB);
            return Promise.resolve(null);
          },
        },
        listSelectedTopicIds(userId) {
          calls.listSelectedTopicIds += 1;
          if (userId === candidateA || userId === candidateB) {
            return Promise.resolve(["topic-1"]);
          }
          return Promise.resolve([]);
        },
        loadUserAvailabilityData(userId) {
          calls.loadUserAvailabilityData += 1;
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [
              {
                id: `window-${userId}`,
                userId,
                dayOfWeek: 1,
                startTime: "00:00",
                endTime: "23:59",
                profileTimezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            overrides: [],
            busyIntervals: [],
          });
        },
        getDiscoverabilityConsent(userId) {
          calls.getDiscoverabilityConsent += 1;
          return Promise.resolve({
            userId,
            grantedAt: new Date("2026-07-12T12:00:00.000Z"),
          });
        },
        hasTopicProposal() {
          calls.hasTopicProposal += 1;
          return Promise.resolve(false);
        },
        computeEffectiveAvailability: () => {
          calls.computeEffectiveAvailability += 1;
          return [
            {
              startUtc: new Date("2026-07-13T00:00:00.000Z"),
              endUtc: new Date("2026-07-14T00:00:00.000Z"),
            },
          ];
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: new Date("2026-07-13T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T04:00:00.000Z"),
      organizerTimezone: "UTC",
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots.length).toBeGreaterThanOrEqual(2);
    expect(calls.profileRepository).toBe(2);
    expect(calls.listSelectedTopicIds).toBe(2);
    expect(calls.loadUserAvailabilityData).toBe(2);
    expect(calls.getDiscoverabilityConsent).toBe(2);
    expect(calls.hasTopicProposal).toBe(2);
    expect(calls.computeEffectiveAvailability).toBe(2);
  });

  it("includes multiple candidates in a slot when each passes full-duration availability", async () => {
    const assembler = new SearchSnapshotAssembler(multiDeps());

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: new Date("2026-07-13T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T01:00:00.000Z"),
      organizerTimezone: "UTC",
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots).toHaveLength(1);
    expect(snapshot.slots[0].matchCount).toBe(2);
    expect(snapshot.slots[0].matches.map((m) => m.userId).sort()).toEqual(
      [candidateA, candidateB].sort(),
    );
  });

  it("honors minimumMatchingUsers so slots below the minimum are omitted", async () => {
    const assembler = new SearchSnapshotAssembler(multiDeps());

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: new Date("2026-07-13T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T01:00:00.000Z"),
      organizerTimezone: "UTC",
      minimumMatchingUsers: 5,
    });

    expect(snapshot.slots).toEqual([]);
  });
});

describe("SearchSnapshotAssembler.assemble (calendar freshness)", () => {
  const candidateId = "candidate-1";
  const profile: UserProfile = {
    id: candidateId,
    email: "candidate@example.com",
    displayName: "Candidate One",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  };
  const slotStart = new Date("2026-07-13T16:00:00.000Z");
  const slotEnd = new Date("2026-07-13T17:00:00.000Z");

  function depsWithBusyIntervals(
    busyIntervals: ImportedBusyIntervalRecord[],
    freshnessImpl: (
      lastSyncAt: Date | null,
      now: Date,
    ) => "fresh" | "stale" | "none",
  ): SearchSnapshotAssemblerDeps {
    return buildAssemblerDeps({
      discoverableUserRepository: {
        listDiscoverableUserIds() {
          return Promise.resolve([candidateId]);
        },
      },
      topicRepository: {
        listActive() {
          return Promise.resolve([
            { id: "topic-1", name: "Product strategy", status: "active" },
          ]);
        },
      },
      profileRepository: {
        findByUserId(userId) {
          if (userId === candidateId) return Promise.resolve(profile);
          return Promise.resolve(null);
        },
      },
      listSelectedTopicIds(userId) {
        if (userId === candidateId) return Promise.resolve(["topic-1"]);
        return Promise.resolve([]);
      },
      loadUserAvailabilityData() {
        return Promise.resolve({
          profileTimezone: "UTC",
          bufferMinutes: 0,
          windows: [
            {
              id: "window-1",
              userId: candidateId,
              dayOfWeek: 1,
              startTime: "00:00",
              endTime: "23:59",
              profileTimezone: "UTC",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          overrides: [],
          busyIntervals,
        });
      },
      getDiscoverabilityConsent(userId) {
        return Promise.resolve({
          userId,
          grantedAt: new Date("2026-07-12T12:00:00.000Z"),
        });
      },
      computeEffectiveAvailability: () => [
        {
          startUtc: slotStart,
          endUtc: slotEnd,
        },
      ],
      deriveCalendarFreshness: freshnessImpl,
    });
  }

  it("captures clock.now() once and reuses it for generatedAt and freshness", async () => {
    let calls = 0;
    const fixedNow = new Date("2026-07-13T15:30:00.000Z");
    const clock: Clock = {
      now: () => {
        calls += 1;
        return fixedNow;
      },
    };

    const capturedNows: Date[] = [];
    const assembler = new SearchSnapshotAssembler(
      buildAssemblerDeps({
        clock,
        discoverableUserRepository: {
          listDiscoverableUserIds() {
            return Promise.resolve([candidateId]);
          },
        },
        topicRepository: {
          listActive() {
            return Promise.resolve([
              { id: "topic-1", name: "Product strategy", status: "active" },
            ]);
          },
        },
        profileRepository: {
          findByUserId(userId) {
            if (userId === candidateId) return Promise.resolve(profile);
            return Promise.resolve(null);
          },
        },
        listSelectedTopicIds(userId) {
          if (userId === candidateId) return Promise.resolve(["topic-1"]);
          return Promise.resolve([]);
        },
        loadUserAvailabilityData() {
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [
              {
                id: "window-1",
                userId: candidateId,
                dayOfWeek: 1,
                startTime: "00:00",
                endTime: "23:59",
                profileTimezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            overrides: [],
            busyIntervals: [
              {
                id: "busy-1",
                userId: candidateId,
                connectionId: "conn-1",
                providerCalendarId: "cal-1",
                providerEventReference: "evt-1",
                status: "busy",
                startAt: new Date("2026-07-13T15:00:00.000Z"),
                endAt: new Date("2026-07-13T15:30:00.000Z"),
                importedAt: new Date("2026-07-13T15:00:00.000Z"),
              },
            ],
          });
        },
        getDiscoverabilityConsent(userId) {
          return Promise.resolve({
            userId,
            grantedAt: new Date("2026-07-12T12:00:00.000Z"),
          });
        },
        computeEffectiveAvailability: () => [
          {
            startUtc: slotStart,
            endUtc: slotEnd,
          },
        ],
        deriveCalendarFreshness: (_lastSyncAt, now) => {
          capturedNows.push(now);
          return "fresh";
        },
      }),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(calls).toBe(1);
    expect(snapshot.generatedAt).toBe("2026-07-13T15:30:00.000Z");
    expect(capturedNows.length).toBe(1);
    expect(capturedNows[0].getTime()).toBe(fixedNow.getTime());
  });

  it("records 'none' when no imported busy intervals exist", async () => {
    const assembler = new SearchSnapshotAssembler(
      depsWithBusyIntervals([], () => "none"),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots[0].matches[0].calendarFreshness).toBe("none");
  });

  it("records 'fresh' when deriveCalendarFreshness returns 'fresh'", async () => {
    const busyInterval: ImportedBusyIntervalRecord = {
      id: "busy-1",
      userId: candidateId,
      connectionId: "conn-1",
      providerCalendarId: "cal-1",
      providerEventReference: "evt-1",
      status: "busy",
      startAt: new Date("2026-07-13T15:00:00.000Z"),
      endAt: new Date("2026-07-13T16:00:00.000Z"),
      importedAt: new Date("2026-07-13T16:00:00.000Z"),
    };
    const assembler = new SearchSnapshotAssembler(
      depsWithBusyIntervals([busyInterval], () => "fresh"),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots[0].matches[0].calendarFreshness).toBe("fresh");
  });

  it("records 'stale' when deriveCalendarFreshness returns 'stale'", async () => {
    const busyInterval: ImportedBusyIntervalRecord = {
      id: "busy-1",
      userId: candidateId,
      connectionId: "conn-1",
      providerCalendarId: "cal-1",
      providerEventReference: "evt-1",
      status: "busy",
      startAt: new Date("2026-07-13T15:00:00.000Z"),
      endAt: new Date("2026-07-13T16:00:00.000Z"),
      importedAt: new Date("2026-07-12T12:00:00.000Z"),
    };
    const assembler = new SearchSnapshotAssembler(
      depsWithBusyIntervals([busyInterval], () => "stale"),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(snapshot.slots[0].matches[0].calendarFreshness).toBe("stale");
  });
});

describe("SearchSnapshotAssembler.assemble (topic details)", () => {
  const candidateId = "candidate-1";
  const profile: UserProfile = {
    id: candidateId,
    email: "candidate@example.com",
    displayName: "Candidate One",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  };
  const slotStart = new Date("2026-07-13T16:00:00.000Z");
  const slotEnd = new Date("2026-07-13T17:00:00.000Z");

  function depsWithTopics(
    selectedTopicIds: string[],
    selectedActiveTopicIds: string[],
  ): SearchSnapshotAssemblerDeps {
    return buildAssemblerDeps({
      discoverableUserRepository: {
        listDiscoverableUserIds() {
          return Promise.resolve([candidateId]);
        },
      },
      topicRepository: {
        listActive() {
          return Promise.resolve(
            selectedActiveTopicIds.map((id) => ({
              id,
              name: `Topic ${id}`,
              status: "active" as const,
            })),
          );
        },
      },
      profileRepository: {
        findByUserId(userId) {
          if (userId === candidateId) return Promise.resolve(profile);
          return Promise.resolve(null);
        },
      },
      listSelectedTopicIds(userId) {
        if (userId === candidateId) return Promise.resolve(selectedTopicIds);
        return Promise.resolve([]);
      },
      loadUserAvailabilityData() {
        return Promise.resolve({
          profileTimezone: "UTC",
          bufferMinutes: 0,
          windows: [
            {
              id: "window-1",
              userId: candidateId,
              dayOfWeek: 1,
              startTime: "00:00",
              endTime: "23:59",
              profileTimezone: "UTC",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          overrides: [],
          busyIntervals: [],
        });
      },
      getDiscoverabilityConsent(userId) {
        return Promise.resolve({
          userId,
          grantedAt: new Date("2026-07-12T12:00:00.000Z"),
        });
      },
      computeEffectiveAvailability: () => [
        {
          startUtc: slotStart,
          endUtc: slotEnd,
        },
      ],
    });
  }

  it("projects matched topics to only those selected for the Search", async () => {
    const assembler = new SearchSnapshotAssembler(
      depsWithTopics(
        ["topic-1", "topic-2", "topic-3"],
        ["topic-1", "topic-2", "topic-3"],
      ),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
      selectedTopicIds: ["topic-1", "topic-3"],
    });

    expect(snapshot.slots[0].matches[0].topics).toEqual([
      { id: "topic-1", name: "Topic topic-1" },
      { id: "topic-3", name: "Topic topic-3" },
    ]);
  });

  it("projects topicProfile to all active topics the user has selected", async () => {
    const assembler = new SearchSnapshotAssembler(
      depsWithTopics(["topic-1", "topic-2"], ["topic-1", "topic-2"]),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
      selectedTopicIds: ["topic-1"],
    });

    expect(snapshot.slots[0].matches[0].topicProfile).toEqual([
      { id: "topic-1", name: "Topic topic-1" },
      { id: "topic-2", name: "Topic topic-2" },
    ]);
  });

  it("drops topic IDs from projection when the candidate selected them but they are no longer in the active catalogue", async () => {
    const assembler = new SearchSnapshotAssembler(
      depsWithTopics(["topic-1", "topic-retired"], ["topic-1"]),
    );

    const snapshot = await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
      selectedTopicIds: ["topic-1"],
    });

    expect(snapshot.slots[0].matches[0].topics).toEqual([
      { id: "topic-1", name: "Topic topic-1" },
    ]);
    expect(snapshot.slots[0].matches[0].topicProfile).toEqual([
      { id: "topic-1", name: "Topic topic-1" },
    ]);
  });
});

describe("SearchSnapshotAssembler.assemble (availability range seam)", () => {
  const candidateId = "candidate-1";
  const profile: UserProfile = {
    id: candidateId,
    email: "candidate@example.com",
    displayName: "Candidate One",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  };
  const slotStart = new Date("2026-07-13T16:00:00.000Z");
  const slotEnd = new Date("2026-07-13T17:00:00.000Z");

  it("passes the Search's dateRangeStart and dateRangeEnd to the availability loader", async () => {
    let receivedRange: { rangeStart: Date; rangeEnd: Date } | null = null;
    const assembler = new SearchSnapshotAssembler(
      buildAssemblerDeps({
        discoverableUserRepository: {
          listDiscoverableUserIds() {
            return Promise.resolve([candidateId]);
          },
        },
        topicRepository: {
          listActive() {
            return Promise.resolve([
              { id: "topic-1", name: "Product strategy", status: "active" },
            ]);
          },
        },
        profileRepository: {
          findByUserId(userId) {
            if (userId === candidateId) return Promise.resolve(profile);
            return Promise.resolve(null);
          },
        },
        listSelectedTopicIds(userId) {
          if (userId === candidateId) return Promise.resolve(["topic-1"]);
          return Promise.resolve([]);
        },
        loadUserAvailabilityData: (_userId, range) => {
          receivedRange = range;
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [
              {
                id: "window-1",
                userId: candidateId,
                dayOfWeek: 1,
                startTime: "00:00",
                endTime: "23:59",
                profileTimezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            overrides: [],
            busyIntervals: [],
          });
        },
        getDiscoverabilityConsent(userId) {
          return Promise.resolve({
            userId,
            grantedAt: new Date("2026-07-12T12:00:00.000Z"),
          });
        },
        computeEffectiveAvailability: () => [
          { startUtc: slotStart, endUtc: slotEnd },
        ],
      }),
    );

    await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(receivedRange).not.toBeNull();
    expect(receivedRange!.rangeStart.toISOString()).toBe(
      slotStart.toISOString(),
    );
    expect(receivedRange!.rangeEnd.toISOString()).toBe(slotEnd.toISOString());
  });

  it("passes the same explicit range to computeEffectiveAvailability", async () => {
    let receivedRange: { rangeStart: Date; rangeEnd: Date } | null = null;
    const assembler = new SearchSnapshotAssembler(
      buildAssemblerDeps({
        discoverableUserRepository: {
          listDiscoverableUserIds() {
            return Promise.resolve([candidateId]);
          },
        },
        topicRepository: {
          listActive() {
            return Promise.resolve([
              { id: "topic-1", name: "Product strategy", status: "active" },
            ]);
          },
        },
        profileRepository: {
          findByUserId(userId) {
            if (userId === candidateId) return Promise.resolve(profile);
            return Promise.resolve(null);
          },
        },
        listSelectedTopicIds(userId) {
          if (userId === candidateId) return Promise.resolve(["topic-1"]);
          return Promise.resolve([]);
        },
        loadUserAvailabilityData() {
          return Promise.resolve({
            profileTimezone: "UTC",
            bufferMinutes: 0,
            windows: [
              {
                id: "window-1",
                userId: candidateId,
                dayOfWeek: 1,
                startTime: "00:00",
                endTime: "23:59",
                profileTimezone: "UTC",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
            overrides: [],
            busyIntervals: [],
          });
        },
        getDiscoverabilityConsent(userId) {
          return Promise.resolve({
            userId,
            grantedAt: new Date("2026-07-12T12:00:00.000Z"),
          });
        },
        computeEffectiveAvailability: (inputs) => {
          receivedRange = {
            rangeStart: inputs.rangeStart,
            rangeEnd: inputs.rangeEnd,
          };
          return [{ startUtc: slotStart, endUtc: slotEnd }];
        },
      }),
    );

    await assembler.assemble({
      ...baseInput,
      dateRangeStart: slotStart,
      dateRangeEnd: slotEnd,
      minimumMatchingUsers: 1,
    });

    expect(receivedRange).not.toBeNull();
    expect(receivedRange!.rangeStart.toISOString()).toBe(
      slotStart.toISOString(),
    );
    expect(receivedRange!.rangeEnd.toISOString()).toBe(slotEnd.toISOString());
  });
});

describe("SearchSnapshotAssembler public surface", () => {
  it("exports the assembler class", () => {
    expect(typeof SearchSnapshotAssembler).toBe("function");
  });
});
