import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GET,
  setSetupHomeWorkflowForTests,
} from "../app/api/v1/me/setup-status/route";
import { setSessionRepositoryForTests, type Session } from "../src/auth/session";
import { createSetupHomeWorkflow } from "../src/workflow/setup-home";
import type { UserProfile } from "../src/profile/repository";
import type {
  DiscoverabilityConsentRepository,
  DiscoverabilityConsentState,
} from "../src/profile/discoverability-consent";
import type { TopicCatalogueRepository } from "../src/topics/repository";
import type {
  TopicProposalUserRepository,
  UserTopicProposal,
} from "../src/topics/proposals.repository";
import type { WeeklyAvailabilityWindowRepository } from "../src/profile/availability-windows";
import type { AvailabilityOverrideRepository } from "../src/profile/availability-overrides";
import type { CalendarConnectionRepository } from "../src/calendar/connection";

const SESSION_ID = "session-1";

const mockSessionRepository = {
  async findById(sessionId: string): Promise<Session | null> {
    await Promise.resolve();
    if (sessionId !== SESSION_ID) {
      return null;
    }
    return {
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token",
    };
  },
};

async function issueCookie(): Promise<string> {
  const { sealSessionCookie } = await import("../src/auth/session");
  return sealSessionCookie({ sessionId: SESSION_ID });
}

function makeFakeProfile(): UserProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    displayName: "Ada Lovelace",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  };
}

function makeFakeDiscoverabilityRepository(
  state: DiscoverabilityConsentState | null,
): DiscoverabilityConsentRepository {
  return {
    async findByUserId() {
      await Promise.resolve();
      return state;
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
}

function makeFakeTopicRepository(
  selectedTopicIds: string[],
): Pick<TopicCatalogueRepository, "listSelectedTopicIds"> {
  return {
    async listSelectedTopicIds() {
      await Promise.resolve();
      return selectedTopicIds;
    },
  };
}

function makeFakeTopicProposalRepository(
  proposals: UserTopicProposal[],
): Pick<TopicProposalUserRepository, "listUserProposals"> {
  return {
    async listUserProposals() {
      await Promise.resolve();
      return proposals;
    },
  };
}

function makeFakeWeeklyAvailabilityWindowRepository(
  count: number,
): Pick<WeeklyAvailabilityWindowRepository, "listByUserId"> {
  return {
    async listByUserId() {
      await Promise.resolve();
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
  };
}

function makeFakeAvailabilityOverrideRepository(
  count: number,
): Pick<AvailabilityOverrideRepository, "listByUserId"> {
  return {
    async listByUserId() {
      await Promise.resolve();
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
  };
}

function makeFakeCalendarConnectionRepository(
  count: number,
): Pick<CalendarConnectionRepository, "listByUserId"> {
  return {
    async listByUserId() {
      await Promise.resolve();
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
  };
}

function buildWorkflowFromDeps(
  overrides: {
    profile?: UserProfile | null;
    discoverability?: DiscoverabilityConsentState | null;
    selectedTopicIds?: string[];
    proposals?: UserTopicProposal[];
    windows?: number;
    overrides?: number;
    connections?: number;
  } = {},
) {
  const workflow = createSetupHomeWorkflow({
    profileRepository: {
      async findByUserId() {
        await Promise.resolve();
        return overrides.profile === undefined
          ? makeFakeProfile()
          : overrides.profile;
      },
    },
    discoverabilityConsentRepository: makeFakeDiscoverabilityRepository(
      overrides.discoverability === undefined ? null : overrides.discoverability,
    ),
    topicRepository: makeFakeTopicRepository(overrides.selectedTopicIds ?? []),
    topicProposalRepository: makeFakeTopicProposalRepository(
      overrides.proposals ?? [],
    ),
    weeklyAvailabilityWindowRepository:
      makeFakeWeeklyAvailabilityWindowRepository(overrides.windows ?? 0),
    availabilityOverrideRepository: makeFakeAvailabilityOverrideRepository(
      overrides.overrides ?? 0,
    ),
    calendarConnectionRepository: makeFakeCalendarConnectionRepository(
      overrides.connections ?? 0,
    ),
  });
  return workflow;
}

describe("GET /api/v1/me/setup-status", () => {
  beforeEach(() => {
    setSessionRepositoryForTests(mockSessionRepository);
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    setSetupHomeWorkflowForTests(null);
  });

  it("returns 401 problem+json when no session cookie is provided", async () => {
    const response = await GET(new Request("http://localhost/api/v1/me/setup-status"));

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Sign in required");
    expect(body.status).toBe(401);
  });

  it("returns 200 with the canonical setup-status DTO for an authenticated User", async () => {
    setSetupHomeWorkflowForTests(
      buildWorkflowFromDeps({
        discoverability: {
          state: "granted",
          grantedAt: new Date("2026-07-12T12:00:00.000Z"),
        },
        selectedTopicIds: ["topic-1"],
        windows: 1,
        connections: 1,
      }),
    );

    const cookie = await issueCookie();
    const response = await GET(
      new Request("http://localhost/api/v1/me/setup-status", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.complete).toBe(true);
    expect(body.items).toEqual([
      { key: "profile", label: "Profile", required: true, complete: true },
      {
        key: "discoverability",
        label: "Discoverability",
        required: true,
        complete: true,
      },
      { key: "topics", label: "Topics", required: true, complete: true },
      {
        key: "availability",
        label: "Availability",
        required: true,
        complete: true,
      },
      {
        key: "calendarConnection",
        label: "Calendar Connection",
        required: false,
        complete: true,
      },
    ]);
  });

  it("returns 200 with complete=false when the user has only the required display name", async () => {
    setSetupHomeWorkflowForTests(buildWorkflowFromDeps({}));

    const cookie = await issueCookie();
    const response = await GET(
      new Request("http://localhost/api/v1/me/setup-status", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.complete).toBe(false);
  });
});