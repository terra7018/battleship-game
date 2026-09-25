import { EasyAi, HardAi, HuntTargetAi, Ai } from './ai';
import { Rng } from './board';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export const isDifficulty = (v: unknown): v is Difficulty =>
  v === 'easy' || v === 'normal' || v === 'hard';

export function createAi(difficulty: Difficulty, rng: Rng = Math.random): Ai {
  switch (difficulty) {
    case 'easy':
      return new EasyAi(rng);
    case 'normal':
      return new HuntTargetAi(rng);
    case 'hard':
      return new HardAi(rng);
  }
}
