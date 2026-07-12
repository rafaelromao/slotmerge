import { eq, and } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  availabilityWindows,
  type WeeklyAvailabilityWindow,
  type CreateWeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowUpdate,
} from "../db/schema";

export type {
  WeeklyAvailabilityWindow,
  CreateWeeklyAvailabilityWindow,
  WeeklyAvailabilityWindowUpdate,
};

export type WeeklyAvailabilityWindowRepository = {
  add(
    userId: string,
    window: CreateWeeklyAvailabilityWindow,
    profileTimezone: string,
  ): Promise<WeeklyAvailabilityWindow>;
  listByUserId(userId: string): Promise<WeeklyAvailabilityWindow[]>;
  findById(
    id: string,
    userId: string,
  ): Promise<WeeklyAvailabilityWindow | null>;
  updateById(
    id: string,
    userId: string,
    updates: WeeklyAvailabilityWindowUpdate,
  ): Promise<WeeklyAvailabilityWindow | null>;
  removeById(id: string, userId: string): Promise<boolean>;
};

let repositoryOverride: WeeklyAvailabilityWindowRepository | null = null;

export function setWeeklyAvailabilityWindowRepositoryForTests(
  repository: WeeklyAvailabilityWindowRepository | null,
) {
  repositoryOverride = repository;
}

export function clearWeeklyAvailabilityWindowOverride() {
  repositoryOverride = null;
}

function getRepository(): WeeklyAvailabilityWindowRepository {
  return repositoryOverride ?? databaseWeeklyAvailabilityWindowRepository;
}

const databaseWeeklyAvailabilityWindowRepository: WeeklyAvailabilityWindowRepository =
  {
    add: async (userId, window, profileTimezone) => {
      const [row] = await getDb()
        .insert(availabilityWindows)
        .values({
          userId,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          profileTimezone,
        })
        .returning();

      return row;
    },
    listByUserId: async (userId) => {
      const rows = await getDb()
        .select()
        .from(availabilityWindows)
        .where(eq(availabilityWindows.userId, userId));

      return rows;
    },
    findById: async (id, userId) => {
      const rows = await getDb()
        .select()
        .from(availabilityWindows)
        .where(
          and(
            eq(availabilityWindows.id, id),
            eq(availabilityWindows.userId, userId),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
    updateById: async (id, userId, updates) => {
      const current = await getDb()
        .select()
        .from(availabilityWindows)
        .where(
          and(
            eq(availabilityWindows.id, id),
            eq(availabilityWindows.userId, userId),
          ),
        )
        .limit(1);

      if (!current || current.length === 0) {
        return null;
      }

      const [row] = await getDb()
        .update(availabilityWindows)
        .set({
          ...(updates.dayOfWeek !== undefined && {
            dayOfWeek: updates.dayOfWeek,
          }),
          ...(updates.startTime !== undefined && {
            startTime: updates.startTime,
          }),
          ...(updates.endTime !== undefined && { endTime: updates.endTime }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(availabilityWindows.id, id),
            eq(availabilityWindows.userId, userId),
          ),
        )
        .returning();

      return row ?? null;
    },
    removeById: async (id, userId) => {
      const deleted = await getDb()
        .delete(availabilityWindows)
        .where(
          and(
            eq(availabilityWindows.id, id),
            eq(availabilityWindows.userId, userId),
          ),
        )
        .returning({ id: availabilityWindows.id });

      return deleted.length > 0;
    },
  };

export async function addWeeklyAvailabilityWindow(
  userId: string,
  window: CreateWeeklyAvailabilityWindow,
  profileTimezone: string,
): Promise<WeeklyAvailabilityWindow> {
  return getRepository().add(userId, window, profileTimezone);
}

export async function listWeeklyAvailabilityWindowsByUserId(
  userId: string,
): Promise<WeeklyAvailabilityWindow[]> {
  return getRepository().listByUserId(userId);
}

export async function findWeeklyAvailabilityWindowById(
  id: string,
  userId: string,
): Promise<WeeklyAvailabilityWindow | null> {
  return getRepository().findById(id, userId);
}

export async function updateWeeklyAvailabilityWindowById(
  id: string,
  userId: string,
  updates: WeeklyAvailabilityWindowUpdate,
): Promise<WeeklyAvailabilityWindow | null> {
  return getRepository().updateById(id, userId, updates);
}

export async function removeWeeklyAvailabilityWindowById(
  id: string,
  userId: string,
): Promise<boolean> {
  return getRepository().removeById(id, userId);
}

export type WeeklyWindowDescriptor = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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

export function expandWeeklyWindowToUtcRange(
  window: WeeklyWindowDescriptor,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ startUtc: Date; endUtc: Date }> {
  const results: Array<{ startUtc: Date; endUtc: Date }> = [];

  const current = new Date(rangeStart);
  current.setUTCHours(0, 0, 0, 0);

  const end = new Date(rangeEnd);
  end.setUTCHours(23, 59, 59, 999);

  while (current <= end) {
    if (current.getUTCDay() === window.dayOfWeek) {
      const { hours: startHours, minutes: startMinutes } = parseTime(
        window.startTime,
      );
      const { hours: endHours, minutes: endMinutes } = parseTime(
        window.endTime,
      );

      const year = current.getUTCFullYear();
      const month = current.getUTCMonth();
      const day = current.getUTCDate();

      const startUtc = toUtcDateForTimezone(
        year,
        month,
        day,
        startHours,
        startMinutes,
        timeZone,
      );

      const endUtc = toUtcDateForTimezone(
        year,
        month,
        day,
        endHours,
        endMinutes,
        timeZone,
      );

      results.push({ startUtc, endUtc });
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return results;
}
