import { describe, expect, it } from "vitest";

import {
  serializeSearchHistoryPage,
  serializeSearchSnapshot,
  serializeSetupStatus,
} from "./serializers";
import type { SearchSnapshot } from "../search/search-result-repository";
import type { SearchRecord } from "../search/repository";

const baseSearch: SearchRecord = {
  id: "search-1",
  organizerId: "organizer-1",
  selectedTopicIds: ["topic-1"],
  minimumMatchingUsers: 2,
  durationMinutes: 60,
  dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
  dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
  organizerTimezone: "America/Sao_Paulo",
  generatedAt: new Date("2026-07-08T15:00:00.000Z"),
};

describe("serializeSearchHistoryPage", () => {
  it("serializes the history list with ISO 8601 dates and the DTO field subset", () => {
    const history = [
      {
        id: "search-1",
        organizerId: "organizer-1",
        organizerDisplayName: "Ada Lovelace",
        selectedTopicIds: ["topic-1", "topic-2"],
        selectedTopicNames: ["Product strategy", "AI engineering"],
        minimumMatchingUsers: 3,
        durationMinutes: 45,
        dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
        dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
        organizerTimezone: "America/Sao_Paulo",
        generatedAt: new Date("2026-07-09T15:00:00.000Z"),
        snapshotId: "snapshot-1",
        stale: true,
      },
    ];

    const dto = serializeSearchHistoryPage(history);

    expect(dto).toEqual({
      history: [
        {
          id: "search-1",
          organizerId: "organizer-1",
          organizerDisplayName: "Ada Lovelace",
          selectedTopicIds: ["topic-1", "topic-2"],
          selectedTopicNames: ["Product strategy", "AI engineering"],
          minimumMatchingUsers: 3,
          durationMinutes: 45,
          dateRangeStart: "2026-07-06T03:00:00.000Z",
          dateRangeEnd: "2026-08-10T03:00:00.000Z",
          organizerTimezone: "America/Sao_Paulo",
          generatedAt: "2026-07-09T15:00:00.000Z",
          snapshotId: "snapshot-1",
          stale: true,
        },
      ],
    });
  });

  it("returns an empty history object when the list is empty", () => {
    expect(serializeSearchHistoryPage([])).toEqual({ history: [] });
  });
});

describe("serializeSearchSnapshot", () => {
  it("serializes the openSnapshot result with ISO 8601 dates and the DTO field subset", () => {
    const snapshot: SearchSnapshot = {
      generatedAt: "2026-07-08T15:00:00.000Z",
      organizerTimezone: "America/Sao_Paulo",
      dateRangeStart: "2026-07-06T03:00:00.000Z",
      dateRangeEnd: "2026-08-10T03:00:00.000Z",
      durationMinutes: 60,
      slots: [],
    };

    const opened = {
      search: { ...baseSearch },
      snapshot,
      selectedTopics: [
        { id: "topic-1", name: "Product strategy" },
        { id: "topic-2", name: "AI engineering" },
      ],
    };

    const dto = serializeSearchSnapshot(opened);

    expect(dto).toEqual({
      search: {
        id: "search-1",
        organizerId: "organizer-1",
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: "2026-07-06T03:00:00.000Z",
        dateRangeEnd: "2026-08-10T03:00:00.000Z",
        organizerTimezone: "America/Sao_Paulo",
        generatedAt: "2026-07-08T15:00:00.000Z",
      },
      snapshot,
      selectedTopics: [
        { id: "topic-1", name: "Product strategy" },
        { id: "topic-2", name: "AI engineering" },
      ],
    });
  });

  it("throws a developer error when the search id is missing on the persisted record", () => {
    const snapshot: SearchSnapshot = {
      generatedAt: "2026-07-08T15:00:00.000Z",
      organizerTimezone: "UTC",
      dateRangeStart: "2026-07-06T00:00:00.000Z",
      dateRangeEnd: "2026-08-10T00:00:00.000Z",
      durationMinutes: 60,
      slots: [],
    };

    const opened = {
      search: { ...baseSearch, id: undefined },
      snapshot,
      selectedTopics: [],
    };

    expect(() => serializeSearchSnapshot(opened)).toThrow(
      /search id is missing/i,
    );
  });
});

describe("serializeSetupStatus", () => {
  it("serializes the four required + one optional setup items with the canonical labels and keys", () => {
    const summary = {
      complete: false,
      items: [
        {
          key: "profile",
          label: "Profile",
          required: true,
          complete: true,
        },
        {
          key: "discoverability",
          label: "Discoverability",
          required: true,
          complete: false,
        },
        {
          key: "topics",
          label: "Topics",
          required: true,
          complete: false,
        },
        {
          key: "availability",
          label: "Availability",
          required: true,
          complete: false,
        },
        {
          key: "calendarConnection",
          label: "Calendar Connection",
          required: false,
          complete: false,
        },
      ],
    };

    expect(serializeSetupStatus(summary)).toEqual(summary);
  });

  it("preserves the aggregate complete flag when every required item is complete", () => {
    const summary = {
      complete: true,
      items: [
        {
          key: "profile",
          label: "Profile",
          required: true,
          complete: true,
        },
        {
          key: "discoverability",
          label: "Discoverability",
          required: true,
          complete: true,
        },
        {
          key: "topics",
          label: "Topics",
          required: true,
          complete: true,
        },
        {
          key: "availability",
          label: "Availability",
          required: true,
          complete: true,
        },
        {
          key: "calendarConnection",
          label: "Calendar Connection",
          required: false,
          complete: false,
        },
      ],
    };

    expect(serializeSetupStatus(summary)).toEqual(summary);
  });
});
