import { randomUUID } from "node:crypto";

import type {
  ImportedBusyIntervalRecord,
  ImportedBusyIntervalRepository,
} from "./imported-busy-intervals";
import type { BusyIntervalStatus } from "../db/schema";

export type SyncCalendarConnectionParams = {
  connectionId: string;
  provider: "google" | "microsoft";
  accessToken: string;
  contributingCalendarIds: string[];
  userId: string;
  fetchImpl: typeof fetch;
  busyIntervalRepository: ImportedBusyIntervalRepository;
  recordFailure: (input: { code: string; message: string }) => Promise<unknown>;
  clock: () => Date;
};

export async function syncCalendarConnection(
  params: SyncCalendarConnectionParams,
): Promise<void> {
  const {
    connectionId,
    userId,
    contributingCalendarIds,
    busyIntervalRepository,
    recordFailure,
    clock,
  } = params;

  if (contributingCalendarIds.length === 0) {
    return;
  }

  try {
    const intervals = generateMockBusyIntervals({
      connectionId,
      userId,
      contributingCalendarIds,
      now: clock(),
    });

    await busyIntervalRepository.upsertBatch(intervals);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordFailure({ code: "SYNC_ERROR", message });
  }
}

function generateMockBusyIntervals(params: {
  connectionId: string;
  userId: string;
  contributingCalendarIds: string[];
  now: Date;
}): ImportedBusyIntervalRecord[] {
  const { connectionId, userId, contributingCalendarIds, now } = params;

  const seed = hashString(connectionId);
  const rng = seededRandom(seed);

  const intervals: ImportedBusyIntervalRecord[] = [];
  const statuses: BusyIntervalStatus[] = ["busy", "out-of-office", "tentative"];

  for (const calendarId of contributingCalendarIds) {
    const numIntervals = Math.floor(rng() * 5) + 2;

    for (let i = 0; i < numIntervals; i++) {
      const daysAhead = Math.floor(rng() * 14) + 1;
      const startHour = Math.floor(rng() * 12) + 8;
      const durationHours = Math.floor(rng() * 3) + 1;

      const startAt = new Date(now);
      startAt.setDate(startAt.getDate() + daysAhead);
      startAt.setHours(startHour, 0, 0, 0);

      const endAt = new Date(startAt.getTime() + durationHours * 3600000);

      intervals.push({
        id: randomUUID(),
        userId,
        connectionId,
        providerCalendarId: calendarId,
        providerEventReference: null,
        status: statuses[Math.floor(rng() * statuses.length)],
        startAt,
        endAt,
        importedAt: now,
      });
    }
  }

  return intervals;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
