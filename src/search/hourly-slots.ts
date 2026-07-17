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
  let currentSlot = floorToHourInTimezone(rangeStart, timezone);
  const endMs = rangeEnd.getTime();

  while (currentSlot.getTime() < endMs) {
    if (currentSlot.getTime() >= rangeStart.getTime()) {
      slots.push(currentSlot);
    }
    currentSlot = new Date(currentSlot.getTime() + 60 * 60 * 1000);
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

  const originalHour = get("hour");
  const minute = get("minute");
  let day = get("day");
  let month = get("month");
  let year = get("year");

  let hour = originalHour;
  if (minute > 0) {
    hour = originalHour - 1;
    if (hour < 0) {
      hour = 23;
      day = day - 1;
      if (day < 1) {
        month = month - 1;
        if (month < 1) {
          month = 12;
          year = year - 1;
        }
        day = new Date(year, month, 0).getDate();
      }
    }
  }

  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const originalUtcMinutes = utcHour * 60 + utcMinute;

  let flooredUtcMinutes: number;
  if (minute === 0) {
    flooredUtcMinutes = originalUtcMinutes;
  } else if (originalHour === 0) {
    flooredUtcMinutes = originalUtcMinutes - minute - 60;
  } else {
    flooredUtcMinutes = originalUtcMinutes - minute;
  }

  const baseDate = new Date(date.getTime());
  baseDate.setUTCHours(0, 0, 0, 0);
  return new Date(baseDate.getTime() + flooredUtcMinutes * 60000);
}
