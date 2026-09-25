import {
  canPlace,
  isSunk,
  placeShip,
  randomFleet,
  removeShip,
  shipCells,
  shipCellsClamped,
} from './engine/board';
import { isArrowKey, moveCursor } from './engine/cursor';
import { Game, Phase, ShotEvent, lastShotBy } from './engine/game';
import { Board, FLEET, Orientation, SIZE, colOf, rowOf } from './engine/types';

const AI_DELAY_MIN_MS = 3000;
const AI_DELAY_MAX_MS = 10000;

const aiDelayMs = (): number =>
  AI_DELAY_MIN_MS + Math.random() * (AI_DELAY_MAX_MS - AI_DELAY_MIN_MS);

const SINK_STAGGER_MS = 120;
const SINK_CELL_MS = 900;
const sinkDurationMs = (len: number): number => SINK_CELL_MS + SINK_STAGGER_MS * (len - 1);

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
const turnEl = $('turn');
const rotateBtn = $<HTMLButtonElement>('rotate');
const randomBtn = $<HTMLButtonElement>('random');
const undoBtn = $<HTMLButtonElement>('undo');
const startBtn = $<HTMLButtonElement>('start');
const newGameBtn = $<HTMLButtonElement>('new-game');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlayText = $('overlay-text');
const overlayNew = $<HTMLButtonElement>('overlay-new');
const dialog = overlay.querySelector<HTMLElement>('.dialog')!;
const background = [
  document.querySelector<HTMLElement>('header')!,
  document.querySelector<HTMLElement>('main')!,
  $('controls'),
];

let game = new Game();
let orientation: Orientation = 'h';
let hoverCell: number | null = null;
/** Roving-tabindex cursor per board: the single cell that is tabbable. */
const cursor = new Map<HTMLElement, number>([
  [playerBoardEl, 0],
  [enemyBoardEl, 0],
]);
let aiTimer: ReturnType<typeof setTimeout> | null = null;
/** True when the most recent user input came from a pointer rather than the keyboard. */
let pointerInput = false;

/** Cells currently playing the sink animation, mapped to their stagger order. */
const sinking = new Map<Board, Map<number, number>>();
let sinkTimers: ReturnType<typeof setTimeout>[] = [];

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
  buildLabels(el);
}

function buildLabels(board: HTMLElement): void {
  const frame = board.parentElement!;
  const make = (cls: string, text: (k: number) => string) => {
    const list = document.createElement('div');
    list.className = cls;
    list.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < SIZE; k++) {
      const span = document.createElement('span');
      span.textContent = text(k);
      list.appendChild(span);
    }
    frame.insertBefore(list, board);
  };
  make('col-labels', (k) => String(k + 1));
  make('row-labels', (k) => String.fromCharCode(65 + k));
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

function renderBoard(el: HTMLElement, board: Board, revealShips: boolean, tabbable: boolean): void {
  const preview = el === playerBoardEl ? previewCells() : null;
  const cells = el.children;
  const focusable = tabbable ? cursor.get(el) : undefined;
  const lastShot = lastShotBy(game.log, el === enemyBoardEl ? 'player' : 'ai')?.cell;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as HTMLElement;
    if (i === focusable) cell.tabIndex = 0;
    else cell.removeAttribute('tabindex');
    const shipId = board.occupancy[i];
    const shot = board.shots[i];
    const sunk = shipId !== -1 && isSunk(board.ships[shipId]);
    cell.className = 'cell';
    if (shot === 'hit') cell.classList.add('hit');
    if (shot === 'miss') cell.classList.add('miss');
    if (sunk) cell.classList.add('sunk');
    if (i === lastShot) cell.classList.add('last-shot');
    const order = sinking.get(board)?.get(i);
    if (order !== undefined) {
      cell.classList.add('sinking');
      cell.style.setProperty('--order', String(order));
    } else {
      cell.style.removeProperty('--order');
    }
    if (revealShips && shipId !== -1 && !shot) cell.classList.add('ship');
    if (preview && preview.cells.includes(i)) {
      cell.classList.add('preview');
      if (!preview.ok) cell.classList.add('invalid');
    }
  }
}

function buildFleet(el: HTMLElement): void {
  el.innerHTML = '';
  for (const spec of FLEET) {
    const li = document.createElement('li');
    li.textContent = `${spec.name} (${spec.length})`;
    el.appendChild(li);
  }
}

function renderFleet(el: HTMLElement, board: Board, showPending: boolean): void {
  const active = sinking.get(board);
  FLEET.forEach((_, k) => {
    const li = el.children[k] as HTMLElement;
    const ship = board.ships[k];
    li.className = '';
    if (ship && isSunk(ship)) li.classList.add('sunk');
    if (ship && active && ship.cells.some((c) => active.has(c))) li.classList.add('sinking');
    if (showPending && !ship && k === board.ships.length) li.classList.add('pending');
  });
}

function render(): void {
  const placing = game.phase === 'placement';
  const revealEnemy = game.phase === 'game-over';
  const battle = game.phase === 'player-turn' || game.phase === 'ai-turn';
  renderBoard(playerBoardEl, game.player, true, placing);
  renderBoard(enemyBoardEl, game.enemy, revealEnemy, battle);
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
  turnEl.hidden = !battle;
  turnEl.textContent = game.phase === 'player-turn' ? 'Your turn' : 'Enemy turn';
  turnEl.classList.toggle('enemy', game.phase === 'ai-turn');
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

function animateSink(board: Board, ev: ShotEvent): number {
  if (ev.result !== 'sunk' || !ev.ship) return 0;
  const cells = [...ev.ship.cells].sort((a, b) => a - b);
  const map = sinking.get(board) ?? new Map<number, number>();
  cells.forEach((c, k) => map.set(c, k));
  sinking.set(board, map);
  const duration = sinkDurationMs(cells.length);
  sinkTimers.push(
    setTimeout(() => {
      for (const c of cells) map.delete(c);
      render();
    }, duration),
  );
  return duration;
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
  const byKeyboard = !pointerInput && playerBoardEl.contains(document.activeElement);
  hoverCell = byKeyboard ? cursor.get(playerBoardEl)! : null;
  render();
});
playerBoardEl.addEventListener('focusin', () => {
  hoverCell = cursor.get(playerBoardEl)!;
  render();
});
playerBoardEl.addEventListener('focusout', (e) => {
  if (playerBoardEl.contains(e.relatedTarget as Node | null)) return;
  hoverCell = null;
  render();
});
playerBoardEl.addEventListener('click', (e) => {
  const i = cellFromEvent(e);
  if (i === null) return;
  setCursor(playerBoardEl, i, true);
  placeAt(i);
});

enemyBoardEl.addEventListener('click', (e) => {
  const i = cellFromEvent(e);
  if (i === null) return;
  setCursor(enemyBoardEl, i, true);
  fireAt(i);
});

for (const el of [playerBoardEl, enemyBoardEl]) {
  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const i = cursor.get(el)!;
    if (isArrowKey(e.key)) {
      e.preventDefault();
      const next = moveCursor(i, e.key);
      if (el === playerBoardEl) hoverCell = next;
      setCursor(el, next, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (el === playerBoardEl) placeAt(i);
      else fireAt(i);
    }
  });
}

function setCursor(el: HTMLElement, i: number, focus: boolean): void {
  cursor.set(el, i);
  render();
  if (focus) (el.children[i] as HTMLElement).focus();
}

function placeAt(i: number): void {
  if (game.phase !== 'placement' || game.fleetComplete) return;
  const cells = shipCells(rowOf(i), colOf(i), game.nextShip.length, orientation);
  if (!canPlace(game.player, cells)) return;
  placeShip(game.player, game.nextShip, cells!);
  render();
  if (game.fleetComplete && playerBoardEl.contains(document.activeElement)) startBtn.focus();
}

function fireAt(i: number): void {
  if (game.phase !== 'player-turn' || game.enemy.shots[i] !== undefined) return;
  const ev = game.playerFire(i);
  const wait = animateSink(game.enemy, ev);
  render();
  afterPlayerShot(game.phase, wait);
}

function afterPlayerShot(phase: Phase, wait: number): void {
  if (phase === 'ai-turn') scheduleAi();
  else if (phase === 'game-over') sinkTimers.push(setTimeout(showGameOver, wait));
}

function scheduleAi(): void {
  aiTimer = setTimeout(() => {
    aiTimer = null;
    const ev = game.aiFire();
    const wait = animateSink(game.player, ev);
    render();
    if (game.phase === 'game-over') sinkTimers.push(setTimeout(showGameOver, wait));
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
  for (const el of background) el.inert = true;
  overlayNew.focus();
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function trapFocus(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !dialog.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

function hideGameOver(): void {
  if (overlay.hidden) return;
  overlay.hidden = true;
  for (const el of background) el.inert = false;
  rotateBtn.focus();
}

function toggleOrientation(): void {
  orientation = orientation === 'h' ? 'v' : 'h';
  render();
}

function newGame(): void {
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = null;
  sinkTimers.forEach(clearTimeout);
  sinkTimers = [];
  sinking.clear();
  game = new Game();
  hoverCell = null;
  cursor.set(playerBoardEl, 0);
  cursor.set(enemyBoardEl, 0);
  render();
  hideGameOver();
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
  setCursor(enemyBoardEl, cursor.get(enemyBoardEl)!, true);
});
newGameBtn.addEventListener('click', newGame);
overlayNew.addEventListener('click', newGame);
overlay.addEventListener('keydown', trapFocus);
document.addEventListener('pointerdown', () => {
  pointerInput = true;
  document.body.classList.add('pointer-input');
}, true);
document.addEventListener('keydown', () => {
  pointerInput = false;
  document.body.classList.remove('pointer-input');
}, true);
document.addEventListener('keydown', (e) => {
  if (!overlay.hidden) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'r' && game.phase === 'placement') toggleOrientation();
});

buildBoard(playerBoardEl);
buildBoard(enemyBoardEl);
buildFleet(playerFleetEl);
buildFleet(enemyFleetEl);
render();
