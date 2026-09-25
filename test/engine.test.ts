import { describe, expect, it } from 'vitest';
import { HuntTargetAi } from '../src/engine/ai';
import {
  allSunk,
  canPlace,
  createBoard,
  fireAt,
  placeShip,
  randomFleet,
  removeShip,
  shipCells,
} from '../src/engine/board';
import { Game } from '../src/engine/game';
import { FLEET, SIZE, idx } from '../src/engine/types';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('placement', () => {
  it('rejects out-of-bounds ships', () => {
    expect(shipCells(0, 8, 3, 'h')).toBeNull();
    expect(shipCells(9, 0, 2, 'v')).toBeNull();
    expect(shipCells(0, 7, 3, 'h')).toEqual([7, 8, 9]);
  });

  it('rejects overlapping ships', () => {
    const b = createBoard();
    placeShip(b, FLEET[4], shipCells(0, 0, 2, 'h')!);
    expect(canPlace(b, shipCells(0, 1, 3, 'v'))).toBe(false);
    expect(canPlace(b, shipCells(1, 0, 3, 'h'))).toBe(true);
  });

  it('places the full fleet randomly without overlap', () => {
    for (let seed = 1; seed < 50; seed++) {
      const b = createBoard();
      randomFleet(b, seeded(seed));
      expect(b.ships).toHaveLength(FLEET.length);
      const occupied = Array.from(b.occupancy).filter((v) => v !== -1).length;
      expect(occupied).toBe(FLEET.reduce((n, s) => n + s.length, 0));
    }
  });

  it('removes ships and re-indexes remaining ones', () => {
    const b = createBoard();
    placeShip(b, FLEET[0], shipCells(0, 0, 5, 'h')!);
    placeShip(b, FLEET[4], shipCells(2, 0, 2, 'h')!);
    removeShip(b, 0);
    expect(b.ships).toHaveLength(1);
    expect(b.ships[0].id).toBe(0);
    expect(b.occupancy[idx(2, 0)]).toBe(0);
    expect(b.occupancy[idx(0, 0)]).toBe(-1);
  });
});

describe('firing', () => {
  it('reports miss, hit and sunk', () => {
    const b = createBoard();
    placeShip(b, FLEET[4], shipCells(0, 0, 2, 'h')!);
    expect(fireAt(b, idx(5, 5)).result).toBe('miss');
    expect(fireAt(b, idx(0, 0)).result).toBe('hit');
    expect(fireAt(b, idx(0, 1)).result).toBe('sunk');
    expect(allSunk(b)).toBe(true);
  });

  it('refuses to shoot the same cell twice', () => {
    const b = createBoard();
    fireAt(b, 0);
    expect(() => fireAt(b, 0)).toThrow();
  });
});

describe('AI', () => {
  it('never repeats a shot and always sinks the fleet', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rng = seeded(seed);
      const b = createBoard();
      randomFleet(b, rng);
      const ai = new HuntTargetAi(rng);
      let shots = 0;
      while (!allSunk(b)) {
        const cell = ai.chooseTarget(b);
        expect(b.shots[cell]).toBeUndefined();
        ai.notify(b, cell, fireAt(b, cell).result);
        shots++;
      }
      expect(shots).toBeLessThanOrEqual(SIZE * SIZE);
    }
  });

  it('is much better than random (avg shots to win under 70)', () => {
    let total = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const rng = seeded(seed * 7919);
      const b = createBoard();
      randomFleet(b, rng);
      const ai = new HuntTargetAi(rng);
      while (!allSunk(b)) {
        const cell = ai.chooseTarget(b);
        ai.notify(b, cell, fireAt(b, cell).result);
        total++;
      }
    }
    expect(total / runs).toBeLessThan(70);
  });

  it('keeps targeting when adjacent hits belong to two side-by-side vertical ships', () => {
    const b = createBoard();
    placeShip(b, FLEET[2], shipCells(4, 4, 3, 'v')!); // (4..6, 4)
    placeShip(b, FLEET[3], shipCells(4, 5, 3, 'v')!); // (4..6, 5)
    const ai = new HuntTargetAi(seeded(5));
    const shoot = (cell: number) => ai.notify(b, cell, fireAt(b, cell).result);
    shoot(idx(5, 4));
    shoot(idx(5, 5));
    // both horizontal extensions miss
    shoot(idx(5, 3));
    shoot(idx(5, 6));
    const next = ai.chooseTarget(b);
    expect([idx(4, 4), idx(6, 4), idx(4, 5), idx(6, 5)]).toContain(next);
  });

  it('follows up on a hit with an adjacent cell', () => {
    const b = createBoard();
    placeShip(b, FLEET[0], shipCells(5, 2, 5, 'h')!);
    const ai = new HuntTargetAi(seeded(3));
    ai.notify(b, idx(5, 4), fireAt(b, idx(5, 4)).result);
    const next = ai.chooseTarget(b);
    expect([idx(5, 3), idx(5, 5), idx(4, 4), idx(6, 4)]).toContain(next);
  });
});

describe('Game flow', () => {
  it('runs a complete game to a winner', () => {
    const rng = seeded(42);
    const g = new Game(rng);
    expect(() => g.start()).toThrow();
    randomFleet(g.player, rng);
    g.start();
    expect(g.phase).toBe('player-turn');
    let cell = 0;
    while (g.phase !== 'game-over') {
      while (g.enemy.shots[cell] !== undefined) cell++;
      g.playerFire(cell);
      if (g.phase === 'ai-turn') g.aiFire();
    }
    expect(['player', 'ai']).toContain(g.winner);
    expect(g.log.length).toBeGreaterThan(0);
  });

  it('enforces turn order', () => {
    const rng = seeded(1);
    const g = new Game(rng);
    randomFleet(g.player, rng);
    g.start();
    expect(() => g.aiFire()).toThrow();
    g.playerFire(0);
    expect(() => g.playerFire(1)).toThrow();
  });
});
