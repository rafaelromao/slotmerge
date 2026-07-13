import { eq, and } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  availabilityOverrides,
  type AvailabilityOverride,
  type CreateAvailabilityOverride,
} from "../db/schema";

export type { AvailabilityOverride, CreateAvailabilityOverride };

export type AvailabilityOverrideRepository = {
  add(
    userId: string,
    override: CreateAvailabilityOverride,
    profileTimezone: string,
  ): Promise<AvailabilityOverride>;
  listByUserId(userId: string): Promise<AvailabilityOverride[]>;
  findById(id: string, userId: string): Promise<AvailabilityOverride | null>;
  removeById(id: string, userId: string): Promise<boolean>;
};

let repositoryOverride: AvailabilityOverrideRepository | null = null;

export function setAvailabilityOverrideRepositoryForTests(
  repository: AvailabilityOverrideRepository | null,
) {
  repositoryOverride = repository;
}

export function clearAvailabilityOverrideRepository() {
  repositoryOverride = null;
}

function getRepository(): AvailabilityOverrideRepository {
  return repositoryOverride ?? databaseAvailabilityOverrideRepository;
}

const databaseAvailabilityOverrideRepository: AvailabilityOverrideRepository = {
  add: async (userId, override, profileTimezone) => {
    const [row] = await getDb()
      .insert(availabilityOverrides)
      .values({
        userId,
        date: override.date,
        startTime: override.startTime,
        endTime: override.endTime,
        type: override.type,
        profileTimezone,
      })
      .returning();

    return row;
  },
  listByUserId: async (userId) => {
    const rows = await getDb()
      .select()
      .from(availabilityOverrides)
      .where(eq(availabilityOverrides.userId, userId));

    return rows;
  },
  findById: async (id, userId) => {
    const rows = await getDb()
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.id, id),
          eq(availabilityOverrides.userId, userId),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  },
  removeById: async (id, userId) => {
    const deleted = await getDb()
      .delete(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.id, id),
          eq(availabilityOverrides.userId, userId),
        ),
      )
      .returning({ id: availabilityOverrides.id });

    return deleted.length > 0;
  },
};

export async function addAvailabilityOverride(
  userId: string,
  override: CreateAvailabilityOverride,
  profileTimezone: string,
): Promise<AvailabilityOverride> {
  return getRepository().add(userId, override, profileTimezone);
}

export async function listAvailabilityOverridesByUserId(
  userId: string,
): Promise<AvailabilityOverride[]> {
  return getRepository().listByUserId(userId);
}

export async function findAvailabilityOverrideById(
  id: string,
  userId: string,
): Promise<AvailabilityOverride | null> {
  return getRepository().findById(id, userId);
}

export async function removeAvailabilityOverrideById(
  id: string,
  userId: string,
): Promise<boolean> {
  return getRepository().removeById(id, userId);
}

export type AvailabilityOverrideDescriptor = {
  date: string;
  startTime: string;
  endTime: string;
  type: "add" | "block";
};

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function toUtcDateForTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const targetDate = new Date(year, month, day, hours, minutes);

  const noonUtcOnTargetDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const noonInTz = Number(
    tzFormatter
      .formatToParts(noonUtcOnTargetDate)
      .find((p) => p.type === "hour")!.value,
  );

  const hourOffset = 12 - noonInTz;
  const offsetMs = hourOffset * 60 * 60 * 1000;

  return new Date(targetDate.getTime() + offsetMs);
}

export function expandOverrideToUtcRange(
  override: AvailabilityOverrideDescriptor,
  timeZone: string,
): { startUtc: Date; endUtc: Date } {
  const [year, month, day] = override.date.split("-").map(Number);

  const { hours: startHours, minutes: startMinutes } = parseTime(
    override.startTime,
  );
  const { hours: endHours, minutes: endMinutes } = parseTime(override.endTime);

  const startUtc = toUtcDateForTimezone(
    year,
    month - 1,
    day,
    startHours,
    startMinutes,
    timeZone,
  );

  const endUtc = toUtcDateForTimezone(
    year,
    month - 1,
    day,
    endHours,
    endMinutes,
    timeZone,
  );

  return { startUtc, endUtc };
}
