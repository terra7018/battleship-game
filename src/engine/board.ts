import {
  Board,
  FLEET,
  Orientation,
  Ship,
  ShipSpec,
  ShotResult,
  SIZE,
  idx,
  inBounds,
} from './types';

export type Rng = () => number;

export function createBoard(): Board {
  return {
    occupancy: new Int8Array(SIZE * SIZE).fill(-1),
    shots: new Array<undefined>(SIZE * SIZE).fill(undefined),
    ships: [],
  };
}

export function shipCells(
  r: number,
  c: number,
  length: number,
  o: Orientation,
): number[] | null {
  const cells: number[] = [];
  for (let k = 0; k < length; k++) {
    const rr = o === 'v' ? r + k : r;
    const cc = o === 'h' ? c + k : c;
    if (!inBounds(rr, cc)) return null;
    cells.push(idx(rr, cc));
  }
  return cells;
}

/** Like {@link shipCells} but keeps the in-bounds portion of a ship that overflows the grid. */
export function shipCellsClamped(
  r: number,
  c: number,
  length: number,
  o: Orientation,
): number[] {
  const cells: number[] = [];
  for (let k = 0; k < length; k++) {
    const rr = o === 'v' ? r + k : r;
    const cc = o === 'h' ? c + k : c;
    if (inBounds(rr, cc)) cells.push(idx(rr, cc));
  }
  return cells;
}

export function canPlace(board: Board, cells: readonly number[] | null): boolean {
  if (!cells) return false;
  return cells.every((i) => board.occupancy[i] === -1);
}

export function placeShip(board: Board, spec: ShipSpec, cells: readonly number[]): Ship {
  if (!canPlace(board, cells)) throw new Error(`Cannot place ${spec.name}`);
  const ship: Ship = { ...spec, id: board.ships.length, cells, hits: 0 };
  for (const i of cells) board.occupancy[i] = ship.id;
  board.ships.push(ship);
  return ship;
}

export function removeShip(board: Board, shipId: number): void {
  const ship = board.ships[shipId];
  if (!ship) return;
  for (const i of ship.cells) board.occupancy[i] = -1;
  board.ships.splice(shipId, 1);
  board.ships.forEach((s, id) => {
    (s as { id: number }).id = id;
    for (const i of s.cells) board.occupancy[i] = id;
  });
}

export function randomFleet(board: Board, rng: Rng = Math.random, fleet = FLEET): void {
  for (const spec of fleet) {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 10_000) throw new Error('Could not place fleet');
      const o: Orientation = rng() < 0.5 ? 'h' : 'v';
      const r = Math.floor(rng() * SIZE);
      const c = Math.floor(rng() * SIZE);
      const cells = shipCells(r, c, spec.length, o);
      if (canPlace(board, cells)) {
        placeShip(board, spec, cells!);
        break;
      }
    }
  }
}

export function fireAt(board: Board, i: number): { result: ShotResult; ship: Ship | null } {
  if (board.shots[i] !== undefined) throw new Error('Cell already shot');
  const shipId = board.occupancy[i];
  if (shipId === -1) {
    board.shots[i] = 'miss';
    return { result: 'miss', ship: null };
  }
  board.shots[i] = 'hit';
  const ship = board.ships[shipId];
  ship.hits++;
  return { result: ship.hits === ship.length ? 'sunk' : 'hit', ship };
}

export const isSunk = (s: Ship): boolean => s.hits >= s.length;
export const allSunk = (board: Board): boolean =>
  board.ships.length > 0 && board.ships.every(isSunk);
