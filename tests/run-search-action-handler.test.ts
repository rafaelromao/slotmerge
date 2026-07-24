import { describe, expect, it } from "vitest";

import { InMemorySearchRepository } from "../src/search/in-memory-repository";
import type { UserProfile } from "../src/profile/repository";
import { InMemorySearchResultRepository } from "../src/search/search-result-in-memory-repository";

import {
  InMemoryActiveTopicsRepository,
  InMemoryDiscoverableUserRepository,
  InMemoryProfileRepository,
  mockAssemblerDeps,
  pinnedClock,
  organizerProfile,
} from "./helpers/workflow-search-fixtures";

import { buildSearchActionHandler } from "../app/(product)/searches/_actions/run-search-handler";
import { createSearchWorkflow } from "../src/workflow/search";
import { setSearchRepositoryForTests } from "../src/search/repository";

function buildHandlerAndDeps(
  overrides: {
    activeTopics?: Array<{ id: string; name: string }>;
    profile?: UserProfile | null;
    discoverableUserIds?: string[];
  } = {},
) {
  const clock = pinnedClock("2026-07-08T15:00:00.000Z");
  const activeTopics =
    overrides.activeTopics !== undefined
      ? overrides.activeTopics
      : [
          { id: "topic-1", name: "Product strategy" },
          { id: "topic-2", name: "AI engineering" },
        ];
  const profile =
    overrides.profile !== undefined ? overrides.profile : organizerProfile;
  const searchRepo = new InMemorySearchRepository();
  InMemorySearchRepository.lastInstance = searchRepo;
  setSearchRepositoryForTests(searchRepo);
  const resultRepo = new InMemorySearchResultRepository();
  const discoverableRepo = new InMemoryDiscoverableUserRepository(
    overrides.discoverableUserIds ?? [
      "user-1",
      "user-2",
      "user-3",
      "user-4",
      "user-5",
    ],
  );
  const workflow = createSearchWorkflow({
    clock,
    profileRepository: new InMemoryProfileRepository(profile),
    activeTopicsRepository: new InMemoryActiveTopicsRepository(activeTopics),
    discoverableUserRepository: discoverableRepo,
    searchResultRepository: resultRepo,
    assemblerDependencies: mockAssemblerDeps,
  });

  const handler = buildSearchActionHandler({
    workflow,
    loadSession: () =>
      Promise.resolve({
        user: profile!,
        csrfToken: "csrf-token-test",
      }),
  });

  return { handler, profile: profile! };
}

function makeRequest(): Request {
  return new Request("http://localhost/searches/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      origin: "http://localhost",
    },
  });
}

function makeFormData(values: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  fd.set("_csrf", "csrf-token-test");
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        fd.append(key, item);
      }
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

describe("runSearchAction handler", () => {
  it("returns redirect to /searches/{id} on valid submit", async () => {
    const { handler, profile } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1", "topic-2"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(result.to).toMatch(/^\/searches\/.+/);
    void profile;
  });

  it("parses calendar dates in the selected IANA timezone", async () => {
    const { handler, profile } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "Asia/Tokyo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const searchRepo = InMemorySearchRepository.lastInstance;
    expect(searchRepo).toBeTruthy();
    const stored = await searchRepo?.findById(
      result.to.replace("/searches/", ""),
    );
    expect(stored?.dateRangeStart.toISOString()).toBe(
      "2026-07-05T15:00:00.000Z",
    );
    expect(stored?.dateRangeEnd.toISOString()).toBe("2026-08-09T15:00:00.000Z");
    void profile;
  });

  it("parses DST spring-forward and fall-back dates in America/New_York", async () => {
    const { handler, profile } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-03-08",
      dateRangeEnd: "2026-03-15",
      organizerTimezone: "America/New_York",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const searchRepo = InMemorySearchRepository.lastInstance;
    expect(searchRepo).toBeTruthy();
    const stored = await searchRepo?.findById(
      result.to.replace("/searches/", ""),
    );
    expect(stored?.dateRangeStart.toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    void profile;
  });

  it("parses DST fall-back dates in America/New_York", async () => {
    const { handler, profile } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-11-01",
      dateRangeEnd: "2026-11-08",
      organizerTimezone: "America/New_York",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const searchRepo = InMemorySearchRepository.lastInstance;
    expect(searchRepo).toBeTruthy();
    const stored = await searchRepo?.findById(
      result.to.replace("/searches/", ""),
    );
    expect(stored?.dateRangeStart.toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    void profile;
  });

  it("parses Sydney DST transition dates at local midnight", async () => {
    const spring = buildHandlerAndDeps();
    const springResult = await spring.handler.runSearch({
      formData: makeFormData({
        topicIds: ["topic-1"],
        minimumMatchingUsers: "2",
        durationMinutes: "60",
        dateRangeStart: "2026-10-04",
        dateRangeEnd: "2026-10-11",
        organizerTimezone: "Australia/Sydney",
      }),
      request: makeRequest(),
    });

    expect(springResult.kind).toBe("redirect");
    if (springResult.kind !== "redirect") throw new Error("expected redirect");
    const springStored = await InMemorySearchRepository.lastInstance?.findById(
      springResult.to.replace("/searches/", ""),
    );
    expect(springStored?.dateRangeStart.toISOString()).toBe(
      "2026-10-03T14:00:00.000Z",
    );

    const fall = buildHandlerAndDeps();
    const fallResult = await fall.handler.runSearch({
      formData: makeFormData({
        topicIds: ["topic-1"],
        minimumMatchingUsers: "2",
        durationMinutes: "60",
        dateRangeStart: "2026-04-05",
        dateRangeEnd: "2026-04-12",
        organizerTimezone: "Australia/Sydney",
      }),
      request: makeRequest(),
    });

    expect(fallResult.kind).toBe("redirect");
    if (fallResult.kind !== "redirect") throw new Error("expected redirect");
    const fallStored = await InMemorySearchRepository.lastInstance?.findById(
      fallResult.to.replace("/searches/", ""),
    );
    expect(fallStored?.dateRangeStart.toISOString()).toBe(
      "2026-04-04T13:00:00.000Z",
    );
  });

  it("rejects an unparseable IANA timezone", async () => {
    const { handler, profile } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "Mars/Olympus",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("form-error");
    if (result.kind !== "form-error") throw new Error("expected form-error");
    expect(result.fieldErrors.dateRangeEnd).toBe("date_range_invalid");
    void profile;
  });

  it("returns form-error selected_topics_required when zero topics", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("form-error");
    if (result.kind !== "form-error") throw new Error("expected form-error");
    expect(result.fieldErrors.selectedTopics).toBe("selected_topics_required");
  });

  it("returns form-error topic_retired when an active Topic was retired", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1", "topic-retired"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("form-error");
    if (result.kind !== "form-error") throw new Error("expected form-error");
    expect(result.fieldErrors.selectedTopics).toBe("topic_retired");
  });

  it("returns form-error minimum_out_of_range when minimumMatchingUsers is 1", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "1",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("form-error");
    if (result.kind !== "form-error") throw new Error("expected form-error");
    expect(result.fieldErrors.minimumMatchingUsers).toBe(
      "minimum_out_of_range",
    );
  });

  it("returns form-error duration_out_of_range when duration is below 15", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "10",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("form-error");
    if (result.kind !== "form-error") throw new Error("expected form-error");
    expect(result.fieldErrors.durationMinutes).toBe("duration_out_of_range");
    expect(result.values).toEqual({
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "10",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });
  });

  it("returns form-error date_range_invalid when end is not after start", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-08-10",
      dateRangeEnd: "2026-07-06",
      organizerTimezone: "America/Sao_Paulo",
    });

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("form-error");
    if (result.kind !== "form-error") throw new Error("expected form-error");
    expect(result.fieldErrors.dateRangeEnd).toBe("date_range_invalid");
  });

  it("returns csrf-error when origin does not match", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });
    const request = new Request("http://localhost/searches/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        origin: "http://evil.example.com",
      },
    });
    const result = await handler.runSearch({ formData, request });
    expect(result.kind).toBe("csrf-error");
  });

  it("returns csrf-error when csrf token is missing", async () => {
    const { handler } = buildHandlerAndDeps();
    const formData = makeFormData({
      topicIds: ["topic-1"],
      minimumMatchingUsers: "2",
      durationMinutes: "60",
      dateRangeStart: "2026-07-06",
      dateRangeEnd: "2026-08-10",
      organizerTimezone: "America/Sao_Paulo",
    });
    formData.delete("_csrf");

    const result = await handler.runSearch({
      formData,
      request: makeRequest(),
    });

    expect(result.kind).toBe("csrf-error");
  });
});
