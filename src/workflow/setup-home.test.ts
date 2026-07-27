import { describe, expect, it } from "vitest";

import {
  createSetupHomeWorkflow,
  type SetupHomeWorkflowDeps,
} from "./setup-home";
import type { UserProfile } from "../profile/repository";
import type {
  DiscoverabilityConsentRepository,
  DiscoverabilityConsentState,
} from "../profile/discoverability-consent";
import type { TopicCatalogueRepository } from "../topics/repository";
import type {
  TopicProposalUserRepository,
  UserTopicProposal,
} from "../topics/proposals.repository";
import type { WeeklyAvailabilityWindowRepository } from "../profile/availability-windows";
import type { AvailabilityOverrideRepository } from "../profile/availability-overrides";
import type { CalendarConnectionRepository } from "../calendar/connection";

function buildWorkflow(overrides: {
  profile?: UserProfile | null;
  discoverability?: DiscoverabilityConsentState | null;
  selectedTopicIds?: string[];
  proposals?: UserTopicProposal[];
  windows?: number;
  overrides?: number;
  connections?: number;
} = {}) {
  const profileRepository = {
    async findByUserId() {
      await Promise.resolve();
      return overrides.profile === undefined
        ? ({
            id: "user-1",
            email: "user@example.com",
            displayName: "Ada Lovelace",
            avatarUrl: null,
            shortBio: null,
            role: "user",
            status: "active",
            profileTimezone: "UTC",
            bufferMinutes: 0,
          } satisfies UserProfile)
        : overrides.profile;
    },
  };

  const discoverabilityConsentRepository: DiscoverabilityConsentRepository = {
    async findByUserId() {
      await Promise.resolve();
      return overrides.discoverability === undefined
        ? null
        : overrides.discoverability;
    },
    async grant() {
      await Promise.resolve();
      throw new Error("not used");
    },
    async revoke() {
      await Promise.resolve();
      throw new Error("not used");
    },
  };

  const topicRepository: TopicCatalogueRepository = {
    async listCatalogue() {
      await Promise.resolve();
      return [];
    },
    async listSelectedTopicIds() {
      await Promise.resolve();
      return overrides.selectedTopicIds ?? [];
    },
    async listAssociations() {
      await Promise.resolve();
      return [];
    },
    async saveAssociations() {
      await Promise.resolve();
    },
  };

  const topicProposalRepository: TopicProposalUserRepository = {
    async listUserProposals() {
      await Promise.resolve();
      return overrides.proposals ?? ([] as UserTopicProposal[]);
    },
    async listActiveTopics() {
      await Promise.resolve();
      return [];
    },
    async listPendingForSimilarity() {
      await Promise.resolve();
      return [];
    },
    async findPendingByUserAndName() {
      await Promise.resolve();
      return null;
    },
    async insertProposal() {
      await Promise.resolve();
      throw new Error("not used");
    },
  };

  const weeklyAvailabilityWindowRepository: WeeklyAvailabilityWindowRepository =
    {
      async add() {
        await Promise.resolve();
        throw new Error("not used");
      },
      async listByUserId() {
        await Promise.resolve();
        const count = overrides.windows ?? 0;
        return Array.from({ length: count }, (_, i) => ({
          id: `window-${i}`,
          userId: "user-1",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
          profileTimezone: "UTC",
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      },
      async findById() {
        await Promise.resolve();
        return null;
      },
      async updateById() {
        await Promise.resolve();
        return null;
      },
      async removeById() {
        await Promise.resolve();
        return false;
      },
    };

  const availabilityOverrideRepository: AvailabilityOverrideRepository = {
    async add() {
      await Promise.resolve();
      throw new Error("not used");
    },
    async listByUserId() {
      await Promise.resolve();
      const count = overrides.overrides ?? 0;
      return Array.from({ length: count }, (_, i) => ({
        id: `override-${i}`,
        userId: "user-1",
        date: "2026-07-15",
        startTime: "12:00",
        endTime: "13:00",
        type: "add" as const,
        profileTimezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    },
    async findById() {
      await Promise.resolve();
      return null;
    },
    async removeById() {
      await Promise.resolve();
      return false;
    },
  };

  const calendarConnectionRepository: CalendarConnectionRepository = {
    async listByUserId() {
      await Promise.resolve();
      const count = overrides.connections ?? 0;
      return Array.from({ length: count }, (_, i) => ({
        id: `conn-${i}`,
        userId: "user-1",
        provider: "google" as const,
        providerAccountKey: `key-${i}`,
        accountIdentifier: `user-${i}@example.com`,
        scopes: "scope",
        status: "connected" as const,
        refreshTokenEncrypted: null,
        accessTokenEncrypted: null,
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSyncAt: null,
        contributingCalendarIds: [],
      }));
    },
    async findById() {
      await Promise.resolve();
      return null;
    },
    async createPending() {
      await Promise.resolve();
      throw new Error("not used");
    },
    async updateById() {
      await Promise.resolve();
      return null;
    },
  };

  const deps: SetupHomeWorkflowDeps = {
    profileRepository,
    discoverabilityConsentRepository,
    topicRepository,
    topicProposalRepository,
    weeklyAvailabilityWindowRepository,
    availabilityOverrideRepository,
    calendarConnectionRepository,
  };

  return createSetupHomeWorkflow(deps);
}

describe("setupHomeWorkflow.loadSummary", () => {
  it("returns five items with the canonical keys and labels and aggregate complete=false", async () => {
    const workflow = buildWorkflow({
      windows: 1,
    });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    const summary = result.value;
    expect(summary.complete).toBe(false);
    expect(summary.items.map((i) => i.key)).toEqual([
      "profile",
      "discoverability",
      "topics",
      "availability",
      "calendarConnection",
    ]);
    expect(summary.items.map((i) => i.label)).toEqual([
      "Profile",
      "Discoverability",
      "Topics",
      "Availability",
      "Calendar Connection",
    ]);
    expect(summary.items.map((i) => i.required)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(summary.items[0].complete).toBe(true);
    expect(summary.items[1].complete).toBe(false);
    expect(summary.items[2].complete).toBe(false);
    expect(summary.items[3].complete).toBe(true);
    expect(summary.items[4].complete).toBe(false);
  });

  it("marks the profile item incomplete when displayName is missing", async () => {
    const workflow = buildWorkflow({
      profile: {
        id: "user-1",
        email: "user@example.com",
        displayName: null,
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
    });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    expect(result.value.items[0]).toMatchObject({
      key: "profile",
      required: true,
      complete: false,
    });
  });

  it("marks the profile item incomplete when displayName is whitespace", async () => {
    const workflow = buildWorkflow({
      profile: {
        id: "user-1",
        email: "user@example.com",
        displayName: "   ",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
    });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    expect(result.value.items[0].complete).toBe(false);
  });

  it("marks the discoverability item complete when consent is granted", async () => {
    const workflow = buildWorkflow({
      discoverability: {
        state: "granted",
        grantedAt: new Date("2026-07-12T12:00:00.000Z"),
      },
    });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    expect(result.value.items[1]).toMatchObject({
      key: "discoverability",
      required: true,
      complete: true,
    });
  });

  it("marks the topics item complete when a topic proposal is pending", async () => {
    const workflow = buildWorkflow({
      proposals: [
        {
          id: "proposal-1",
          candidateName: "Topic proposal one",
          status: "pending",
          createdAt: new Date("2026-07-12T12:00:00.000Z"),
        },
      ],
    });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    expect(result.value.items[2]).toMatchObject({
      key: "topics",
      required: true,
      complete: true,
    });
  });

  it("marks the availability item complete when at least one Calendar Connection exists", async () => {
    const workflow = buildWorkflow({ connections: 1 });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    expect(result.value.items[3]).toMatchObject({
      key: "availability",
      required: true,
      complete: true,
    });
  });

  it("marks the optional Calendar Connection item complete only when connections exist", async () => {
    const workflowNone = buildWorkflow({});
    const noneResult = await workflowNone.loadSummary({ userId: "user-1" });
    expect(noneResult.ok).toBe(true);
    if (!noneResult.ok) throw new Error("expected summary ok");
    expect(noneResult.value.items[4].complete).toBe(false);

    const workflowOne = buildWorkflow({ connections: 1 });
    const oneResult = await workflowOne.loadSummary({ userId: "user-1" });
    expect(oneResult.ok).toBe(true);
    if (!oneResult.ok) throw new Error("expected summary ok");
    expect(oneResult.value.items[4].complete).toBe(true);
  });

  it("returns aggregate complete=true when every required item is complete", async () => {
    const workflow = buildWorkflow({
      discoverability: {
        state: "granted",
        grantedAt: new Date("2026-07-12T12:00:00.000Z"),
      },
      selectedTopicIds: ["topic-1"],
      windows: 1,
    });

    const result = await workflow.loadSummary({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected summary ok");
    const summary = result.value;
    expect(summary.complete).toBe(true);
    expect(summary.items[0].complete).toBe(true);
    expect(summary.items[1].complete).toBe(true);
    expect(summary.items[2].complete).toBe(true);
    expect(summary.items[3].complete).toBe(true);
  });

  it("returns summary_unavailable when a repository throws", async () => {
    const throwingProfileRepo = {
      async findByUserId() {
        await Promise.resolve();
        throw new Error("database unreachable");
      },
    };
    const { createSetupHomeWorkflow } = await import("./setup-home");
    const throwingWorkflow = createSetupHomeWorkflow({
      profileRepository: throwingProfileRepo,
      discoverabilityConsentRepository: {
        async findByUserId() {
          await Promise.resolve();
          return null;
        },
        async grant() {
          await Promise.resolve();
          throw new Error("not used");
        },
        async revoke() {
          await Promise.resolve();
          throw new Error("not used");
        },
      },
      topicRepository: {
        async listSelectedTopicIds() {
          await Promise.resolve();
          return [];
        },
      },
      topicProposalRepository: {
        async listUserProposals() {
          await Promise.resolve();
          return [];
        },
      },
      weeklyAvailabilityWindowRepository: {
        async listByUserId() {
          await Promise.resolve();
          return [];
        },
      },
      availabilityOverrideRepository: {
        async listByUserId() {
          await Promise.resolve();
          return [];
        },
      },
      calendarConnectionRepository: {
        async listByUserId() {
          await Promise.resolve();
          return [];
        },
      },
    });
    const result = await throwingWorkflow.loadSummary({ userId: "user-1" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.reason).toBe("summary_unavailable");
  });
});