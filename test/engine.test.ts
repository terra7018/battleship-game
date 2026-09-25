import { describe, expect, it } from 'vitest';
import { Ai, EasyAi, HardAi, HuntTargetAi } from '../src/engine/ai';
import {
  allSunk,
  canPlace,
  createBoard,
  fireAt,
  placeShip,
  canMove,
  moveShip,
  randomFleet,
  randomFleetRemaining,
  removeShip,
  shipCells,
} from '../src/engine/board';
import { isArrowKey, moveCursor } from '../src/engine/cursor';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LABELS,
  Difficulty,
  createAi,
  isDifficulty,
} from '../src/engine/difficulty';
import { Game, ShotEvent, lastShotBy } from '../src/engine/game';
import {
  EMPTY_RECORD,
  accuracy,
  computeStats,
  formatRecord,
  formatStats,
  parseRecord,
  updateRecord,
} from '../src/engine/stats';
import { DEFAULT_PACE, PACE_RANGES, aiDelayMs, isAiPace } from '../src/engine/pace';
import { SOUNDS, outcomeSound, parseMuted, shotSound, soundDuration } from '../src/engine/sound';
import { FLEET, SIZE, colOf, idx, rowOf } from '../src/engine/types';

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

  it('randomizes only the remaining ships, keeping placed ones', () => {
    for (let seed = 1; seed < 30; seed++) {
      const b = createBoard();
      const carrier = shipCells(0, 0, 5, 'h')!;
      const battleship = shipCells(9, 6, 4, 'h')!;
      placeShip(b, FLEET[0], carrier);
      placeShip(b, FLEET[1], battleship);
      randomFleetRemaining(b, seeded(seed));
      expect(b.ships).toHaveLength(FLEET.length);
      expect(b.ships[0].cells).toEqual(carrier);
      expect(b.ships[1].cells).toEqual(battleship);
      b.ships.forEach((s, k) => {
        expect(s.id).toBe(k);
        expect(s.name).toBe(FLEET[k].name);
        for (const i of s.cells) expect(b.occupancy[i]).toBe(k);
      });
      const occupied = Array.from(b.occupancy).filter((v) => v !== -1).length;
      expect(occupied).toBe(FLEET.reduce((n, s) => n + s.length, 0));
    }
  });

  it('randomizing remaining on a full board is a no-op', () => {
    const b = createBoard();
    randomFleet(b, seeded(3));
    const before = b.ships.map((s) => [...s.cells]);
    randomFleetRemaining(b, seeded(4));
    expect(b.ships.map((s) => [...s.cells])).toEqual(before);
  });

  it('randomFleetRemaining fills by identity when ships were placed out of fleet order', () => {
    const b = createBoard();
    const destroyer = shipCells(0, 0, 2, 'h')!;
    placeShip(b, FLEET[4], destroyer);
    randomFleetRemaining(b, seeded(5));
    expect(b.ships[0].cells).toEqual(destroyer);
    expect(b.ships.map((s) => s.name).sort()).toEqual(FLEET.map((s) => s.name).sort());
  });

  it('randomFleetRemaining consumes one fleet entry per placed ship for duplicate names', () => {
    const b = createBoard();
    const fleet = [
      { name: 'Patrol', length: 2 },
      { name: 'Patrol', length: 2 },
    ];
    placeShip(b, fleet[0], shipCells(0, 0, 2, 'h')!);
    randomFleetRemaining(b, seeded(6), fleet);
    expect(b.ships).toHaveLength(2);
    expect(b.ships.map((s) => s.name)).toEqual(['Patrol', 'Patrol']);
  });

  it('moves a ship, keeping its id and freeing its old cells', () => {
    const b = createBoard();
    placeShip(b, FLEET[0], shipCells(0, 0, 5, 'h')!);
    placeShip(b, FLEET[4], shipCells(2, 0, 2, 'h')!);
    // overlapping its own cells is fine; overlapping another ship is not
    expect(canMove(b, 0, shipCells(0, 2, 5, 'h'))).toBe(true);
    expect(canMove(b, 0, shipCells(0, 0, 5, 'v'))).toBe(false);
    expect(canMove(b, 0, null)).toBe(false);
    expect(canMove(b, 7, shipCells(5, 0, 5, 'h'))).toBe(false);
    // cell count must match the ship's length
    expect(canMove(b, 0, [])).toBe(false);
    expect(canMove(b, 0, shipCells(5, 0, 4, 'h'))).toBe(false);
    expect(moveShip(b, 0, [])).toBe(false);
    expect(moveShip(b, 0, shipCells(0, 0, 5, 'v')!)).toBe(false);
    expect(b.ships[0].cells).toEqual(shipCells(0, 0, 5, 'h'));

    expect(moveShip(b, 0, shipCells(5, 1, 5, 'v')!)).toBe(true);
    expect(b.ships).toHaveLength(2);
    expect(b.ships[0].id).toBe(0);
    expect(b.ships[0].name).toBe('Carrier');
    expect(b.ships[0].cells).toEqual(shipCells(5, 1, 5, 'v'));
    expect(b.ships[1].id).toBe(1);
    expect(b.occupancy[idx(0, 0)]).toBe(-1);
    expect(b.occupancy[idx(0, 4)]).toBe(-1);
    expect(b.occupancy[idx(5, 1)]).toBe(0);
    expect(b.occupancy[idx(9, 1)]).toBe(0);
    expect(b.occupancy[idx(2, 0)]).toBe(1);
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

describe('AI difficulty', () => {
  const LEVELS: Difficulty[] = ['easy', 'normal', 'hard'];

  /** Plays `ai` against a fresh random fleet; returns shots used. Fails on a repeated cell. */
  function playOut(ai: Ai, rng: () => number): number {
    const b = createBoard();
    randomFleet(b, rng);
    let shots = 0;
    while (!allSunk(b)) {
      const cell = ai.chooseTarget(b);
      expect(b.shots[cell]).toBeUndefined();
      ai.notify(b, cell, fireAt(b, cell).result);
      shots++;
    }
    return shots;
  }

  function average(level: Difficulty, runs: number): number {
    let total = 0;
    for (let seed = 1; seed <= runs; seed++) {
      const rng = seeded(seed * 104729);
      total += playOut(createAi(level, rng), rng);
    }
    return total / runs;
  }

  it('creates the matching AI for each level, defaulting to Normal', () => {
    expect(DEFAULT_DIFFICULTY).toBe('normal');
    expect(createAi('easy', seeded(1))).toBeInstanceOf(EasyAi);
    expect(createAi('normal', seeded(1))).toBeInstanceOf(HuntTargetAi);
    expect(createAi('hard', seeded(1))).toBeInstanceOf(HardAi);
    expect(DIFFICULTY_LABELS.hard).toBe('Hard');
  });

  it('validates persisted values', () => {
    for (const l of LEVELS) expect(isDifficulty(l)).toBe(true);
    expect(isDifficulty('insane')).toBe(false);
    expect(isDifficulty(null)).toBe(false);
  });

  it.each(LEVELS)('%s sinks a random fleet in <= 100 shots without repeating a cell', (level) => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed * 31 + 7);
      expect(playOut(createAi(level, rng), rng)).toBeLessThanOrEqual(SIZE * SIZE);
    }
  });

  it('orders average shots to win: Hard < Normal < Easy', () => {
    const runs = 150;
    const easy = average('easy', runs);
    const normal = average('normal', runs);
    const hard = average('hard', runs);
    expect(hard).toBeLessThan(normal);
    expect(easy).toBeGreaterThan(normal);
  });

  it('Hard restricts to placements covering pending hits', () => {
    const b = createBoard();
    placeShip(b, FLEET[0], shipCells(5, 2, 5, 'h')!);
    const ai = new HardAi(seeded(9));
    ai.notify(b, idx(5, 4), fireAt(b, idx(5, 4)).result);
    expect([idx(5, 3), idx(5, 5), idx(4, 4), idx(6, 4)]).toContain(ai.chooseTarget(b));
    ai.notify(b, idx(5, 5), fireAt(b, idx(5, 5)).result);
    expect([idx(5, 3), idx(5, 6)]).toContain(ai.chooseTarget(b));
  });

  it('Hard opens on a central cell where the most placements overlap', () => {
    const b = createBoard();
    randomFleet(b, seeded(2));
    const first = new HardAi(seeded(1)).chooseTarget(b);
    const r = rowOf(first);
    const c = colOf(first);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThanOrEqual(6);
    expect(c).toBeGreaterThanOrEqual(3);
    expect(c).toBeLessThanOrEqual(6);
  });

  it('Easy sometimes wanders even with a pending hit', () => {
    const b = createBoard();
    placeShip(b, FLEET[0], shipCells(5, 2, 5, 'h')!);
    const ai = new EasyAi(() => 0); // below wanderChance, picks the first open cell
    ai.notify(b, idx(5, 4), fireAt(b, idx(5, 4)).result);
    expect(ai.chooseTarget(b)).toBe(0);
    const focused = new EasyAi(() => 0.5); // above wanderChance, probes a neighbour
    focused.notify(b, idx(5, 4), 'hit');
    expect([idx(5, 3), idx(5, 5), idx(4, 4), idx(6, 4)]).toContain(focused.chooseTarget(b));
  });

  it('Game accepts a difficulty and only allows changing it during placement', () => {
    const g = new Game(seeded(3), 'hard');
    expect(g.difficulty).toBe('hard');
    g.setDifficulty('easy');
    expect(g.difficulty).toBe('easy');
    randomFleet(g.player, seeded(3));
    g.start();
    expect(() => g.setDifficulty('normal')).toThrow();
    expect(new Game(seeded(1)).difficulty).toBe('normal');
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

  it('finds the latest shot per side', () => {
    const ev = (by: ShotEvent['by'], cell: number): ShotEvent => ({ by, cell, result: 'miss', ship: null });
    expect(lastShotBy([], 'player')).toBeNull();
    const log = [ev('player', 3), ev('ai', 7), ev('player', 12)];
    expect(lastShotBy(log, 'player')?.cell).toBe(12);
    expect(lastShotBy(log, 'ai')?.cell).toBe(7);
    expect(lastShotBy([ev('player', 3)], 'ai')).toBeNull();
  });
});

describe('keyboard cursor', () => {
  it('moves one cell per arrow key', () => {
    const start = idx(4, 4);
    expect(moveCursor(start, 'ArrowUp')).toBe(idx(3, 4));
    expect(moveCursor(start, 'ArrowDown')).toBe(idx(5, 4));
    expect(moveCursor(start, 'ArrowLeft')).toBe(idx(4, 3));
    expect(moveCursor(start, 'ArrowRight')).toBe(idx(4, 5));
  });

  it('clamps at the grid edges instead of wrapping', () => {
    expect(moveCursor(idx(0, 0), 'ArrowUp')).toBe(idx(0, 0));
    expect(moveCursor(idx(0, 0), 'ArrowLeft')).toBe(idx(0, 0));
    expect(moveCursor(idx(9, 9), 'ArrowDown')).toBe(idx(9, 9));
    expect(moveCursor(idx(9, 9), 'ArrowRight')).toBe(idx(9, 9));
    expect(moveCursor(idx(3, 9), 'ArrowRight')).toBe(idx(3, 9));
  });

  it('Home/End jump to the row ends', () => {
    expect(moveCursor(idx(6, 4), 'Home')).toBe(idx(6, 0));
    expect(moveCursor(idx(6, 4), 'End')).toBe(idx(6, SIZE - 1));
  });

  it('recognises only navigation keys', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(isArrowKey(k)).toBe(true);
    }
    expect(isArrowKey('Enter')).toBe(false);
    expect(isArrowKey('toString')).toBe(false);
  });
});

describe('ai pace', () => {
  it('defaults to human-like', () => {
    expect(DEFAULT_PACE).toBe('human');
    expect(PACE_RANGES.human).toEqual({ min: 3000, max: 10000 });
  });

  it('quick delays are well under a second', () => {
    expect(aiDelayMs('quick', () => 0)).toBe(500);
    expect(aiDelayMs('quick', () => 0.999)).toBeLessThan(1000);
    expect(aiDelayMs('human', () => 0)).toBe(3000);
    expect(aiDelayMs('human', () => 1)).toBe(10000);
  });

  it('validates persisted values', () => {
    expect(isAiPace('human')).toBe(true);
    expect(isAiPace('quick')).toBe(true);
    expect(isAiPace(null)).toBe(false);
    expect(isAiPace('fast')).toBe(false);
  });
});

describe('sound', () => {
  const ev = (result: ShotEvent['result']): ShotEvent => ({ by: 'player', cell: 0, result, ship: null });

  it('maps each shot result to its own sound', () => {
    expect(shotSound(ev('miss'))).toBe('miss');
    expect(shotSound(ev('hit'))).toBe('hit');
    expect(shotSound(ev('sunk'))).toBe('sunk');
  });

  it('plays a fanfare only once the game has a winner', () => {
    expect(outcomeSound(null)).toBeNull();
    expect(outcomeSound('player')).toBe('victory');
    expect(outcomeSound('ai')).toBe('defeat');
  });

  it('keeps every recipe short and well-formed', () => {
    for (const [name, tones] of Object.entries(SOUNDS)) {
      expect(tones.length).toBeGreaterThan(0);
      for (const t of tones) {
        expect(t.freq).toBeGreaterThan(0);
        expect(t.to).toBeGreaterThan(0);
        expect(t.duration).toBeGreaterThan(0);
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.5);
      }
      expect(soundDuration(name as keyof typeof SOUNDS)).toBeLessThanOrEqual(1.5);
    }
    expect(soundDuration('victory')).toBeCloseTo(0.98);
  });

  it('defaults to sound on unless explicitly muted', () => {
    expect(parseMuted(null)).toBe(false);
    expect(parseMuted('')).toBe(false);
    expect(parseMuted('false')).toBe(false);
    expect(parseMuted('garbage')).toBe(false);
    expect(parseMuted('true')).toBe(true);
  });
});

describe('stats', () => {
  const ev = (by: 'player' | 'ai', result: 'miss' | 'hit' | 'sunk'): ShotEvent => ({
    by,
    cell: 0,
    result,
    ship: null,
  });

  it('computes shots, hits and rounded accuracy per side', () => {
    const board = createBoard();
    placeShip(board, FLEET[4], shipCells(0, 0, 2, 'h')!);
    placeShip(board, FLEET[3], shipCells(2, 0, 3, 'h')!);
    fireAt(board, 0);
    fireAt(board, 1);
    const log = [ev('player', 'miss'), ev('ai', 'hit'), ev('player', 'hit'), ev('player', 'sunk')];
    const s = computeStats(log, board);
    expect(s.player).toEqual({ shots: 3, hits: 2, accuracy: 67 });
    expect(s.enemy).toEqual({ shots: 1, hits: 1, accuracy: 100 });
    expect(s.shipsRemaining).toBe(1);
  });

  it('reports zero accuracy with no shots', () => {
    expect(accuracy(0, 0)).toBe(0);
    expect(computeStats([], createBoard()).player).toEqual({ shots: 0, hits: 0, accuracy: 0 });
  });

  it('tracks wins, losses, streaks and best win', () => {
    let r = updateRecord(EMPTY_RECORD, 'player', 50);
    expect(r).toEqual({ wins: 1, losses: 0, streak: 1, bestStreak: 1, bestWinShots: 50 });
    r = updateRecord(r, 'player', 41);
    expect(r).toEqual({ wins: 2, losses: 0, streak: 2, bestStreak: 2, bestWinShots: 41 });
    r = updateRecord(r, 'ai', 60);
    expect(r).toEqual({ wins: 2, losses: 1, streak: 0, bestStreak: 2, bestWinShots: 41 });
    r = updateRecord(r, 'player', 55);
    expect(r).toEqual({ wins: 3, losses: 1, streak: 1, bestStreak: 2, bestWinShots: 41 });
    expect(updateRecord(r, null, 1)).toEqual(r);
    expect(EMPTY_RECORD.wins).toBe(0);
  });

  it('round-trips through JSON and rejects malformed data', () => {
    const r = updateRecord(EMPTY_RECORD, 'player', 41);
    expect(parseRecord(JSON.stringify(r))).toEqual(r);
    expect(parseRecord(null)).toEqual(EMPTY_RECORD);
    expect(parseRecord('not json')).toEqual(EMPTY_RECORD);
    expect(parseRecord('{"wins":-1}')).toEqual(EMPTY_RECORD);
    expect(parseRecord('{"wins":"3","losses":0,"streak":0,"bestStreak":0,"bestWinShots":null}')).toEqual(
      EMPTY_RECORD,
    );
    expect(parseRecord('[]')).toEqual(EMPTY_RECORD);
  });

  it('formats the record and stats lines', () => {
    expect(formatRecord(EMPTY_RECORD)).toBe('Record: 0W–0L · Streak 0');
    const r = { wins: 3, losses: 2, streak: 2, bestStreak: 2, bestWinShots: 41 };
    expect(formatRecord(r)).toBe('Record: 3W–2L · Streak 2 · Best streak 2 · Best win 41 shots');
    const s = computeStats([ev('player', 'hit'), ev('ai', 'miss')], createBoard());
    expect(formatStats(s)).toBe(
      'You: 1 shots, 1 hits (100%) · Enemy: 1 shots, 0 hits (0%) · Ships left: 0',
    );
  });
});
