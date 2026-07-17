import { describe, expect, it, vi } from "vitest";

import {
  googleCalendarProvider,
  listProviderCalendarsForProvider,
  microsoftCalendarProvider,
} from "./";

const ACCESS_TOKEN = "test-access-token";

describe("listProviderCalendarsForProvider", () => {
  it("returns Google synthetic primary calendar carrying isPrimary=true", async () => {
    const fetchImpl = vi.fn();
    const calendars = await listProviderCalendarsForProvider(
      googleCalendarProvider,
      ACCESS_TOKEN,
      fetchImpl,
    );

    expect(calendars).toEqual([
      { id: "primary", name: "Primary Calendar", isPrimary: true },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns Microsoft calendars shaped from Graph API response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            { id: "AAMkAD-primary=", name: "Calendar", isPrimaryCalendar: true },
            { id: "AAMkAD-second=", name: "Holidays", isPrimaryCalendar: false },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const calendars = await listProviderCalendarsForProvider(
      microsoftCalendarProvider,
      ACCESS_TOKEN,
      fetchImpl,
    );

    expect(calendars).toEqual([
      { id: "AAMkAD-primary=", name: "Calendar", isPrimary: true },
      { id: "AAMkAD-second=", name: "Holidays", isPrimary: false },
    ]);
  });

  it("throws when Microsoft Graph request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      listProviderCalendarsForProvider(
        microsoftCalendarProvider,
        ACCESS_TOKEN,
        fetchImpl,
      ),
    ).rejects.toThrow();
  });
});
