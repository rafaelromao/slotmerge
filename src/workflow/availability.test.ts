import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAvailabilityWorkflow,
  type AvailabilityWorkflow,
  type AvailabilityPageState,
} from "./availability";
import {
  setWeeklyAvailabilityWindowRepositoryForTests,
  type WeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowRepository,
} from "../profile/availability-windows";
import {
  setAvailabilityOverrideRepositoryForTests,
  type AvailabilityOverride,
  type AvailabilityOverrideRepository,
} from "../profile/availability-overrides";
import {
  setProfileRepositoryForTests,
  type UserProfile,
} from "../profile/repository";

const NOW = new Date("2026-07-12T12:00:00.000Z");

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    displayName: "Alice User",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "America/New_York",
    bufferMinutes: 5,
    ...overrides,
  };
}

function makeWindow(
  overrides: Partial<WeeklyAvailabilityWindow> = {},
): WeeklyAvailabilityWindow {
  return {
    id: "window-1",
    userId: "user-1",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "12:00",
    profileTimezone: "America/New_York",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeOverride(
  overrides: Partial<AvailabilityOverride> = {},
): AvailabilityOverride {
  return {
    id: "override-1",
    userId: "user-1",
    date: "2026-07-15",
    startTime: "12:00",
    endTime: "13:00",
    type: "add",
    profileTimezone: "America/New_York",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeWindowRepo(): WeeklyAvailabilityWindowRepository {
  return {
    add: vi.fn(),
    listByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    updateById: vi.fn().mockResolvedValue(null),
    removeById: vi.fn().mockResolvedValue(false),
  };
}

function makeOverrideRepo(): AvailabilityOverrideRepository {
  return {
    add: vi.fn(),
    listByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    removeById: vi.fn().mockResolvedValue(false),
  };
}

describe("availabilityWorkflow", () => {
  let windows: WeeklyAvailabilityWindowRepository;
  let overrides: AvailabilityOverrideRepository;
  let workflow: AvailabilityWorkflow;

  beforeEach(() => {
    windows = makeWindowRepo();
    overrides = makeOverrideRepo();
    setProfileRepositoryForTests({
      findByUserId: vi.fn().mockResolvedValue(makeProfile()),
      updateByUserId: vi.fn().mockResolvedValue(null),
      deleteByUserId: vi.fn().mockResolvedValue(false),
    });
    setWeeklyAvailabilityWindowRepositoryForTests(windows);
    setAvailabilityOverrideRepositoryForTests(overrides);
    workflow = createAvailabilityWorkflow();
  });

  afterEach(() => {
    setWeeklyAvailabilityWindowRepositoryForTests(null);
    setAvailabilityOverrideRepositoryForTests(null);
    setProfileRepositoryForTests(null);
  });

  it("loadPageState returns the user's windows grouped by day, overrides, profile timezone, and buffer", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.listByUserId).mockResolvedValue([
      makeWindow({
        id: "window-mon",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "12:00",
      }),
      makeWindow({
        id: "window-tue",
        dayOfWeek: 2,
        startTime: "09:00",
        endTime: "17:00",
      }),
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(overrides.listByUserId).mockResolvedValue([
      makeOverride({ id: "override-block", type: "block", date: "2026-07-15" }),
    ]);

    const result = await workflow.loadPageState({ userId: "user-1", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state: AvailabilityPageState = result.value;
    expect(state.profileTimezone).toBe("America/New_York");
    expect(state.bufferMinutes).toBe(5);
    expect(state.windowsByDay[1]).toHaveLength(1);
    expect(state.windowsByDay[1]?.[0]?.id).toBe("window-mon");
    expect(state.windowsByDay[2]).toHaveLength(1);
    expect(state.windowsByDay[2]?.[0]?.id).toBe("window-tue");
    expect(state.windowsByDay[3]).toHaveLength(0);
    expect(state.overrides).toHaveLength(1);
    expect(state.overrides[0]?.id).toBe("override-block");
  });

  it("loadPageState returns a profile_timezone_required error when the profile timezone is null", async () => {
    setProfileRepositoryForTests({
      findByUserId: vi
        .fn()
        .mockResolvedValue(makeProfile({ profileTimezone: null })),
      updateByUserId: vi.fn().mockResolvedValue(null),
      deleteByUserId: vi.fn().mockResolvedValue(false),
    });
    workflow = createAvailabilityWorkflow();

    const result = await workflow.loadPageState({ userId: "user-1", now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("profile_timezone_required");
  });

  it("addWindow persists a new window and returns ok", async () => {
    const created = makeWindow({
      id: "new-window",
      dayOfWeek: 3,
      startTime: "10:00",
      endTime: "11:00",
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.add).mockResolvedValue(created);

    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 3,
      startTime: "10:00",
      endTime: "11:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.window.id).toBe("new-window");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(windows.add).toHaveBeenCalledWith(
      "user-1",
      { dayOfWeek: 3, startTime: "10:00", endTime: "11:00" },
      "America/New_York",
    );
  });

  it("removeWindow returns ok when the repository removes the window", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.findById).mockResolvedValue(makeWindow());
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.removeById).mockResolvedValue(true);

    const result = await workflow.removeWindow({
      userId: "user-1",
      windowId: "window-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.windowId).toBe("window-1");
  });

  it("removeWindow returns not_found when the window does not belong to the user", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.findById).mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.removeById).mockResolvedValue(false);

    const result = await workflow.removeWindow({
      userId: "user-1",
      windowId: "missing",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
  });

  it("addWindow returns end_before_start when endTime <= startTime", async () => {
    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "09:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("end_before_start");
  });

  it("addWindow returns invalid_time when the time format is bad", async () => {
    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 1,
      startTime: "not-a-time",
      endTime: "10:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_time");
  });

  it("addWindow returns outside_day when endTime is 24:00", async () => {
    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "24:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("outside_day");
  });

  it("addWindow returns overlap_existing_window when a window overlaps an existing one on the same day", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.listByUserId).mockResolvedValue([
      makeWindow({
        id: "existing",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "12:00",
      }),
    ]);

    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 1,
      startTime: "11:00",
      endTime: "13:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("overlap_existing_window");
  });

  it("addWindow allows non-overlapping windows on the same day", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.listByUserId).mockResolvedValue([
      makeWindow({
        id: "existing",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "12:00",
      }),
    ]);
    const created = makeWindow({
      id: "new",
      dayOfWeek: 1,
      startTime: "13:00",
      endTime: "15:00",
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.add).mockResolvedValue(created);

    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 1,
      startTime: "13:00",
      endTime: "15:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(true);
  });

  it("addWindow returns profile_timezone_required when the profile timezone is null", async () => {
    setProfileRepositoryForTests({
      findByUserId: vi
        .fn()
        .mockResolvedValue(makeProfile({ profileTimezone: null })),
      updateByUserId: vi.fn().mockResolvedValue(null),
      deleteByUserId: vi.fn().mockResolvedValue(false),
    });
    workflow = createAvailabilityWorkflow();

    const result = await workflow.addWindow({
      userId: "user-1",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("profile_timezone_required");
  });

  it("addOverride persists a new add override and returns ok", async () => {
    const created = makeOverride({ id: "new-override", type: "add" });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(overrides.add).mockResolvedValue(created);

    const result = await workflow.addOverride({
      userId: "user-1",
      date: "2026-07-20",
      startTime: "18:00",
      endTime: "20:00",
      type: "add",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.override.id).toBe("new-override");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(overrides.add).toHaveBeenCalledWith(
      "user-1",
      { date: "2026-07-20", startTime: "18:00", endTime: "20:00", type: "add" },
      "America/New_York",
    );
  });

  it("addOverride returns date_required when the date is empty", async () => {
    const result = await workflow.addOverride({
      userId: "user-1",
      date: "",
      startTime: "18:00",
      endTime: "20:00",
      type: "add",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("date_required");
  });

  it("addOverride returns invalid_time when the time format is bad", async () => {
    const result = await workflow.addOverride({
      userId: "user-1",
      date: "2026-07-20",
      startTime: "25:00",
      endTime: "20:00",
      type: "add",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_time");
  });

  it("addOverride returns end_before_start when endTime <= startTime", async () => {
    const result = await workflow.addOverride({
      userId: "user-1",
      date: "2026-07-20",
      startTime: "20:00",
      endTime: "18:00",
      type: "add",
      profileTimezone: "America/New_York",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("end_before_start");
  });

  it("removeOverride returns ok when the repository removes the override", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(overrides.removeById).mockResolvedValue(true);

    const result = await workflow.removeOverride({
      userId: "user-1",
      overrideId: "override-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overrideId).toBe("override-1");
  });

  it("removeOverride returns not_found when the override does not belong to the user", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(overrides.removeById).mockResolvedValue(false);

    const result = await workflow.removeOverride({
      userId: "user-1",
      overrideId: "missing",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
  });

  it("validateBuffer returns ok for a valid buffer", () => {
    const result = workflow.validateBuffer({ bufferMinutes: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bufferMinutes).toBe(15);
  });

  it("validateBuffer returns invalid_buffer when the buffer is out of range", () => {
    const result = workflow.validateBuffer({ bufferMinutes: 200 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_buffer");
  });

  it("validateBuffer returns invalid_buffer when the buffer is not an integer", () => {
    const result = workflow.validateBuffer({ bufferMinutes: 1.5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_buffer");
  });

  it("loadPageState returns preview lines for the next 7 days based on the user's windows", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(windows.listByUserId).mockResolvedValue([
      makeWindow({
        id: "window-mon",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "12:00",
      }),
    ]);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(overrides.listByUserId).mockResolvedValue([]);

    const result = await workflow.loadPageState({ userId: "user-1", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.previewLines.length).toBe(7);
    const mondayLine = result.value.previewLines.find(
      (line) => line.dayOfWeek === 1,
    );
    expect(mondayLine?.intervals).toContain("09:00–12:00");
  });
});
