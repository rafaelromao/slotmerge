export function generateHourlySlots(
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  if (rangeStart >= rangeEnd) {
    return [];
  }

  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  const alignedStart = new Date(
    Math.floor(startMs / (60 * 60 * 1000)) * 60 * 60 * 1000,
  );

  const slots: Date[] = [];
  let current = alignedStart.getTime();

  while (current < endMs) {
    slots.push(new Date(current));
    current += 60 * 60 * 1000;
  }

  return slots;
}
