import { isSunk } from './board';
import { ShotEvent, Winner } from './game';
import { Board } from './types';

export interface SideStats {
  shots: number;
  hits: number;
  /** Hit percentage rounded to the nearest integer; 0 when no shots were fired. */
  accuracy: number;
}

export interface GameStats {
  player: SideStats;
  enemy: SideStats;
  /** Player ships that were not sunk. */
  shipsRemaining: number;
}

export interface PlayerRecord {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  /** Fewest shots taken to win, or null if no game has been won yet. */
  bestWinShots: number | null;
}

export const EMPTY_RECORD: PlayerRecord = {
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  bestWinShots: null,
};

export const accuracy = (shots: number, hits: number): number =>
  shots === 0 ? 0 : Math.round((hits / shots) * 100);

function sideStats(log: readonly ShotEvent[], by: ShotEvent['by']): SideStats {
  let shots = 0;
  let hits = 0;
  for (const ev of log) {
    if (ev.by !== by) continue;
    shots++;
    if (ev.result !== 'miss') hits++;
  }
  return { shots, hits, accuracy: accuracy(shots, hits) };
}

export function computeStats(log: readonly ShotEvent[], player: Board): GameStats {
  return {
    player: sideStats(log, 'player'),
    enemy: sideStats(log, 'ai'),
    shipsRemaining: player.ships.filter((s) => !isSunk(s)).length,
  };
}

/** Returns a new record with the finished game applied. */
export function updateRecord(rec: PlayerRecord, winner: Winner, playerShots: number): PlayerRecord {
  if (winner === 'player') {
    const streak = rec.streak + 1;
    return {
      wins: rec.wins + 1,
      losses: rec.losses,
      streak,
      bestStreak: Math.max(rec.bestStreak, streak),
      bestWinShots:
        rec.bestWinShots === null ? playerShots : Math.min(rec.bestWinShots, playerShots),
    };
  }
  if (winner === 'ai') return { ...rec, losses: rec.losses + 1, streak: 0 };
  return { ...rec };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Parses a stored record, falling back to EMPTY_RECORD for anything malformed. */
export function parseRecord(raw: string | null): PlayerRecord {
  if (!raw) return { ...EMPTY_RECORD };
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return { ...EMPTY_RECORD };
    const o = v as Record<string, unknown>;
    if (
      !isCount(o.wins) ||
      !isCount(o.losses) ||
      !isCount(o.streak) ||
      !isCount(o.bestStreak) ||
      !(o.bestWinShots === null || isCount(o.bestWinShots))
    ) {
      return { ...EMPTY_RECORD };
    }
    return {
      wins: o.wins,
      losses: o.losses,
      streak: o.streak,
      bestStreak: o.bestStreak,
      bestWinShots: o.bestWinShots as number | null,
    };
  } catch {
    return { ...EMPTY_RECORD };
  }
}

export function formatRecord(rec: PlayerRecord): string {
  const parts = [`Record: ${rec.wins}W–${rec.losses}L`, `Streak ${rec.streak}`];
  if (rec.bestStreak > 0) parts.push(`Best streak ${rec.bestStreak}`);
  if (rec.bestWinShots !== null) parts.push(`Best win ${rec.bestWinShots} shots`);
  return parts.join(' · ');
}

export function formatStats(s: GameStats): string {
  return (
    `You: ${s.player.shots} shots, ${s.player.hits} hits (${s.player.accuracy}%) · ` +
    `Enemy: ${s.enemy.shots} shots, ${s.enemy.hits} hits (${s.enemy.accuracy}%) · ` +
    `Ships left: ${s.shipsRemaining}`
  );
}
