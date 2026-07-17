export type ProviderCalendar = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export async function fetchMicrosoftProviderCalendars({
  accessToken,
  fetchImpl,
}: {
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<ProviderCalendar[]> {
  const response = await fetchImpl(
    "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isPrimaryCalendar",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Microsoft calendar listing failed.");
  }

  const data = (await response.json()) as {
    value?: Array<{
      id: string;
      name: string;
      isPrimaryCalendar?: boolean;
    }>;
  };

  return (data.value ?? []).map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    isPrimary: calendar.isPrimaryCalendar === true,
  }));
}

export const GOOGLE_PRIMARY_CALENDAR: ProviderCalendar = {
  id: "primary",
  name: "Primary Calendar",
  isPrimary: true,
};
