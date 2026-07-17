export type RandomSource = {
  next(): number;
};

export function systemRandomSource(): RandomSource {
  return { next: () => Math.random() };
}
