# Pirate Battle

Top-down 2D naval shooter built with React, TypeScript, PixiJS, TanStack Query, Axios, MSW and Playwright.

## Status

The deterministic simulation core is implemented and covered by unit tests. Rendering,
React screens, the ranking/history API layer and the Playwright suite are the next stages.

| Area | State |
| --- | --- |
| Typed game configuration and option limits | done |
| Seeded RNG, injectable clock, fixed-step loop | done |
| Player movement, rotation, arena and island collision | done |
| Frontal and broadside weapons, cooldowns, projectile lifetime | done |
| Chaser and Shooter behaviour, seeded spawner | done |
| Match rules: scoring, time out, death, pause, restart | done |
| PixiJS renderer, provided assets, effects and sounds | done |
| Asset loading with progress, failure and retry | done |
| React screens, HUD, touch controls, accessibility | keyboard + in-game HUD only |
| Ranking and Match History with MSW | pending |
| Playwright E2E and visual regression | pending |
| Performance profiling report | pending |

## Setup

```bash
npm install
npm run dev
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and produce the optimised build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (simulation, input, HUD, atlas conversion) |
| `npm run e2e` | Playwright suite |

## Controls

| Key | Action |
| --- | --- |
| Mouse | Steer: the ship turns toward the pointer, as in slither.io |
| W or ↑ | Sail forward |
| A / D or ← / → | Turn; overrides the mouse until it moves again |
| Space | Bow gun |
| Q / E | Port / starboard broadside |
| P or Esc | Pause and resume (also the on-screen button) |
| Enter | Start or restart a match |
| M | Mute |

The match also pauses when the window loses focus or the tab is hidden.

## Assets

The challenge assets live in `assets/` unmodified; see `assets/SOURCES.md` for their origin
and the conversions applied at load time.

## Gameplay configuration

All balancing lives in `src/game/config/gameConfig.ts`. Systems read values from the
config object, so tuning never requires changes to game logic.

Player-facing options and their documented bounds:

| Option | Minimum | Maximum |
| --- | --- | --- |
| Game session time | 60 s | 180 s |
| Enemy spawn time | 0.5 s | 10 s |

The spawn interval must be positive. Each match freezes a snapshot of the configuration
at start, so later edits only affect subsequent matches.

## Determinism

Every match runs from a numeric seed. The simulation contains no `Math.random` and no
direct clock reads, so a seed plus an input sequence reproduces a match exactly. This is
what makes the Playwright scenarios repeatable.
