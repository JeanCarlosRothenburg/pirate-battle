# Pirate Battle

Top-down 2D naval shooter built with React, TypeScript, PixiJS, TanStack Query, Axios, MSW and Playwright.

## Status

The deterministic simulation core is implemented and covered by unit tests. Rendering,
The Playwright suite, the performance report and the deployment are the next stages.

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
| Menu, Options, Result and Pause screens, persistence, keyboard accessibility | done |
| Touch controls and mobile orientation (landscape) | done |
| Ranking and Match History: Axios, TanStack Query, MSW scenarios | done |
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
| `npm test` | Unit tests (simulation, input, HUD, storage, API against the MSW handlers) |
| `npm run e2e` | Playwright suite |

## Controls

| Key | Action |
| --- | --- |
| Mouse | Steer: the ship turns toward the pointer, as in slither.io |
| W or ↑ | Sail forward |
| A / D or ← / → | Turn; overrides the mouse until it moves again |
| Space | Bow gun |
| Q / E | Port / starboard broadside |
| P or Esc | Pause (also the on-screen button); Esc, P or Resume continue |
| M | Mute |
| Touch | On-screen buttons for sailing, turning and the three guns; drag on the sea to steer |

On touch devices matches are played in **landscape**. Turning the device upright pauses the
match, and it resumes once the device is back in landscape and the player chooses Resume.

The match also pauses when the window loses focus or the tab is hidden. Game keys are only
captured while a match is running; on menus and in the pause dialog every key works as usual.

## Screens and persistence

Main menu (Play, Options, control instructions, and Ranking and Match History buttons, as in
`assets/sample_menu.png`), Options, the Captain's Log (ranking and match history as two tabs,
five rows per page, as in `sample_ranking.png` and `sample_history.png`), the match with its
pause dialog, and the result screen (as in `sample_result.png`, plus the match's registration
state, which the brief requires). Saved in `localStorage` under versioned keys:

| Key | Content |
| --- | --- |
| `pirate-battle:options:v1` | Player name, game session time, enemy spawn time |
| `pirate-battle:player:v1` | Stable player id |
| `pirate-battle:last-result:v1` | Last completed match |
| `pirate-battle:view:v1` | Whether the result screen was open, so it survives a refresh |
| `pirate-battle:pending-matches:v1` | Completed matches the server has not confirmed yet |
| `pirate-battle:mock-db:v1` | Mock API: matches confirmed by the simulated server |
| `pirate-battle:mock-scenario:v1` | Mock API: the selected network scenario and seed |

Reloading or leaving during a match abandons it: nothing is recorded. Each match uses the
options saved when it started; later changes apply to the next match.

## Assets

The challenge assets live in `assets/` unmodified; see `assets/SOURCES.md` for their origin
and the conversions applied at load time.

## Ranking, history and simulated network

The ranking and match history come from a mock REST API (MSW) that runs in development and
in the published build alike; there is no real backend and no environment variable to set.

Select a network scenario from **Simulated network** in the Captain's Log, or with
`?scenario=<id>&seed=<n>` in the URL (remembered until changed). **Restore initial state**
clears the simulated server's records and returns to `success`.

| Scenario | What it simulates |
| --- | --- |
| `success` | Quick, reliable responses (seeded 60–180 ms) |
| `empty` | Empty ranking and history |
| `many-pages` | 240 ranking entries for the default settings |
| `slow` | Every response takes 2.5 s |
| `variable-latency` | Seeded latency between 0.1 and 2.5 s |
| `out-of-order` | Alternate requests are slow, so later ones finish first |
| `timeout` | No response before the 5 s client timeout |
| `connection-failure` | Network errors |
| `http-4xx` / `http-5xx` | HTTP 400 / 503 for every request |
| `ranking-failure` / `history-failure` | Only that endpoint fails |
| `register-timeout` | A registration is saved, but its first response times out |
| `register-unavailable` | Registrations fail with 503 until the scenario changes |

To reproduce a failure end to end: pick `register-unavailable`, finish a match, and watch
the result screen report "Not registered" with a Retry; refresh to see the match still
pending; switch back to `success` and retry to see it registered in both tabs.

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
