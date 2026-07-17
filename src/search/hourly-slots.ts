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

  let hour = get("hour");
  const minute = get("minute");
  let day = get("day");
  const month = get("month");
  const year = get("year");

  if (minute > 0) {
    hour = hour - 1;
    if (hour < 0) {
      hour = 23;
      day -= 1;
    }
  }

  const naiveUtc = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  const utcHour = new Date(naiveUtc).getUTCHours();
  const utcMinute = new Date(naiveUtc).getUTCMinutes();
  const tzHour = hour;
  const tzMinute = 0;

  const offsetMinutes = (tzHour - utcHour) * 60 + (tzMinute - utcMinute);
  const offsetMs = offsetMinutes * 60000;

  return new Date(naiveUtc - offsetMs);
}
