export const SIZE = 10;

export type Orientation = 'h' | 'v';

export interface ShipSpec {
  readonly name: string;
  readonly length: number;
}

export const FLEET: readonly ShipSpec[] = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
];

export interface Ship extends ShipSpec {
  id: number;
  readonly cells: readonly number[];
  hits: number;
}

export type ShotResult = 'miss' | 'hit' | 'sunk';

/** Per-cell shot record: undefined = untouched. */
export type ShotMark = 'miss' | 'hit';

export interface Board {
  /** cell index -> ship id, or -1 if water */
  readonly occupancy: Int8Array;
  readonly shots: (ShotMark | undefined)[];
  readonly ships: Ship[];
}

export const idx = (r: number, c: number): number => r * SIZE + c;
export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;
export const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < SIZE && c >= 0 && c < SIZE;
