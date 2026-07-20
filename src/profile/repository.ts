import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { users, type UserRole, type UserStatus } from "../db/schema";
import type { Clock } from "../system/clock";
import { systemClock } from "../system/clock";

export type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  shortBio: string | null;
  role: UserRole;
  status: UserStatus;
  profileTimezone: string | null;
  bufferMinutes: number;
};

export type UserProfileUpdate = {
  displayName?: string;
  avatarUrl?: string | null;
  shortBio?: string | null;
  profileTimezone?: string | null;
  bufferMinutes?: number;
};

export type ProfileRepository = {
  findByUserId(userId: string): Promise<UserProfile | null>;
  updateByUserId(
    userId: string,
    update: UserProfileUpdate,
  ): Promise<UserProfile | null>;
  deleteByUserId(userId: string): Promise<boolean>;
};

let repositoryOverride: ProfileRepository | null = null;

export function setProfileRepositoryForTests(
  repository: ProfileRepository | null,
) {
  repositoryOverride = repository;
}

export async function getProfileByUserId(
  userId: string,
): Promise<UserProfile | null> {
  return getProfileRepository().findByUserId(userId);
}

export async function updateProfileByUserId(
  userId: string,
  update: UserProfileUpdate,
): Promise<UserProfile | null> {
  return getProfileRepository().updateByUserId(userId, update);
}

export async function deleteProfileByUserId(userId: string): Promise<boolean> {
  return getProfileRepository().deleteByUserId(userId);
}

function getProfileRepository(): ProfileRepository {
  return repositoryOverride ?? getDefaultProfileRepository();
}

let cachedDefaultProfileRepository: ProfileRepository | null = null;

export function createPostgresProfileRepository(
  clock: Clock,
): ProfileRepository {
  return {
    findByUserId: async (userId) => {
      const [row] = await getDb()
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          shortBio: users.shortBio,
          role: users.role,
          status: users.status,
          profileTimezone: users.profileTimezone,
          bufferMinutes: users.bufferMinutes,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return row ?? null;
    },
    updateByUserId: async (userId, update) => {
      const fallback = getDefaultProfileRepository();

      const current = await fallback.findByUserId(userId);

      if (!current) {
        return null;
      }

      const displayName = update.displayName ?? current.displayName;

      if (!displayName || !displayName.trim()) {
        return null;
      }

      const avatarUrl =
        update.avatarUrl === undefined ? current.avatarUrl : update.avatarUrl;
      const shortBio =
        update.shortBio === undefined ? current.shortBio : update.shortBio;
      const profileTimezone =
        update.profileTimezone === undefined
          ? current.profileTimezone
          : update.profileTimezone;
      const bufferMinutes =
        update.bufferMinutes === undefined
          ? current.bufferMinutes
          : update.bufferMinutes;

      const [row] = await getDb()
        .update(users)
        .set({
          displayName: displayName.trim(),
          avatarUrl,
          shortBio,
          profileTimezone,
          bufferMinutes,
          updatedAt: clock.now(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          shortBio: users.shortBio,
          role: users.role,
          status: users.status,
          profileTimezone: users.profileTimezone,
          bufferMinutes: users.bufferMinutes,
        });

      return row ?? null;
    },
    deleteByUserId: async (userId) => {
      const deleted = await getDb()
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id });

      return deleted.length > 0;
    },
  };
}

function getDefaultProfileRepository(): ProfileRepository {
  if (!cachedDefaultProfileRepository) {
    cachedDefaultProfileRepository =
      createPostgresProfileRepository(systemClock());
  }
  return cachedDefaultProfileRepository;
}
