// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionModule from "../src/auth/session";
import {
  setAvailabilityPageOverrideRepositoryForTests,
  setAvailabilityPageProfileRepositoryForTests,
  setAvailabilityPageWindowRepositoryForTests,
  clearAvailabilityPageRepositoryOverrides,
} from "../src/profile/availability-page-repositories";
import type { UserProfile } from "../src/profile/repository";
import type { WeeklyAvailabilityWindow } from "../src/profile/availability-windows";
import type { AvailabilityOverride } from "../src/profile/availability-overrides";

vi.mock("../src/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../src/auth/session")>(
    "../src/auth/session",
  );
  return {
    ...actual,
    getSessionFromRequest: vi.fn(),
  };
});

vi.mock("next/headers", () => {
  const obj = {
    headers: () => ({ forEach: () => undefined }),
    cookies: () => ({ toString: () => "" }),
  };
  return obj;
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

function noopAction() {
  return undefined as never;
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "user@example.com",
    displayName: "Alice User",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "America/New_York",
    bufferMinutes: 5,
    ...overrides,
  };
}

function makeWindow(
  overrides: Partial<WeeklyAvailabilityWindow> = {},
): WeeklyAvailabilityWindow {
  return {
    id: "window-1",
    userId: "user-1",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "12:00",
    profileTimezone: "America/New_York",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOverride(
  overrides: Partial<AvailabilityOverride> = {},
): AvailabilityOverride {
  return {
    id: "override-1",
    userId: "user-1",
    date: "2026-07-15",
    startTime: "12:00",
    endTime: "13:00",
    type: "add",
    profileTimezone: "America/New_York",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("/me/availability (availability page)", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Alice User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 5,
      },
      csrfToken: "csrf-user-1",
    });
    setAvailabilityPageProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(makeProfile()),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    setAvailabilityPageWindowRepositoryForTests({
      add: () => Promise.reject(new Error("not used")),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(true),
    });
    setAvailabilityPageOverrideRepositoryForTests({
      add: () => Promise.reject(new Error("not used")),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(true),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearAvailabilityPageRepositoryOverrides();
  });

  it("renders the weekly editor with one card per day and the timezone summary", async () => {
    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));

    expect(html).toContain("availability-page");
    expect(html).toContain("Timezone: <strong>America/New_York</strong>");
    for (let i = 0; i < 7; i += 1) {
      expect(html).toContain(`availability-day-${i}`);
    }
    expect(html).toContain("availability-timezone-summary");
  });

  it("renders the timezone required banner when the profile timezone is null", async () => {
    setAvailabilityPageProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(makeProfile({ profileTimezone: null })),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });

    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));

    expect(html).toContain("availability-timezone-required");
    expect(html).toContain("availability-set-timezone-link");
    expect(html).toContain("href=\"/me/profile\"");
  });

  it("renders the existing windows grouped by day and the existing overrides", async () => {
    setAvailabilityPageWindowRepositoryForTests({
      add: () => Promise.reject(new Error("not used")),
      listByUserId: () =>
        Promise.resolve([
          makeWindow({ id: "window-mon", dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }),
          makeWindow({ id: "window-tue", dayOfWeek: 2, startTime: "13:00", endTime: "17:00" }),
        ]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(true),
    });
    setAvailabilityPageOverrideRepositoryForTests({
      add: () => Promise.reject(new Error("not used")),
      listByUserId: () =>
        Promise.resolve([
          makeOverride({ id: "override-add", type: "add", date: "2026-07-20" }),
          makeOverride({ id: "override-block", type: "block", date: "2026-07-22" }),
        ]),
      findById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(true),
    });

    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));

    expect(html).toContain("availability-window-window-mon");
    expect(html).toContain("availability-window-window-tue");
    expect(html).toContain("availability-override-override-add");
    expect(html).toContain("availability-override-override-block");
    expect(html).toContain("availability-override-row--add");
    expect(html).toContain("availability-override-row--block");
  });

  it("renders the Saved indicator when searchParams.saved === '1'", async () => {
    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(
      await AvailabilityPage({ searchParams: Promise.resolve({ saved: "1" }) }),
    );
    expect(html).toContain("availability-saved-indicator");
  });

  it("renders the buffer summary linking to /me/profile", async () => {
    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));
    expect(html).toContain("availability-buffer-summary");
    expect(html).toContain("Calendar conflict buffer:");
    expect(html).toContain("availability-buffer-edit-link");
    expect(html).toContain("href=\"/me/profile\"");
  });

  it("renders the buffer error when the buffer is invalid", async () => {
    setAvailabilityPageProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(makeProfile({ bufferMinutes: 999 })),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });

    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));

    expect(html).toContain("availability-buffer-error");
    expect(html).not.toContain("availability-buffer-summary");
  });

  it("renders the effective Availability preview", async () => {
    setAvailabilityPageWindowRepositoryForTests({
      add: () => Promise.reject(new Error("not used")),
      listByUserId: () =>
        Promise.resolve([
          makeWindow({ id: "window-mon", dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }),
        ]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(true),
    });

    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));

    expect(html).toContain("availability-preview");
    expect(html).toContain("Effective Availability (next 7 days)");
  });

  it("renders the empty-state copy when no windows or overrides exist", async () => {
    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(await AvailabilityPage({}));

    expect(html).toContain("availability-empty");
    expect(html).toContain("No Availability yet.");
  });

  it("renders an inline error on the targeted day when the form error is for that day", async () => {
    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(
      await AvailabilityPage({
        searchParams: Promise.resolve({
          error: "end_before_start",
          field: "endTime",
          target: "window",
        }),
      }),
    );
    expect(html).toContain("availability-day-0-error");
  });

  it("renders an inline error on the override form when the form error targets overrides", async () => {
    const { default: AvailabilityPage } = await import(
      "../app/(product)/me/availability/page"
    );
    const html = renderToString(
      await AvailabilityPage({
        searchParams: Promise.resolve({
          error: "date_required",
          field: "date",
          target: "override",
        }),
      }),
    );
    expect(html).toContain("availability-override-error");
  });
});

describe("AvailabilityView server component", () => {
  it("renders the CSRF token in every form", async () => {
    const { AvailabilityView } = await import(
      "../app/(product)/me/_components/AvailabilityView"
    );
    const html = renderToString(
      <AvailabilityView
        csrfToken="csrf-secret-value"
        profileTimezone="UTC"
        bufferMinutes={0}
        bufferIsInvalid={false}
        timezoneRequired={false}
        saved={false}
        windowsByDay={{ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }}
        overrides={[]}
        previewLines={[]}
        errorCode={null}
        errorField={null}
        errorTarget={null}
        bufferError={null}
        addWindowAction={noopAction}
        removeWindowAction={noopAction}
        addOverrideAction={noopAction}
        removeOverrideAction={noopAction}
      />,
    );
    const matches = html.match(/name="_csrf" value="csrf-secret-value"/g);
    expect(matches?.length).toBeGreaterThanOrEqual(7);
  });
});
