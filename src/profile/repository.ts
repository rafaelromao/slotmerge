import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { users, type UserRole, type UserStatus } from "../db/schema";

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
  displayName: string;
  avatarUrl: string | null;
  shortBio: string | null;
  profileTimezone: string | null;
  bufferMinutes: number;
};

export type ProfileRepository = {
  findByUserId(userId: string): Promise<UserProfile | null>;
  updateByUserId(
    userId: string,
    update: UserProfileUpdate,
  ): Promise<UserProfile | null>;
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

function getProfileRepository(): ProfileRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  return databaseProfileRepository;
}

const databaseProfileRepository: ProfileRepository = {
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
    const [row] = await getDb()
      .update(users)
      .set({
        displayName: update.displayName,
        avatarUrl: update.avatarUrl,
        shortBio: update.shortBio,
        profileTimezone: update.profileTimezone,
        bufferMinutes: update.bufferMinutes,
        updatedAt: new Date(),
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
};
