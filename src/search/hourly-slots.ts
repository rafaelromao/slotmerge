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

  const minuteMs = 60 * 1000;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "2-digit",
    hour12: false,
  });
  const slots: Date[] = [];
  let currentMs = Math.ceil(rangeStart.getTime() / minuteMs) * minuteMs;
  const endMs = rangeEnd.getTime();

  while (currentMs < endMs) {
    const currentSlot = new Date(currentMs);
    const minute = Number(
      formatter
        .formatToParts(currentSlot)
        .find((part) => part.type === "minute")?.value ?? "0",
    );

    if (minute === 0) {
      slots.push(currentSlot);
    }

    currentMs += (minute === 0 ? 60 : 60 - minute) * minuteMs;
  }

  return slots;
}
