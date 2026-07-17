export function generateHourlySlots(
  rangeStart: Date,
  rangeEnd: Date,
  timezone?: string,
): Date[] {
  if (rangeStart >= rangeEnd) {
    return [];
  }

  if (!timezone) {
    const alignedStart = new Date(
      Math.floor(rangeStart.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000,
    );
    const slots: Date[] = [];
    let current = alignedStart.getTime();
    const endMs = rangeEnd.getTime();
    while (current < endMs) {
      slots.push(new Date(current));
      current += 60 * 60 * 1000;
    }
    return slots;
  }

  const slots: Date[] = [];
  let currentIST = floorToHourInTimezone(rangeStart, timezone);
  const endMs = rangeEnd.getTime();

  while (currentIST.getTime() < endMs) {
    if (currentIST.getTime() >= rangeStart.getTime()) {
      slots.push(currentIST);
    }
    currentIST = new Date(currentIST.getTime() + 60 * 60 * 1000);
  }

  return slots;
}

function floorToHourInTimezone(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  let hour = get("hour");
  const minute = get("minute");
  const day = get("day");
  const month = get("month");
  const year = get("year");

  if (minute > 0) {
    hour = hour - 1;
    if (hour < 0) {
      hour = 23;
    }
  }

  const flooredLocal = new Date(year, month - 1, day, hour, 0, 0, 0);
  return new Date(flooredLocal.getTime());
}
