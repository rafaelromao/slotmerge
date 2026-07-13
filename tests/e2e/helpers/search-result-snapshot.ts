/**
 * Strict Zod schema for Search Result Snapshot JSON.
 * All search result assertions use this schema for strict validation.
 *
 * E2E coverage: PRD stories 35-46 → tests 33-43
 */

import { z } from "zod";

export const SearchResultSnapshotSchema = z.object({
  version: z.literal(1),
  searchId: z.string(),
  generatedAt: z.string().datetime(),
  parameters: z.object({
    selectedTopicIds: z.array(z.string()),
    minimumMatchingUsers: z.number().int().min(1),
    durationMinutes: z.number().int().min(15).max(480),
    dateRangeStart: z.string().datetime(),
    dateRangeEnd: z.string().datetime(),
    organizerTimezone: z.string(),
  }),
  weeklyGrid: z.record(
    z.string(), // ISO "2024-W23" style key
    z.array(
      z.object({
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        matchCount: z.number().int().min(0),
        stale: z.boolean(),
        matches: z.array(
          z.object({
            userId: z.string(),
            displayName: z.string(),
            avatarUrl: z.string().nullable(),
            bio: z.string().nullable(),
            topics: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
              }),
            ),
            availabilityIndicators: z.record(z.string(), z.boolean()),
            calendarFresh: z.boolean(),
          }),
        ),
      }),
    ),
  ),
});

export type SearchResultSnapshot = z.infer<typeof SearchResultSnapshotSchema>;
