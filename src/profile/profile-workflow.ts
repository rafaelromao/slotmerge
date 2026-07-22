import type { Clock } from "../system/clock";
import {
  getProfileByUserId,
  updateProfileByUserId,
  type UserProfile,
  type UserProfileUpdate,
} from "./repository";

export type ProfileFieldKey =
  | "displayName"
  | "profileTimezone"
  | "bufferMinutes"
  | "avatarUrl"
  | "shortBio";

export type ProfileFieldErrors = Partial<Record<ProfileFieldKey, string>>;

export type ProfilePatch = {
  displayName?: string;
  profileTimezone?: string | null;
  bufferMinutes?: number;
  avatarUrl?: string | null;
  shortBio?: string | null;
};

export type ProfileValidationOptions = {
  supportedTimeZones: ReadonlySet<string>;
};

export const PROFILE_DISPLAY_NAME_MIN_LENGTH = 1;
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;
export const PROFILE_SHORT_BIO_MAX_LENGTH = 280;
export const PROFILE_BUFFER_MINUTES_MIN = 0;
export const PROFILE_BUFFER_MINUTES_MAX = 60;

export function defaultSupportedTimeZones(): ReadonlySet<string> {
  return new Set(Intl.supportedValuesOf("timeZone"));
}

export function validateProfilePatch(
  patch: ProfilePatch,
  options: ProfileValidationOptions,
): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};

  if (patch.displayName !== undefined) {
    const trimmed = patch.displayName.trim();
    if (trimmed.length < PROFILE_DISPLAY_NAME_MIN_LENGTH) {
      errors.displayName =
        "Display name is required and must be at least 1 character.";
    } else if (trimmed.length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
      errors.displayName = `Display name must be ${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;
    }
  }

  if (patch.profileTimezone !== undefined && patch.profileTimezone !== null) {
    if (!options.supportedTimeZones.has(patch.profileTimezone)) {
      errors.profileTimezone =
        "Timezone must be a supported IANA timezone (for example, America/New_York).";
    }
  }

  if (patch.bufferMinutes !== undefined) {
    const value = patch.bufferMinutes;
    if (
      !Number.isInteger(value) ||
      value < PROFILE_BUFFER_MINUTES_MIN ||
      value > PROFILE_BUFFER_MINUTES_MAX
    ) {
      errors.bufferMinutes = `Buffer minutes must be a whole number between ${PROFILE_BUFFER_MINUTES_MIN} and ${PROFILE_BUFFER_MINUTES_MAX}.`;
    }
  }

  if (patch.avatarUrl !== undefined && patch.avatarUrl !== null) {
    if (!/^https:\/\//.test(patch.avatarUrl)) {
      errors.avatarUrl = "Avatar URL must start with https://.";
    }
  }

  if (patch.shortBio !== undefined && patch.shortBio !== null) {
    if (patch.shortBio.length > PROFILE_SHORT_BIO_MAX_LENGTH) {
      errors.shortBio = `Short bio must be ${PROFILE_SHORT_BIO_MAX_LENGTH} characters or fewer.`;
    }
  }

  return errors;
}

type DepOverrides = {
  getProfileByUserId?: typeof getProfileByUserId;
  updateProfileByUserId?: typeof updateProfileByUserId;
  clock?: Clock;
  supportedTimeZones?: ReadonlySet<string>;
};

export type ProfileWorkflow = {
  loadMe(input: {
    userId: string;
  }): Promise<{ ok: true; value: UserProfile } | { ok: false; error: "not_found" }>;
  updateProfile(input: {
    userId: string;
    patch: ProfilePatch;
  }): Promise<
    | { ok: true; value: UserProfile }
    | { ok: false; error: { fieldErrors: ProfileFieldErrors } }
  >;
};

export function createProfileWorkflow(deps: DepOverrides = {}): ProfileWorkflow {
  const getProfile = deps.getProfileByUserId ?? getProfileByUserId;
  const updateProfile = deps.updateProfileByUserId ?? updateProfileByUserId;
  const supportedTimeZones =
    deps.supportedTimeZones ?? defaultSupportedTimeZones();
  // Keep `clock` for future audit timestamps; the workflow does not currently
  // emit one, but the seam is preserved so callers can inject a fixed clock.
  void deps.clock;

  return {
    async loadMe({ userId }) {
      const profile = await getProfile(userId);
      if (!profile) {
        return { ok: false, error: "not_found" };
      }
      return { ok: true, value: profile };
    },
    async updateProfile({ userId, patch }) {
      const current = await getProfile(userId);
      if (!current) {
        return {
          ok: false,
          error: {
            fieldErrors: {
              displayName: "Profile not found. Please reload and try again.",
            },
          },
        };
      }

      const fieldErrors = validateProfilePatch(patch, { supportedTimeZones });
      if (Object.keys(fieldErrors).length > 0) {
        return { ok: false, error: { fieldErrors } };
      }

      const update: UserProfileUpdate = {};
      if (patch.displayName !== undefined) {
        update.displayName = patch.displayName.trim();
      }
      if (patch.profileTimezone !== undefined) {
        update.profileTimezone = patch.profileTimezone;
      }
      if (patch.bufferMinutes !== undefined) {
        update.bufferMinutes = patch.bufferMinutes;
      }
      if (patch.avatarUrl !== undefined) {
        update.avatarUrl = patch.avatarUrl;
      }
      if (patch.shortBio !== undefined) {
        update.shortBio = patch.shortBio;
      }

      const next = await updateProfile(userId, update);
      if (!next) {
        return {
          ok: false,
          error: {
            fieldErrors: {
              displayName: "Profile not found. Please reload and try again.",
            },
          },
        };
      }

      return { ok: true, value: next };
    },
  };
}
