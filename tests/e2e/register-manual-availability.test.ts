import { afterEach, describe, expect, it } from "vitest";

import {
  clearPerUserLookupStateForTests,
  GET as getMe,
  PATCH as patchMe,
  setPerUserLookupStateForTests,
} from "../../app/api/v1/me/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
  type SessionRepository,
} from "../../src/auth/session";
import { computeEffectiveAvailability } from "../../src/matching/effective-availability";
import {
  clearAvailabilityOverrideRepository,
  expandOverrideToUtcRange,
  setAvailabilityOverrideRepositoryForTests,
  type AvailabilityOverride,
  type AvailabilityOverrideRepository,
  type CreateAvailabilityOverride,
} from "../../src/profile/availability-overrides";
import {
  clearDiscoverabilityConsentOverride,
  setDiscoverabilityConsentRepositoryForTests,
  type DiscoverabilityConsentRepository,
} from "../../src/profile/discoverability-consent";
import {
  clearWeeklyAvailabilityWindowOverride,
  setWeeklyAvailabilityWindowRepositoryForTests,
  type CreateWeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowRepository,
} from "../../src/profile/availability-windows";
import {
  setProfileRepositoryForTests,
  type ProfileRepository,
  type UserProfile,
  type UserProfileUpdate,
} from "../../src/profile/repository";

const USER_ID = "manual-availability-user";
const SESSION_ID = "manual-availability-session";
const CSRF_TOKEN = "manual-availability-csrf";
const PROFILE_TIMEZONE = "America/Sao_Paulo";
const FIXED_NOW = new Date("2026-07-20T12:00:00.000Z");
const TOPIC_ID = "topic-product-strategy";

class InMemoryAvailabilityWindows implements WeeklyAvailabilityWindowRepository {
  private readonly windows: WeeklyAvailabilityWindow[] = [];

  constructor(
    private readonly onAdd: (window: WeeklyAvailabilityWindow) => void,
  ) {}

  async add(
    userId: string,
    window: CreateWeeklyAvailabilityWindow,
    profileTimezone: string,
  ): Promise<WeeklyAvailabilityWindow> {
    await Promise.resolve();
    const record: WeeklyAvailabilityWindow = {
      id: `window-${this.windows.length + 1}`,
      userId,
      dayOfWeek: window.dayOfWeek,
      startTime: window.startTime,
      endTime: window.endTime,
      profileTimezone,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    this.windows.push(record);
    this.onAdd(record);
    return record;
  }

  async listByUserId(userId: string): Promise<WeeklyAvailabilityWindow[]> {
    await Promise.resolve();
    return this.windows.filter((window) => window.userId === userId);
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<WeeklyAvailabilityWindow | null> {
    await Promise.resolve();
    return (
      this.windows.find(
        (window) => window.id === id && window.userId === userId,
      ) ?? null
    );
  }

  async updateById(
    id: string,
    userId: string,
    updates: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
    },
  ): Promise<WeeklyAvailabilityWindow | null> {
    const window = await this.findById(id, userId);
    if (!window) {
      return null;
    }
    Object.assign(window, updates, { updatedAt: FIXED_NOW });
    return window;
  }

  async removeById(id: string, userId: string): Promise<boolean> {
    await Promise.resolve();
    const index = this.windows.findIndex(
      (window) => window.id === id && window.userId === userId,
    );
    if (index < 0) {
      return false;
    }
    this.windows.splice(index, 1);
    return true;
  }
}

class InMemoryAvailabilityOverrides implements AvailabilityOverrideRepository {
  private readonly overrides: AvailabilityOverride[] = [];

  constructor(
    private readonly onAdd: (override: AvailabilityOverride) => void,
  ) {}

  async add(
    userId: string,
    override: CreateAvailabilityOverride,
    profileTimezone: string,
  ): Promise<AvailabilityOverride> {
    await Promise.resolve();
    const record: AvailabilityOverride = {
      id: `override-${this.overrides.length + 1}`,
      userId,
      date: override.date,
      startTime: override.startTime,
      endTime: override.endTime,
      type: override.type,
      profileTimezone,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    this.overrides.push(record);
    this.onAdd(record);
    return record;
  }

  async listByUserId(userId: string): Promise<AvailabilityOverride[]> {
    await Promise.resolve();
    return this.overrides.filter((override) => override.userId === userId);
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<AvailabilityOverride | null> {
    await Promise.resolve();
    return (
      this.overrides.find(
        (override) => override.id === id && override.userId === userId,
      ) ?? null
    );
  }

  async removeById(id: string, userId: string): Promise<boolean> {
    await Promise.resolve();
    const index = this.overrides.findIndex(
      (override) => override.id === id && override.userId === userId,
    );
    if (index < 0) {
      return false;
    }
    this.overrides.splice(index, 1);
    return true;
  }
}

function makeProfile(): UserProfile {
  return {
    id: USER_ID,
    email: "manual-availability@example.com",
    displayName: "Manual Availability User",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: null,
    bufferMinutes: 0,
  };
}

function makeJsonRequest(
  url: string,
  method: string,
  cookie: string,
  body: unknown,
): Request {
  return new Request(url, {
    method,
    headers: {
      cookie,
      "x-csrf-token": CSRF_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string, cookie: string): Request {
  return new Request(url, { headers: { cookie } });
}

describe("E2E: register manual Availability end-to-end", () => {
  afterEach(() => {
    setSessionRepositoryForTests(null);
    setProfileRepositoryForTests(null);
    clearWeeklyAvailabilityWindowOverride();
    clearAvailabilityOverrideRepository();
    clearDiscoverabilityConsentOverride();
    clearPerUserLookupStateForTests();
  });

  it("registers profile timezone, buffer, weekly Availability, and add/block overrides with all provider dependencies mocked", async () => {
    const profile = makeProfile();
    const availabilityWindowsByUserId = new Map([
      [USER_ID, [] as WeeklyAvailabilityWindow[]],
    ]);
    const availabilityOverridesByUserId = new Map([
      [USER_ID, [] as AvailabilityOverride[]],
    ]);
    const windowsRepository = new InMemoryAvailabilityWindows((window) => {
      availabilityWindowsByUserId.get(USER_ID)?.push(window);
    });
    const overridesRepository = new InMemoryAvailabilityOverrides(
      (override) => {
        availabilityOverridesByUserId.get(USER_ID)?.push(override);
      },
    );
    const topicsByUserId = new Map([
      [USER_ID, [{ id: TOPIC_ID, name: "Product strategy" }]],
    ]);
    const topicProposalsByUserId = new Map([[USER_ID, []]]);
    const calendarConnectionsByUserId = new Map([[USER_ID, []]]);

    const profileRepository: ProfileRepository = {
      findByUserId: async (userId) => {
        await Promise.resolve();
        return userId === USER_ID ? profile : null;
      },
      updateByUserId: async (
        userId: string,
        update: UserProfileUpdate,
      ): Promise<UserProfile | null> => {
        await Promise.resolve();
        if (userId !== USER_ID) {
          return null;
        }
        Object.assign(profile, update);
        return profile;
      },
      deleteByUserId: async () => {
        await Promise.resolve();
        return false;
      },
    };

    const sessionRepository: SessionRepository = {
      findById: async (sessionId) => {
        await Promise.resolve();
        return sessionId === SESSION_ID
          ? { user: profile, csrfToken: CSRF_TOKEN }
          : null;
      },
    };

    const consentRepository: DiscoverabilityConsentRepository = {
      findByUserId: async (userId) => {
        await Promise.resolve();
        return userId === USER_ID ? { userId, grantedAt: FIXED_NOW } : null;
      },
      grant: async (userId) => {
        await Promise.resolve();
        return { userId, grantedAt: FIXED_NOW };
      },
      revoke: async () => {
        await Promise.resolve();
      },
    };

    setSessionRepositoryForTests(sessionRepository);
    setProfileRepositoryForTests(profileRepository);
    setWeeklyAvailabilityWindowRepositoryForTests(windowsRepository);
    setAvailabilityOverrideRepositoryForTests(overridesRepository);
    setDiscoverabilityConsentRepositoryForTests(consentRepository);
    setPerUserLookupStateForTests({
      topicsByUserId,
      topicProposalsByUserId,
      availabilityWindowsByUserId,
      availabilityOverridesByUserId,
      calendarConnectionsByUserId,
    });

    const cookie = await sealSessionCookie({ sessionId: SESSION_ID });

    const profileResponse = await patchMe(
      makeJsonRequest("http://localhost/me", "PATCH", cookie, {
        profileTimezone: PROFILE_TIMEZONE,
        bufferMinutes: 15,
      }),
    );
    expect(profileResponse.status).toBe(200);
    const profileJson = (await profileResponse.json()) as {
      user: UserProfile;
      setup: { complete: boolean };
      searchEligibility: { eligible: boolean };
    };
    expect(profileJson.user.profileTimezone).toBe(PROFILE_TIMEZONE);
    expect(profileJson.user.bufferMinutes).toBe(15);
    expect(profileJson.setup.complete).toBe(false);
    expect(profileJson.searchEligibility.eligible).toBe(false);

    await windowsRepository.add(
      USER_ID,
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      PROFILE_TIMEZONE,
    );

    await overridesRepository.add(
      USER_ID,
      { date: "2026-07-22", startTime: "18:00", endTime: "19:00", type: "add" },
      PROFILE_TIMEZONE,
    );

    await overridesRepository.add(
      USER_ID,
      { date: "2026-07-20", startTime: "10:00", endTime: "12:00", type: "block" },
      PROFILE_TIMEZONE,
    );

    const finalMeResponse = await getMe(
      makeGetRequest("http://localhost/me", cookie),
    );
    expect(finalMeResponse.status).toBe(200);
    const finalMe = (await finalMeResponse.json()) as {
      user: UserProfile;
      setup: {
        complete: boolean;
        items: Array<{ key: string; complete: boolean }>;
      };
      availabilityWindows: WeeklyAvailabilityWindow[];
      availabilityOverrides: AvailabilityOverride[];
      searchEligibility: { eligible: boolean };
    };
    expect(finalMe.user.profileTimezone).toBe(PROFILE_TIMEZONE);
    expect(finalMe.user.bufferMinutes).toBe(15);
    expect(finalMe.setup.complete).toBe(true);
    expect(finalMe.setup.items).toContainEqual({
      key: "hasAvailability",
      label: "At least one Availability source or manual Availability Window",
      required: true,
      complete: true,
    });
    expect(finalMe.searchEligibility.eligible).toBe(true);
    expect(finalMe.availabilityWindows).toHaveLength(1);
    expect(finalMe.availabilityOverrides).toHaveLength(2);
    expect(
      finalMe.availabilityOverrides.map(
        ({ date, startTime, endTime, type }) => ({
          date,
          startTime,
          endTime,
          type,
        }),
      ),
    ).toEqual([
      {
        date: "2026-07-22",
        startTime: "18:00",
        endTime: "19:00",
        type: "add",
      },
      {
        date: "2026-07-20",
        startTime: "10:00",
        endTime: "12:00",
        type: "block",
      },
    ]);

    const blockRange = expandOverrideToUtcRange(
      {
        date: "2026-07-20",
        startTime: "10:00",
        endTime: "12:00",
        type: "block",
      },
      PROFILE_TIMEZONE,
    );
    const addRange = expandOverrideToUtcRange(
      {
        date: "2026-07-22",
        startTime: "18:00",
        endTime: "19:00",
        type: "add",
      },
      PROFILE_TIMEZONE,
    );
    const effective = computeEffectiveAvailability({
      userId: USER_ID,
      profileTimezone: PROFILE_TIMEZONE,
      bufferMinutes: profile.bufferMinutes,
      windows: finalMe.availabilityWindows,
      overrides: finalMe.availabilityOverrides,
      busyIntervals: [],
      rangeStart: new Date("2026-07-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-23T23:59:59.999Z"),
    });

    expect(effective).toHaveLength(3);
    const beforeBlock = effective.find(
      (interval) => interval.endUtc.getTime() === blockRange.startUtc.getTime(),
    );
    const afterBlock = effective.find(
      (interval) => interval.startUtc.getTime() === blockRange.endUtc.getTime(),
    );
    expect(beforeBlock).toBeDefined();
    expect(afterBlock).toBeDefined();
    if (!beforeBlock || !afterBlock) {
      return;
    }
    expect(beforeBlock.startUtc.getTime()).toBeLessThan(
      blockRange.startUtc.getTime(),
    );
    expect(afterBlock.endUtc.getTime()).toBeGreaterThan(
      blockRange.endUtc.getTime(),
    );

    const addedInterval = effective.find(
      (interval) =>
        interval.startUtc.getTime() === addRange.startUtc.getTime() &&
        interval.endUtc.getTime() === addRange.endUtc.getTime(),
    );
    expect(addedInterval).toBeDefined();
  });
});
