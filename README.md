# Battleship

Single-player Battleship in the browser against a hunt-and-target AI. No backend, no frameworks — TypeScript + Vite.

Play online: https://terra7018.github.io/battleship-game/

## Play locally

```sh
npm install
npm run dev      # http://localhost:5173
```

1. **Place your fleet** — hover a cell on *Your Fleet* to preview, click to place. `R` (or the Rotate button) flips orientation. *Randomize* places everything for you; *Undo* removes the last ship.
2. **Start Battle**, then click cells in *Enemy Waters* to fire. The AI answers after a short pause.
3. First to sink all five ships wins. Enemy ships are revealed when the game ends.

Fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2) on a 10x10 grid.

## AI

`src/engine/ai.ts` — `HuntTargetAi`:

- **Hunt**: random shots on one checkerboard parity (every ship is at least 2 long, so half the cells suffice to find them all).
- **Target**: after a hit, probes the four neighbours; once two hits line up it locks the axis and extends to both ends of the run until the ship sinks. Sunk ships' cells are dropped from the pending-hit list so overlapping-adjacent ships don't confuse it.

Averages roughly 55–65 shots to clear the board (tested in `test/engine.test.ts`).

## Layout

```
src/engine/types.ts   grid constants, fleet, Board/Ship types
src/engine/board.ts   placement, random fleet, firing
src/engine/ai.ts      HuntTargetAi
src/engine/game.ts    Game state machine (placement → turns → game-over)
src/main.ts           DOM rendering + input
src/style.css
test/engine.test.ts   Vitest unit tests (seeded RNG, deterministic)
```

## Scripts

| command             | what                          |
| ------------------- | ----------------------------- |
| `npm run dev`       | dev server                    |
| `npm test`          | unit tests (Vitest)           |
| `npm run typecheck` | `tsc --noEmit`                |
| `npm run build`     | production build into `dist/` |

CI runs typecheck, tests and build on every PR, and deploys `main` to GitHub Pages (enable *Settings → Pages → Source: GitHub Actions* once).
