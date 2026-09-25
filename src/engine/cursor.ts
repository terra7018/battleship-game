import { SIZE, colOf, idx, inBounds, rowOf } from './types';

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const DELTA = new Map<string, readonly [number, number]>([
  ['ArrowUp', [-1, 0]],
  ['ArrowDown', [1, 0]],
  ['ArrowLeft', [0, -1]],
  ['ArrowRight', [0, 1]],
]);

export const isArrowKey = (key: string): key is ArrowKey =>
  DELTA.has(key) || key === 'Home' || key === 'End';

/** Cell reached from `from` by a navigation key; clamps at the grid edge. */
export function moveCursor(from: number, key: ArrowKey): number {
  const r = rowOf(from);
  if (key === 'Home') return idx(r, 0);
  if (key === 'End') return idx(r, SIZE - 1);
  const [dr, dc] = DELTA.get(key)!;
  const nr = r + dr;
  const nc = colOf(from) + dc;
  return inBounds(nr, nc) ? idx(nr, nc) : from;
}
