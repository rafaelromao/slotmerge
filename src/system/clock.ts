export type Clock = {
  now(): Date;
};

export function systemClock(): Clock {
  if (process.env.APP_ENV === "local" || process.env.APP_ENV === "test") {
    const fixtureDate = process.env.FIXTURE_DATE;
    if (fixtureDate) {
      return fixedClock(fixtureDate);
    }
  }
  return { now: () => new Date() };
}

function fixedClock(startDate: string): Clock {
  let currentTime = new Date(startDate);
  return {
    now() {
      const now = currentTime;
      currentTime = new Date(currentTime.getTime() + 1);
      return now;
    },
  };
}
