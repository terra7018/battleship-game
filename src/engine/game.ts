import { HuntTargetAi } from './ai';
import { Rng, allSunk, createBoard, fireAt, randomFleet } from './board';
import { Board, FLEET, Ship, ShotResult } from './types';

export type Phase = 'placement' | 'player-turn' | 'ai-turn' | 'game-over';
export type Winner = 'player' | 'ai' | null;

export interface ShotEvent {
  by: 'player' | 'ai';
  cell: number;
  result: ShotResult;
  ship: Ship | null;
}

/** Most recent shot fired by `by`, or null if they have not fired yet. */
export function lastShotBy(log: readonly ShotEvent[], by: ShotEvent['by']): ShotEvent | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].by === by) return log[i];
  }
  return null;
}

export class Game {
  phase: Phase = 'placement';
  winner: Winner = null;
  readonly player: Board = createBoard();
  readonly enemy: Board = createBoard();
  readonly log: ShotEvent[] = [];
  private readonly ai: HuntTargetAi;

  constructor(rng: Rng = Math.random) {
    this.ai = new HuntTargetAi(rng);
    randomFleet(this.enemy, rng);
  }

  get fleetComplete(): boolean {
    return this.player.ships.length === FLEET.length;
  }

  /** Next ship the player still has to place, if any. */
  get nextShip() {
    return FLEET[this.player.ships.length];
  }

  start(): void {
    if (this.phase !== 'placement') throw new Error('Game already started');
    if (!this.fleetComplete) throw new Error('Place all ships first');
    this.phase = 'player-turn';
  }

  playerFire(cell: number): ShotEvent {
    if (this.phase !== 'player-turn') throw new Error('Not your turn');
    const { result, ship } = fireAt(this.enemy, cell);
    const ev: ShotEvent = { by: 'player', cell, result, ship };
    this.log.push(ev);
    if (allSunk(this.enemy)) this.finish('player');
    else this.phase = 'ai-turn';
    return ev;
  }

  aiFire(): ShotEvent {
    if (this.phase !== 'ai-turn') throw new Error('Not AI turn');
    const cell = this.ai.chooseTarget(this.player);
    const { result, ship } = fireAt(this.player, cell);
    this.ai.notify(this.player, cell, result);
    const ev: ShotEvent = { by: 'ai', cell, result, ship };
    this.log.push(ev);
    if (allSunk(this.player)) this.finish('ai');
    else this.phase = 'player-turn';
    return ev;
  }

  private finish(winner: Winner): void {
    this.phase = 'game-over';
    this.winner = winner;
  }
}
