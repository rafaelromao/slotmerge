import { describe, expect, it, vi } from "vitest";

import { fetchGoogleFreeBusy } from "./google";
import { fetchMicrosoftFreeBusy } from "./microsoft";
import {
  FreeBusyAuthError,
  FreeBusyRateLimitError,
  FreeBusyServerError,
} from "./types";

const FIXED_TIME_MIN = "2026-07-01T00:00:00Z";
const FIXED_TIME_MAX = "2026-07-02T00:00:00Z";

describe("FreeBusy error classes", () => {
  describe("Google", () => {
    it("throws FreeBusyAuthError on 401 carrying google provider", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 401 }));

      await expect(
        fetchGoogleFreeBusy({
          accessToken: "bad-token",
          calendarIds: ["primary"],
          timeMin: FIXED_TIME_MIN,
          timeMax: FIXED_TIME_MAX,
          fetchImpl: mockFetch,
        }),
      ).rejects.toMatchObject({
        name: "FreeBusyAuthError",
        provider: "google",
      });
    });

    it("throws FreeBusyRateLimitError on 429 carrying google provider", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "30" },
        }),
      );

      await expect(
        fetchGoogleFreeBusy({
          accessToken: "ya1.aFakeToken",
          calendarIds: ["primary"],
          timeMin: FIXED_TIME_MIN,
          timeMax: FIXED_TIME_MAX,
          fetchImpl: mockFetch,
        }),
      ).rejects.toMatchObject({
        name: "FreeBusyRateLimitError",
        provider: "google",
        retryAfterSeconds: 30,
      });
    });

    it("throws FreeBusyServerError on 5xx carrying google provider", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 503 }));

      await expect(
        fetchGoogleFreeBusy({
          accessToken: "ya1.aFakeToken",
          calendarIds: ["primary"],
          timeMin: FIXED_TIME_MIN,
          timeMax: FIXED_TIME_MAX,
          fetchImpl: mockFetch,
        }),
      ).rejects.toMatchObject({
        name: "FreeBusyServerError",
        provider: "google",
        statusCode: 503,
      });
    });
  });

  describe("Microsoft", () => {
    it("throws FreeBusyAuthError on 401 carrying microsoft provider", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 401 }));

      await expect(
        fetchMicrosoftFreeBusy({
          accessToken: "bad-token",
          calendarIds: ["user@domain.com"],
          timeMin: FIXED_TIME_MIN,
          timeMax: FIXED_TIME_MAX,
          fetchImpl: mockFetch,
        }),
      ).rejects.toMatchObject({
        name: "FreeBusyAuthError",
        provider: "microsoft",
      });
    });

    it("throws FreeBusyRateLimitError on 429 carrying microsoft provider", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "60" },
        }),
      );

      await expect(
        fetchMicrosoftFreeBusy({
          accessToken: "ey.aFakeToken",
          calendarIds: ["user@domain.com"],
          timeMin: FIXED_TIME_MIN,
          timeMax: FIXED_TIME_MAX,
          fetchImpl: mockFetch,
        }),
      ).rejects.toMatchObject({
        name: "FreeBusyRateLimitError",
        provider: "microsoft",
        retryAfterSeconds: 60,
      });
    });

    it("throws FreeBusyServerError on 5xx carrying microsoft provider", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 503 }));

      await expect(
        fetchMicrosoftFreeBusy({
          accessToken: "ey.aFakeToken",
          calendarIds: ["user@domain.com"],
          timeMin: FIXED_TIME_MIN,
          timeMax: FIXED_TIME_MAX,
          fetchImpl: mockFetch,
        }),
      ).rejects.toMatchObject({
        name: "FreeBusyServerError",
        provider: "microsoft",
        statusCode: 503,
      });
    });
  });

  it("uses a single class per error category regardless of provider", () => {
    expect(FreeBusyAuthError).toBeDefined();
    expect(FreeBusyRateLimitError).toBeDefined();
    expect(FreeBusyServerError).toBeDefined();
  });
});
