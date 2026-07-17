import { systemClock, type Clock } from "./clock";
import { systemRandomSource, type RandomSource } from "./random";

export type SystemDependencies = {
  clock: Clock;
  randomSource: RandomSource;
};

export function systemDependencies(): SystemDependencies {
  return {
    clock: systemClock(),
    randomSource: systemRandomSource(),
  };
}

export type { Clock, RandomSource };
export { systemClock, systemRandomSource };
