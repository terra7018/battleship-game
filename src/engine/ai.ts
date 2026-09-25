import { Rng } from './board';
import { Board, ShotResult, SIZE, colOf, idx, inBounds, rowOf } from './types';

/**
 * Hunt/target AI.
 *  - Hunt: fire at random unshot cells on a checkerboard parity (every ship is
 *    >= 2 long, so parity cells are guaranteed to touch every ship).
 *  - Target: after a hit, probe orthogonal neighbours; once two hits line up,
 *    lock onto that axis and extend in both directions until the ship sinks.
 */
export class HuntTargetAi {
  private hits: number[] = [];
  private readonly parity: number;

  constructor(private readonly rng: Rng = Math.random) {
    this.parity = rng() < 0.5 ? 0 : 1;
  }

  chooseTarget(board: Board): number {
    const candidates = this.targetCandidates(board);
    if (candidates.length > 0) return this.pick(candidates);

    const parityCells: number[] = [];
    const any: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (board.shots[i] !== undefined) continue;
      any.push(i);
      if ((rowOf(i) + colOf(i)) % 2 === this.parity) parityCells.push(i);
    }
    return this.pick(parityCells.length > 0 ? parityCells : any);
  }

  /** Feed back the outcome of the shot chosen by {@link chooseTarget}. */
  notify(board: Board, cell: number, result: ShotResult): void {
    if (result === 'miss') return;
    this.hits.push(cell);
    if (result === 'sunk') {
      const sunkCells = new Set(board.ships[board.occupancy[cell]].cells);
      this.hits = this.hits.filter((h) => !sunkCells.has(h));
    }
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
    return list[Math.floor(this.rng() * list.length)];
  }
}
