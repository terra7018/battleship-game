export type AiPace = 'human' | 'quick';

export const DEFAULT_PACE: AiPace = 'human';

export const PACE_RANGES: Record<AiPace, { readonly min: number; readonly max: number }> = {
  human: { min: 3000, max: 10000 },
  quick: { min: 500, max: 1000 },
};

export const isAiPace = (v: unknown): v is AiPace => v === 'human' || v === 'quick';

/** Random AI thinking delay (ms) in the range for `pace`. */
export function aiDelayMs(pace: AiPace, rand: () => number = Math.random): number {
  const { min, max } = PACE_RANGES[pace];
  return min + rand() * (max - min);
}
