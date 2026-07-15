export function fixedClock(startDate: string): () => Date {
  let currentTime = new Date(startDate);
  return () => {
    const now = currentTime;
    currentTime = new Date(currentTime.getTime() + 1);
    return now;
  };
}
