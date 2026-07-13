export type TestClock = {
  now(): Date;
  advance(ms: number): void;
  reset(date?: Date): void;
};

export function buildTestClock(startTime?: Date): TestClock {
  let _now: Date = startTime ?? new Date();

  return {
    now(): Date {
      return _now;
    },
    advance(ms: number): void {
      _now = new Date(_now.getTime() + ms);
    },
    reset(date?: Date): void {
      _now = date ?? new Date();
    },
  };
}
