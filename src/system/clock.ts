export type Clock = {
  now(): Date;
};

export function systemClock(): Clock {
  if (process.env.APP_ENV === "local" || process.env.APP_ENV === "test") {
    const fixtureDate = process.env.FIXTURE_DATE;
    if (fixtureDate) {
      const fixedDate = new Date(fixtureDate);
      return { now: () => fixedDate };
    }
  }
  return { now: () => new Date() };
}
