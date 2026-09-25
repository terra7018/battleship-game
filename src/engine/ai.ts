import { Rng, isSunk } from './board';
import { Board, ShotResult, SIZE, colOf, idx, inBounds, rowOf } from './types';

/** Common contract for every AI opponent: pick a cell, then learn what happened there. */
export interface Ai {
  chooseTarget(board: Board): number;
  notify(board: Board, cell: number, result: ShotResult): void;
}

const openCells = (board: Board): number[] => {
  const out: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (board.shots[i] === undefined) out.push(i);
  return out;
};

const pickFrom = (rng: Rng, list: number[]): number => list[Math.floor(rng() * list.length)];

/** Hits on ships that are not yet sunk, in shot order. */
function dropSunk(hits: number[], board: Board, cell: number, result: ShotResult): number[] {
  if (result === 'miss') return hits;
  const next = [...hits, cell];
  if (result !== 'sunk') return next;
  const sunkCells = new Set(board.ships[board.occupancy[cell]].cells);
  return next.filter((h) => !sunkCells.has(h));
}

/**
 * Hunt/target AI.
 *  - Hunt: fire at random unshot cells on a checkerboard parity (every ship is
 *    >= 2 long, so parity cells are guaranteed to touch every ship).
 *  - Target: after a hit, probe orthogonal neighbours; once two hits line up,
 *    lock onto that axis and extend in both directions until the ship sinks.
 */
export class HuntTargetAi implements Ai {
  private hits: number[] = [];
  private readonly parity: number;

  constructor(private readonly rng: Rng = Math.random) {
    this.parity = rng() < 0.5 ? 0 : 1;
  }

  chooseTarget(board: Board): number {
    const candidates = this.targetCandidates(board);
    if (candidates.length > 0) return this.pick(candidates);

    const any = openCells(board);
    const parityCells = any.filter((i) => (rowOf(i) + colOf(i)) % 2 === this.parity);
    return this.pick(parityCells.length > 0 ? parityCells : any);
  }

  /** Feed back the outcome of the shot chosen by {@link chooseTarget}. */
  notify(board: Board, cell: number, result: ShotResult): void {
    this.hits = dropSunk(this.hits, board, cell, result);
  }

  private targetCandidates(board: Board): number[] {
    if (this.hits.length === 0) return [];
    const out = new Set<number>();
    const open = (r: number, c: number): boolean =>
      inBounds(r, c) && board.shots[idx(r, c)] === undefined;

    const hitSet = new Set(this.hits);
    const isHit = (r: number, c: number): boolean => inBounds(r, c) && hitSet.has(idx(r, c));
    const neighbours = (r: number, c: number): void => {
      for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (open(r + dr, c + dc)) out.add(idx(r + dr, c + dc));
      }
    };
    for (const h of this.hits) {
      const r = rowOf(h);
      const c = colOf(h);
      const horiz = isHit(r, c - 1) || isHit(r, c + 1);
      const vert = isHit(r - 1, c) || isHit(r + 1, c);

      if (horiz || vert) {
        // axis locked: walk to each end of the contiguous run
        const dirs = horiz ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (const [dr, dc] of dirs) {
          let rr = r + dr;
          let cc = c + dc;
          while (inBounds(rr, cc) && hitSet.has(idx(rr, cc))) {
            rr += dr;
            cc += dc;
          }
          if (open(rr, cc)) out.add(idx(rr, cc));
        }
      } else {
        neighbours(r, c);
      }
    }
    // Adjacent hits may belong to two different ships lying side by side; if the
    // assumed axis is exhausted, fall back to every open neighbour of every hit.
    if (out.size === 0) {
      for (const h of this.hits) neighbours(rowOf(h), colOf(h));
    }
    return [...out];
  }

  private pick(list: number[]): number {
    return pickFrom(this.rng, list);
  }
}

/**
 * Easy AI: hunts at random with no parity, and even with pending hits fires a
 * random open cell with probability {@link EasyAi.wanderChance}; otherwise it
 * probes an open orthogonal neighbour of a pending hit.
 */
export class EasyAi implements Ai {
  static readonly wanderChance = 0.4;
  private hits: number[] = [];

  constructor(private readonly rng: Rng = Math.random) {}

  chooseTarget(board: Board): number {
    const any = openCells(board);
    if (this.hits.length === 0 || this.rng() < EasyAi.wanderChance) return pickFrom(this.rng, any);
    const near = new Set<number>();
    for (const h of this.hits) {
      const r = rowOf(h);
      const c = colOf(h);
      for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (inBounds(r + dr, c + dc) && board.shots[idx(r + dr, c + dc)] === undefined) {
          near.add(idx(r + dr, c + dc));
        }
      }
    }
    return pickFrom(this.rng, near.size > 0 ? [...near] : any);
  }

  notify(board: Board, cell: number, result: ShotResult): void {
    this.hits = dropSunk(this.hits, board, cell, result);
  }
}

/**
 * Hard AI: probability-density hunting. For every un-sunk ship length, count
 * the placements consistent with the known misses and sunk ships; each open
 * cell scores the number of placements covering it. With pending hits only
 * placements that cover at least one pending hit count, and placements that
 * cover more pending hits weigh more. Fires at the highest-density cell.
 */
export class HardAi implements Ai {
  private hits: number[] = [];

  constructor(private readonly rng: Rng = Math.random) {}

  chooseTarget(board: Board): number {
    const density = this.densityMap(board);
    let best = -1;
    let bestCells: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (board.shots[i] !== undefined) continue;
      if (density[i] > best) {
        best = density[i];
        bestCells = [i];
      } else if (density[i] === best) {
        bestCells.push(i);
      }
    }
    return pickFrom(this.rng, bestCells);
  }

  notify(board: Board, cell: number, result: ShotResult): void {
    this.hits = dropSunk(this.hits, board, cell, result);
  }

  private densityMap(board: Board): number[] {
    const density = new Array<number>(SIZE * SIZE).fill(0);
    const pending = new Set(this.hits);
    // A placement may only cover water or pending (un-sunk) hits.
    const usable = (i: number): boolean =>
      board.shots[i] === undefined || (board.shots[i] === 'hit' && pending.has(i));
    const lengths = board.ships.filter((s) => !isSunk(s)).map((s) => s.length);

    for (const len of lengths) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const endR = r + dr * (len - 1);
            const endC = c + dc * (len - 1);
            if (!inBounds(endR, endC)) continue;
            let covered = 0;
            let ok = true;
            for (let k = 0; k < len; k++) {
              const i = idx(r + dr * k, c + dc * k);
              if (!usable(i)) {
                ok = false;
                break;
              }
              if (pending.has(i)) covered++;
            }
            if (!ok || (pending.size > 0 && covered === 0)) continue;
            const weight = 1 + covered * covered * SIZE;
            for (let k = 0; k < len; k++) {
              const i = idx(r + dr * k, c + dc * k);
              if (board.shots[i] === undefined) density[i] += weight;
            }
          }
        }
      }
    }
    return density;
  }
}
