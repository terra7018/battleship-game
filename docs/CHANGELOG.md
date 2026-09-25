# Changelog

A record of every pull request merged into `main`, grouped by bugs found and features added. The initial game (engine, hunt/target AI, UI, tests, CI + GitHub Pages deploy) was pushed directly to `main`; everything below landed as a reviewed PR.

Every PR passed `npm run typecheck`, `npm test`, `npm run build`, a Devin Review (all bug/security findings fixed before merge) and the GitHub Actions CI before being merged by the repository owner. UI changes were additionally play-tested end-to-end in a browser.

## Bugs

### [#1](https://github.com/terra7018/battleship-game/pull/1) — AI abandoned damaged ships
- **Bug:** When two adjacent hits belonged to two side-by-side ships, the AI's axis lock could not extend the line and it fell back to hunting, leaving damaged ships unsunk.
- **Fix:** In target mode, collect fallback neighbours of every unresolved hit instead of only the aligned line. Added a side-by-side regression test in `test/engine.test.ts`.

### [#4](https://github.com/terra7018/battleship-game/pull/4) — Turn feedback off-screen on mobile
- **Bug:** At widths ≤ 700 px the status line ("Your turn", "Enemy is thinking…", shot results) scrolled out of view while the player was firing on Enemy Waters.
- **Fix:** Header/status is `position: sticky` with a solid background on narrow screens; the game-over overlay's `z-index` was raised so it still paints above the header.

### [#5](https://github.com/terra7018/battleship-game/pull/5) — Game-over overlay did not trap focus
- **Bug:** Tab could reach the dimmed background "New Game" button and Enter silently reset the game.
- **Fix:** Overlay is a real modal dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby`), background controls become `inert`, Tab/Shift+Tab cycle inside the dialog, focus moves into the dialog on open and is restored on close, and Escape no longer resets the game.

### [#6](https://github.com/terra7018/battleship-game/pull/6) — Keyboard-only play impossible
- **Bug:** Tab skipped both grids; ships could not be placed nor shots fired without a mouse.
- **Fix:** Roving `tabindex` per board, arrow keys / Home / End move the cursor (pure `src/engine/cursor.ts` with tests), Enter/Space places a ship or fires, placement preview follows the keyboard cursor, and only the board relevant to the current phase is tabbable.

## Features

### [#2](https://github.com/terra7018/battleship-game/pull/2) — Human-like AI thinking time
- **Idea:** A fixed 700 ms AI reply felt robotic.
- **Implementation:** Random 3–10 s delay before the AI fires, with an animated "Enemy is thinking…" status.

### [#3](https://github.com/terra7018/battleship-game/pull/3) — Ship sinking animation
- **Idea:** Sinking a ship had no visual payoff.
- **Implementation:** Staggered explosion + shockwave on each sunk cell and a flash on the fleet label; animation state tracked outside the DOM so re-renders do not restart it. Review fixes: fleet-label animation duration matched to cleanup, `prefers-reduced-motion` overrides moved after the animation rules.

### [#7](https://github.com/terra7018/battleship-game/pull/7) — AI pace option (Human-like / Quick)
- **Idea:** Waiting for the AI dominated play time; some players want a fast game.
- **Implementation:** `src/engine/pace.ts` (`aiDelayMs`, `PACE_RANGES`: Human-like 3–10 s, Quick 0.5–1 s) with a labelled select persisted in `localStorage` (`battleship.aiPace`); default remains Human-like. Review fix: Quick turns wait at least until the sink animation has finished.

### [#8](https://github.com/terra7018/battleship-game/pull/8) — Board feedback
- **Idea:** No coordinates, no indication of where the AI just fired, and no explicit turn cue.
- **Implementation:** Row/column labels (A–J, 1–10) that fit on mobile, highlight of the AI's latest shot on Your Fleet, and a persistent turn badge.

### [#9](https://github.com/terra7018/battleship-game/pull/9) — Post-game statistics + Inspect battlefield
- **Idea:** No feedback on performance after a game, and the overlay hid the revealed enemy fleet.
- **Implementation:** Per-game shots/hits/accuracy for both sides and ships remaining; persisted wins, losses, current/best streak and best winning shot count (`src/engine/stats.ts`, tested). "Inspect battlefield" hides the overlay without resetting so the revealed fleet can be studied. Review fix: unsaved results are replayed onto a freshly loaded record so a storage failure cannot overwrite another tab's record.

### [#11](https://github.com/terra7018/battleship-game/pull/11) — AI difficulty levels
- **Idea:** One fixed skill level.
- **Implementation:** Easy (random hunting, sometimes ignores pending hits), Normal (the existing hunt/target AI, default) and Hard (probability-density hunting) behind a common `chooseTarget`/`notify` interface. Selector during placement, persisted in `localStorage`, shown in the header and game-over overlay. Tests: each AI sinks a random fleet in ≤ 100 shots without repeating a cell; average shots ≈ 44 (Hard) / 52 (Normal) / 67 (Easy).

### [#10](https://github.com/terra7018/battleship-game/pull/10) — Placement improvements
- **Idea:** Randomize discarded manually placed ships, and a placed ship could only be changed via Undo.
- **Implementation:** "Randomize remaining" keeps manual ships and places only the unplaced ones (engine helper with tests; "Randomize all" kept). Placed ships can be dragged (pointer and touch) to a new anchor with the green/red validity preview, snapping back if invalid; pressing R mid-drag rotates. Uses `removeShip`/`placeShip` so ship ids stay consistent. Review fix: stale clicks from cancelled drags are suppressed per pointer id.

### [#12](https://github.com/terra7018/battleship-game/pull/12) — Sound effects and hit/miss effects
- **Idea:** Ordinary turns felt flat; only sinks were animated and there was no audio.
- **Implementation:** Miss ripple and hit impact animations on the latest shot cell (sink animation still takes priority; `prefers-reduced-motion` respected). Web Audio API sounds synthesized in code for miss, hit, sunk, victory and defeat, with the `AudioContext` created lazily on the first user gesture. Keyboard-accessible mute toggle (`aria-pressed`) persisted in `localStorage`; sound on by default.
