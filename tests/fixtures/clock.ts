export function fixedClock(startDate: string): () => Date {
  let currentTime = new Date(startDate);
  return () => {
    const now = currentTime;
    currentTime = new Date(currentTime.getTime() + 1);
    return now;
  };
}

export function advanceClock(clock: () => Date, ms: number): void {
  const now = clock();
  const advanced = new Date(now.getTime() + ms);
  (clock as { _currentTime?: Date })._currentTime = advanced;
}
