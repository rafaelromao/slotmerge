import { describe, expect, it } from "vitest";

import {
  createProfileWorkflow,
  validateProfilePatch,
  type ProfilePatch,
} from "./profile-workflow";
import type { UserProfile } from "./repository";
import type { Clock } from "../system/clock";

const supportedTimeZones = new Set([
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
]);

function fixedClock(now: Date): Clock {
  return { now: () => now };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    displayName: "Ada Lovelace",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 15,
    ...overrides,
  };
}

describe("validateProfilePatch", () => {
  it("rejects an empty display name after trim", () => {
    const errors = validateProfilePatch(
      { displayName: "   " },
      { supportedTimeZones },
    );
    expect(errors.displayName).toBeDefined();
  });

  it("rejects a display name longer than 80 chars after trim", () => {
    const errors = validateProfilePatch(
      { displayName: "x".repeat(81) },
      { supportedTimeZones },
    );
    expect(errors.displayName).toBeDefined();
  });

  it("accepts a display name at the 80-char boundary", () => {
    const errors = validateProfilePatch(
      { displayName: "x".repeat(80) },
      { supportedTimeZones },
    );
    expect(errors.displayName).toBeUndefined();
  });

  it("accepts a display name with surrounding whitespace trimmed to 80 chars", () => {
    const errors = validateProfilePatch(
      { displayName: "  " + "x".repeat(78) + "  " },
      { supportedTimeZones },
    );
    expect(errors.displayName).toBeUndefined();
  });

  it("rejects a timezone that is not in supportedTimeZones", () => {
    const errors = validateProfilePatch(
      { profileTimezone: "Mars/Olympus_Mons" },
      { supportedTimeZones },
    );
    expect(errors.profileTimezone).toBeDefined();
  });

  it("accepts a timezone in supportedTimeZones", () => {
    const errors = validateProfilePatch(
      { profileTimezone: "America/New_York" },
      { supportedTimeZones },
    );
    expect(errors.profileTimezone).toBeUndefined();
  });

  it("accepts a null timezone", () => {
    const errors = validateProfilePatch(
      { profileTimezone: null },
      { supportedTimeZones },
    );
    expect(errors.profileTimezone).toBeUndefined();
  });

  it("rejects a non-integer buffer minutes value", () => {
    const errors = validateProfilePatch(
      { bufferMinutes: 7.5 },
      { supportedTimeZones },
    );
    expect(errors.bufferMinutes).toBeDefined();
  });

  it("rejects a negative buffer minutes value", () => {
    const errors = validateProfilePatch(
      { bufferMinutes: -1 },
      { supportedTimeZones },
    );
    expect(errors.bufferMinutes).toBeDefined();
  });

  it("rejects a buffer minutes value above 60", () => {
    const errors = validateProfilePatch(
      { bufferMinutes: 61 },
      { supportedTimeZones },
    );
    expect(errors.bufferMinutes).toBeDefined();
  });

  it("accepts buffer minutes value at 0 and 60 boundaries", () => {
    expect(
      validateProfilePatch(
        { bufferMinutes: 0 },
        { supportedTimeZones },
      ).bufferMinutes,
    ).toBeUndefined();
    expect(
      validateProfilePatch(
        { bufferMinutes: 60 },
        { supportedTimeZones },
      ).bufferMinutes,
    ).toBeUndefined();
  });

  it("rejects a non-https avatar URL", () => {
    const errors = validateProfilePatch(
      { avatarUrl: "http://example.com/avatar.png" },
      { supportedTimeZones },
    );
    expect(errors.avatarUrl).toBeDefined();
  });

  it("rejects a malformed avatar URL", () => {
    const errors = validateProfilePatch(
      { avatarUrl: "not-a-url" },
      { supportedTimeZones },
    );
    expect(errors.avatarUrl).toBeDefined();
  });

  it("accepts an empty avatar URL", () => {
    const errors = validateProfilePatch(
      { avatarUrl: null },
      { supportedTimeZones },
    );
    expect(errors.avatarUrl).toBeUndefined();
  });

  it("accepts an https avatar URL", () => {
    const errors = validateProfilePatch(
      { avatarUrl: "https://example.com/avatar.png" },
      { supportedTimeZones },
    );
    expect(errors.avatarUrl).toBeUndefined();
  });

  it("rejects a short bio longer than 280 chars", () => {
    const errors = validateProfilePatch(
      { shortBio: "x".repeat(281) },
      { supportedTimeZones },
    );
    expect(errors.shortBio).toBeDefined();
  });

  it("accepts a short bio at the 280-char boundary", () => {
    const errors = validateProfilePatch(
      { shortBio: "x".repeat(280) },
      { supportedTimeZones },
    );
    expect(errors.shortBio).toBeUndefined();
  });

  it("accepts an empty short bio", () => {
    const errors = validateProfilePatch(
      { shortBio: null },
      { supportedTimeZones },
    );
    expect(errors.shortBio).toBeUndefined();
  });

  it("returns no errors for a fully valid patch", () => {
    const errors = validateProfilePatch(
      {
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: 30,
        avatarUrl: "https://example.com/grace.png",
        shortBio: "Compiler pioneer",
      },
      { supportedTimeZones },
    );
    expect(errors).toEqual({});
  });
});

describe("createProfileWorkflow.loadMe", () => {
  it("returns the profile when the user exists", async () => {
    const profile = makeProfile();
    const workflow = createProfileWorkflow({
      getProfileByUserId: (userId) =>
        Promise.resolve(userId === profile.id ? profile : null),
      supportedTimeZones,
    });
    const result = await workflow.loadMe({ userId: profile.id });
    expect(result).toEqual({ ok: true, value: profile });
  });

  it("returns not_found when no profile exists", async () => {
    const workflow = createProfileWorkflow({
      getProfileByUserId: () => Promise.resolve(null),
      supportedTimeZones,
    });
    const result = await workflow.loadMe({ userId: "ghost" });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("createProfileWorkflow.updateProfile", () => {
  it("returns the updated profile when validation and persistence succeed", async () => {
    const initial = makeProfile();
    const updated = makeProfile({
      displayName: "Grace Hopper",
      profileTimezone: "America/New_York",
      bufferMinutes: 30,
      avatarUrl: "https://example.com/grace.png",
      shortBio: "Compiler pioneer",
    });
    const workflow = createProfileWorkflow({
      getProfileByUserId: (userId) =>
        Promise.resolve(userId === initial.id ? initial : null),
      updateProfileByUserId: (userId, patch) =>
        Promise.resolve(userId === initial.id ? { ...initial, ...patch } : null),
      clock: fixedClock(new Date("2026-07-12T12:00:00.000Z")),
      supportedTimeZones,
    });
    const result = await workflow.updateProfile({
      userId: initial.id,
      patch: {
        displayName: "Grace Hopper",
        profileTimezone: "America/New_York",
        bufferMinutes: 30,
        avatarUrl: "https://example.com/grace.png",
        shortBio: "Compiler pioneer",
      },
    });
    expect(result).toEqual({ ok: true, value: updated });
  });

  it("returns field errors without persisting when display name is empty", async () => {
    let persisted = false;
    const initial = makeProfile();
    const workflow = createProfileWorkflow({
      getProfileByUserId: (userId) =>
        Promise.resolve(userId === initial.id ? initial : null),
      updateProfileByUserId: () => {
        persisted = true;
        return Promise.resolve(initial);
      },
      supportedTimeZones,
    });
    const result = await workflow.updateProfile({
      userId: initial.id,
      patch: { displayName: "" },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        fieldErrors: {
          displayName: expect.any(String) as string,
        },
      },
    });
    expect(persisted).toBe(false);
  });

  it("returns field errors for multiple fields at once", async () => {
    const initial = makeProfile();
    const workflow = createProfileWorkflow({
      getProfileByUserId: (userId) =>
        Promise.resolve(userId === initial.id ? initial : null),
      updateProfileByUserId: () => Promise.resolve(initial),
      supportedTimeZones,
    });
    const patch: ProfilePatch = {
      displayName: "",
      profileTimezone: "Mars/Olympus",
      bufferMinutes: 999,
      avatarUrl: "http://insecure.example.com/a.png",
      shortBio: "x".repeat(500),
    };
    const result = await workflow.updateProfile({
      userId: initial.id,
      patch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldErrors.displayName).toBeDefined();
    expect(result.error.fieldErrors.profileTimezone).toBeDefined();
    expect(result.error.fieldErrors.bufferMinutes).toBeDefined();
    expect(result.error.fieldErrors.avatarUrl).toBeDefined();
    expect(result.error.fieldErrors.shortBio).toBeDefined();
  });

  it("returns field errors when the user is missing", async () => {
    const workflow = createProfileWorkflow({
      getProfileByUserId: () => Promise.resolve(null),
      updateProfileByUserId: () => Promise.resolve(null),
      supportedTimeZones,
    });
    const result = await workflow.updateProfile({
      userId: "ghost",
      patch: { displayName: "Grace Hopper" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldErrors).toBeDefined();
  });
});
