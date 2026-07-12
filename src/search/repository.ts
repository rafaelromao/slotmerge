export type SearchRecord = {
  id?: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number | null;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
  generatedAt: Date;
  snapshotReference?: string;
};

export type SearchRepository = {
  save(record: SearchRecord): Promise<SearchRecord>;
  findById(id: string): Promise<SearchRecord | null>;
  listByOrganizer(organizerId: string): Promise<SearchRecord[]>;
};

