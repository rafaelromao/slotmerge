import {
  getImportedBusyIntervalRepository,
  type ImportedBusyIntervalRecord,
} from "../calendar/imported-busy-intervals";

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
