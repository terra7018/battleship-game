import {
  canPlace,
  isSunk,
  placeShip,
  randomFleet,
  removeShip,
  shipCells,
  shipCellsClamped,
} from './engine/board';
import { Game, Phase, ShotEvent } from './engine/game';
import { Board, FLEET, Orientation, SIZE, colOf, rowOf } from './engine/types';

const AI_DELAY_MIN_MS = 3000;
const AI_DELAY_MAX_MS = 10000;

const aiDelayMs = (): number =>
  AI_DELAY_MIN_MS + Math.random() * (AI_DELAY_MAX_MS - AI_DELAY_MIN_MS);

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const playerBoardEl = $('player-board');
const enemyBoardEl = $('enemy-board');
const playerFleetEl = $('player-fleet');
const enemyFleetEl = $('enemy-fleet');
const statusEl = $('status');
const rotateBtn = $<HTMLButtonElement>('rotate');
const randomBtn = $<HTMLButtonElement>('random');
const undoBtn = $<HTMLButtonElement>('undo');
const startBtn = $<HTMLButtonElement>('start');
const newGameBtn = $<HTMLButtonElement>('new-game');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlayText = $('overlay-text');
const overlayNew = $<HTMLButtonElement>('overlay-new');

let game = new Game();
let orientation: Orientation = 'h';
let hoverCell: number | null = null;
let aiTimer: ReturnType<typeof setTimeout> | null = null;

function buildBoard(el: HTMLElement): void {
  el.innerHTML = '';
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.i = String(i);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', label(i));
    el.appendChild(cell);
  }
}

const label = (i: number): string => `${String.fromCharCode(65 + rowOf(i))}${colOf(i) + 1}`;

function previewCells(): { cells: number[]; ok: boolean } | null {
  if (hoverCell === null || game.phase !== 'placement' || game.fleetComplete) return null;
  const r = rowOf(hoverCell);
  const c = colOf(hoverCell);
  const len = game.nextShip.length;
  const exact = shipCells(r, c, len, orientation);
  return {
    cells: exact ?? shipCellsClamped(r, c, len, orientation),
    ok: canPlace(game.player, exact),
  };
}

function renderBoard(el: HTMLElement, board: Board, revealShips: boolean): void {
  const preview = el === playerBoardEl ? previewCells() : null;
  const cells = el.children;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as HTMLElement;
    const shipId = board.occupancy[i];
    const shot = board.shots[i];
    const sunk = shipId !== -1 && isSunk(board.ships[shipId]);
    cell.className = 'cell';
    if (shot === 'hit') cell.classList.add('hit');
    if (shot === 'miss') cell.classList.add('miss');
    if (sunk) cell.classList.add('sunk');
    if (revealShips && shipId !== -1 && !shot) cell.classList.add('ship');
    if (preview && preview.cells.includes(i)) {
      cell.classList.add('preview');
      if (!preview.ok) cell.classList.add('invalid');
    }
  }
}

function renderFleet(el: HTMLElement, board: Board, showPending: boolean): void {
  el.innerHTML = '';
  FLEET.forEach((spec, k) => {
    const li = document.createElement('li');
    const ship = board.ships[k];
    li.textContent = `${spec.name} (${spec.length})`;
    if (ship && isSunk(ship)) li.classList.add('sunk');
    if (showPending && !ship && k === board.ships.length) li.classList.add('pending');
    el.appendChild(li);
  });
}

function render(): void {
  const placing = game.phase === 'placement';
  const revealEnemy = game.phase === 'game-over';
  renderBoard(playerBoardEl, game.player, true);
  renderBoard(enemyBoardEl, game.enemy, revealEnemy);
  renderFleet(playerFleetEl, game.player, placing);
  renderFleet(enemyFleetEl, game.enemy, false);

  playerBoardEl.classList.toggle('interactive', placing && !game.fleetComplete);
  enemyBoardEl.classList.toggle('interactive', game.phase === 'player-turn');

  rotateBtn.hidden = randomBtn.hidden = undoBtn.hidden = startBtn.hidden = !placing;
  newGameBtn.hidden = placing;
  undoBtn.disabled = game.player.ships.length === 0;
  startBtn.disabled = !game.fleetComplete;
  rotateBtn.textContent = `Rotate (R): ${orientation === 'h' ? 'Horizontal' : 'Vertical'}`;

  statusEl.textContent = statusText();
  statusEl.classList.toggle('thinking', game.phase === 'ai-turn');
}

function statusText(): string {
  switch (game.phase) {
    case 'placement':
      return game.fleetComplete
        ? 'Fleet ready. Press Start Battle!'
        : `Place your ${game.nextShip.name} (${game.nextShip.length} cells)`;
    case 'player-turn':
      return lastShotText() || 'Your turn — fire at Enemy Waters';
    case 'ai-turn': {
      const last = lastShotText();
      return last ? `${last} Enemy is thinking` : 'Enemy is thinking';
    }
    case 'game-over':
      return game.winner === 'player' ? 'Victory! Enemy fleet destroyed.' : 'Defeat. Your fleet was sunk.';
  }
}

function lastShotText(): string {
  const ev = game.log[game.log.length - 1];
  if (!ev) return '';
  return describe(ev);
}

function describe(ev: ShotEvent): string {
  const who = ev.by === 'player' ? 'You' : 'Enemy';
  const at = label(ev.cell);
  if (ev.result === 'miss') return `${who} fired at ${at}: miss.`;
  if (ev.result === 'hit') return `${who} fired at ${at}: hit!`;
  return `${who} sank ${ev.by === 'player' ? 'the enemy' : 'your'} ${ev.ship?.name}!`;
}

function cellFromEvent(e: Event): number | null {
  const t = (e.target as HTMLElement).closest<HTMLElement>('.cell');
  return t?.dataset.i !== undefined ? Number(t.dataset.i) : null;
}

playerBoardEl.addEventListener('mousemove', (e) => {
  const i = cellFromEvent(e);
  if (i !== hoverCell) {
    hoverCell = i;
    render();
  }
});
playerBoardEl.addEventListener('mouseleave', () => {
  hoverCell = null;
  render();
});
playerBoardEl.addEventListener('click', (e) => {
  if (game.phase !== 'placement' || game.fleetComplete) return;
  const i = cellFromEvent(e);
  if (i === null) return;
  const cells = shipCells(rowOf(i), colOf(i), game.nextShip.length, orientation);
  if (canPlace(game.player, cells)) {
    placeShip(game.player, game.nextShip, cells!);
    render();
  }
});

enemyBoardEl.addEventListener('click', (e) => {
  if (game.phase !== 'player-turn') return;
  const i = cellFromEvent(e);
  if (i === null || game.enemy.shots[i] !== undefined) return;
  game.playerFire(i);
  render();
  afterPlayerShot(game.phase);
});

function afterPlayerShot(phase: Phase): void {
  if (phase === 'ai-turn') scheduleAi();
  else if (phase === 'game-over') showGameOver();
}

function scheduleAi(): void {
  aiTimer = setTimeout(() => {
    aiTimer = null;
    game.aiFire();
    render();
    if (game.phase === 'game-over') showGameOver();
  }, aiDelayMs());
}

function showGameOver(): void {
  const won = game.winner === 'player';
  overlayTitle.textContent = won ? 'Victory!' : 'Defeat';
  const shots = game.log.filter((e) => e.by === 'player').length;
  overlayText.textContent = won
    ? `You destroyed the enemy fleet in ${shots} shots.`
    : 'The enemy sank your entire fleet.';
  overlay.hidden = false;
}

function toggleOrientation(): void {
  orientation = orientation === 'h' ? 'v' : 'h';
  render();
}

function newGame(): void {
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = null;
  game = new Game();
  hoverCell = null;
  overlay.hidden = true;
  render();
}

rotateBtn.addEventListener('click', toggleOrientation);
randomBtn.addEventListener('click', () => {
  while (game.player.ships.length) removeShip(game.player, game.player.ships.length - 1);
  randomFleet(game.player);
  render();
});
undoBtn.addEventListener('click', () => {
  removeShip(game.player, game.player.ships.length - 1);
  render();
});
startBtn.addEventListener('click', () => {
  game.start();
  render();
});
newGameBtn.addEventListener('click', newGame);
overlayNew.addEventListener('click', newGame);
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'r' && game.phase === 'placement') toggleOrientation();
});

buildBoard(playerBoardEl);
buildBoard(enemyBoardEl);
render();
