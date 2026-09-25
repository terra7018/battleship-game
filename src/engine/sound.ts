import { ShotEvent, Winner } from './game';

export type SoundName = 'miss' | 'hit' | 'sunk' | 'victory' | 'defeat';
export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** One synthesized note: an oscillator ramped from `freq` to `to` over `duration` seconds. */
export interface Tone {
  readonly type: Wave;
  readonly freq: number;
  readonly to: number;
  /** Seconds after the sound starts. */
  readonly at: number;
  readonly duration: number;
  readonly gain: number;
}

const tone = (
  type: Wave,
  freq: number,
  to: number,
  at: number,
  duration: number,
  gain = 0.25,
): Tone => ({ type, freq, to, at, duration, gain });

/** Short, distinct recipes; frequencies in Hz, times in seconds. */
export const SOUNDS: Record<SoundName, readonly Tone[]> = {
  miss: [tone('sine', 520, 180, 0, 0.25, 0.18)],
  hit: [tone('square', 140, 60, 0, 0.18, 0.3), tone('sawtooth', 900, 300, 0, 0.08, 0.15)],
  sunk: [
    tone('sawtooth', 220, 40, 0, 0.6, 0.35),
    tone('square', 110, 30, 0.05, 0.7, 0.3),
    tone('triangle', 660, 220, 0, 0.3, 0.15),
  ],
  victory: [
    tone('triangle', 523, 523, 0, 0.16),
    tone('triangle', 659, 659, 0.16, 0.16),
    tone('triangle', 784, 784, 0.32, 0.16),
    tone('triangle', 1047, 1047, 0.48, 0.5),
  ],
  defeat: [
    tone('sawtooth', 330, 330, 0, 0.22, 0.2),
    tone('sawtooth', 294, 294, 0.22, 0.22, 0.2),
    tone('sawtooth', 262, 262, 0.44, 0.22, 0.2),
    tone('sawtooth', 196, 150, 0.66, 0.7, 0.2),
  ],
};

/** Total length of a recipe in seconds. */
export const soundDuration = (name: SoundName): number =>
  SOUNDS[name].reduce((m, t) => Math.max(m, t.at + t.duration), 0);

/** Sound for a shot's own result (both sides fire the same sounds). */
export const shotSound = (ev: ShotEvent): SoundName => ev.result;

/** Fanfare for the finished game, or null while it is still running. */
export function outcomeSound(winner: Winner): SoundName | null {
  if (!winner) return null;
  return winner === 'player' ? 'victory' : 'defeat';
}

/** Parses the persisted mute flag; anything other than the literal "true" means sound on. */
export const parseMuted = (v: string | null): boolean => v === 'true';
