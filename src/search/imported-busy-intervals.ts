import {
  getImportedBusyIntervalRepository,
  type ImportedBusyIntervalRecord,
} from "../calendar/imported-busy-intervals";

export type BusyIntervalWithBuffer = {
  originalId: string;
  startAt: Date;
  endAt: Date;
  status: ImportedBusyIntervalRecord["status"];
};

export function expandBusyIntervalsWithBuffer(
  intervals: ImportedBusyIntervalRecord[],
  bufferMinutes: number,
  availabilityWindows: Array<{ startUtc: Date; endUtc: Date }>,
): BusyIntervalWithBuffer[] {
  if (bufferMinutes === 0) {
    return intervals.map((i) => ({
      originalId: i.id,
      startAt: i.startAt,
      endAt: i.endAt,
      status: i.status,
    }));
  }

  const bufferMs = bufferMinutes * 60 * 1000;
  const results: BusyIntervalWithBuffer[] = [];

  for (const interval of intervals) {
    const rawStart = new Date(interval.startAt.getTime() - bufferMs);
    const rawEnd = new Date(interval.endAt.getTime() + bufferMs);

    let latestStart = rawStart;
    let earliestEnd = rawEnd;
    let hasIntersection = false;

    for (const window of availabilityWindows) {
      if (rawEnd <= window.startUtc || rawStart >= window.endUtc) {
        continue;
      }
      hasIntersection = true;
      if (rawStart < window.startUtc) {
        latestStart = window.startUtc;
      }
      if (rawEnd > window.endUtc) {
        earliestEnd = window.endUtc;
      }
    }

    if (!hasIntersection) {
      continue;
    }

    if (latestStart < earliestEnd) {
      results.push({
        originalId: interval.id,
        startAt: latestStart,
        endAt: earliestEnd,
        status: interval.status,
      });
    }
  }

  return results;
}

export type ImportedBusyIntervalLookup = {
  findByUserIdAndDateRange(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ImportedBusyIntervalRecord[]>;
};

let lookupOverride: ImportedBusyIntervalLookup | null = null;

export function setImportedBusyIntervalLookupForTests(
  lookup: ImportedBusyIntervalLookup | null,
) {
  lookupOverride = lookup;
}

export function getImportedBusyIntervalLookup(): ImportedBusyIntervalLookup {
  return lookupOverride ?? defaultLookup;
}

const defaultLookup: ImportedBusyIntervalLookup = {
  async findByUserIdAndDateRange(userId, rangeStart, rangeEnd) {
    const repo = getImportedBusyIntervalRepository();
    return repo.findByUserIdAndDateRange(userId, rangeStart, rangeEnd);
  },
};
