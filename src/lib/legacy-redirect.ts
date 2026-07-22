export type LegacyRedirectArgs = {
  target: string;
  sunset: Date;
};

const HTTP_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "GMT",
});

export function legacyRedirect({ target, sunset }: LegacyRedirectArgs): Response {
  return new Response(null, {
    status: 308,
    headers: {
      Location: target,
      Deprecation: "true",
      Sunset: formatHttpDate(sunset),
      Link: `<${target}>; rel="successor-version"`,
    },
  });
}

function formatHttpDate(date: Date): string {
  const parts = HTTP_DATE_FORMATTER.formatToParts(date);
  const lookup = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = lookup("weekday");
  const day = lookup("day");
  const month = lookup("month");
  const year = lookup("year");
  const hour = lookup("hour");
  const minute = lookup("minute");
  const second = lookup("second");
  return `${weekday}, ${day} ${month} ${year} ${hour}:${minute}:${second} GMT`;
}
