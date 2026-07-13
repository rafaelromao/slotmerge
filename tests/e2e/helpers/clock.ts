/**
 * Global clock for E2E tests.
 * Advanced synchronously (no sleeping) via advance().
 * All services that accept `clock?: () => Date` receive TestClock.now.
 */

export class TestClock {
  private static _date: Date = new Date("2024-06-01T00:00:00Z");

  static now(): Date {
    return new Date(this._date);
  }

  static advance(hours: number): void {
    this._date = new Date(this._date.getTime() + hours * 60 * 60 * 1000);
  }

  static reset(): void {
    this._date = new Date("2024-06-01T00:00:00Z");
  }

  static set(date: Date): void {
    this._date = new Date(date);
  }

  static setISO(isoString: string): void {
    this._date = new Date(isoString);
  }
}
