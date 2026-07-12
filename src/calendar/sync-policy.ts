export function calculateCalendarSyncRetryDelay({
  attempt,
  now,
  random,
  retryAfter,
}: {
  attempt: number;
  now: Date;
  random: () => number;
  retryAfter?: string | null;
}): number {
  const parsedRetryAfter = parseRetryAfter(retryAfter, now);
  if (parsedRetryAfter !== null) {
    return parsedRetryAfter;
  }

  const baseDelayMs = 60_000;
  const maxDelayMs = 15 * 60_000;
  const exponent = Math.max(0, attempt - 1);
  const rawDelay = Math.min(baseDelayMs * 2 ** exponent, maxDelayMs);
  return Math.round(rawDelay * (1 + random() * 0.25));
}

function parseRetryAfter(
  retryAfter: string | null | undefined,
  now: Date,
): number | null {
  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const retryAt = new Date(retryAfter);
  if (Number.isNaN(retryAt.getTime())) {
    return null;
  }

  return Math.max(0, retryAt.getTime() - now.getTime());
}
