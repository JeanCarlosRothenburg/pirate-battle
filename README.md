# Pirate Battle

Top-down 2D naval shooter: sail between islands, fight enemy ships and score points before
the match ends. Built with React, TypeScript (strict), PixiJS, TanStack Query, Axios, MSW and
Playwright.

- **Live demo:** _added after the first Vercel deployment (see [Deployment](#deployment))._
- **Architecture and decisions:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Test report:** `reports/e2e/index.html` · **Profiling report:** [reports/performance/REPORT.md](reports/performance/REPORT.md)

## Setup

Requirements: Node.js 20 or newer. Profiling also needs Google Chrome installed.

```bash
npm install
npm run dev
```

**Environment variables:** none. The ranking and match history run on a mock API (MSW)
inside the app, in development and in the published build alike.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and produce the optimised build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run e2e:install` | Download Playwright's Chromium (once) |
| `npm run e2e` | Playwright suite on desktop and mobile Chromium, with the HTML report in `reports/e2e/` |
| `npm run e2e:ui` | Playwright UI mode |
| `npm run e2e:update-snapshots` | Regenerate the visual regression baselines |
| `npm run perf` | Performance profile of the optimised build (writes `reports/performance/profile.json`) |

The E2E and profiling suites build the app and serve it with `vite preview` on their own.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Steer: the ship turns toward the pointer, as in slither.io |
| W or ↑ | Sail forward (ships only sail forward) |
| A / D or ← / → | Turn; overrides the mouse until it moves again |
| Space | Bow gun (one ball) |
| Q / E | Port / starboard broadside (three parallel balls) |
| P or Esc | Pause (also the on-screen button); Esc, P or Resume continue (in landscape on touch devices) |
| M | Mute (also in the pause menu) |
| Touch | On-screen buttons to sail, turn and fire, usable together; drag on the sea to steer |

Sailing and firing work at the same time. The match also pauses when the window loses focus
or the tab is hidden, and only resumes on the player's action. Game keys are only captured
while a match runs. On touch devices matches are played in **landscape**: turning the device
upright pauses the match until it is turned back.

## Gameplay configuration

All balancing lives in `src/game/config/gameConfig.ts` (session length, spawn interval and
mix, health, speeds, turn rates, damage, projectile speed, range and lifetime, cooldowns,
Shooter range, hull friction, enemy avoidance). Systems read the config, so tuning never
changes game logic. The values and their reasoning are in
[ARCHITECTURE.md](ARCHITECTURE.md#balancing-decisions).

Options exposed to the player (Options screen, saved in the browser):

| Option | Minimum | Maximum | Default |
| --- | --- | --- | --- |
| Game session time | 60 s | 180 s (whole seconds) | 120 s |
| Enemy spawn time | 0.5 s | 10 s (must be positive) | 3 s |
| Player name | 1 character | 16 characters | Captain |

Each match freezes the options when it starts; later changes apply to the next match. The
player name is not one of the brief's two options; it is there because the ranking must
identify players.

## Screens and persistence

Main menu (Play, Options, control instructions, Ranking and Match History buttons), Options,
the Captain's Log (ranking and history tabs), the match with its pause menu, and the result
screen. They follow the samples in `assets/`, plus what the brief requires and the samples
do not show (control instructions on the menu, registration state on the result screen).

Saved in `localStorage` under versioned keys:

| Key | Content |
| --- | --- |
| `pirate-battle:options:v1` | Player name, game session time, enemy spawn time |
| `pirate-battle:player:v1` | Stable player id |
| `pirate-battle:last-result:v1` | Last completed match |
| `pirate-battle:view:v1` | Whether the result screen was open, so it survives a refresh |
| `pirate-battle:pending-matches:v1` | Completed matches not yet confirmed by the server |
| `pirate-battle:mock-db:v1` | Mock API: matches confirmed by the simulated server |
| `pirate-battle:mock-scenario:v1` | Mock API: the selected network scenario and seed |

Reloading or leaving during a match abandons it, and it is not recorded.

## Simulated network

Select a network scenario under **Simulated network** in the Captain's Log, or with
`?scenario=<id>&seed=<n>` in the URL (remembered until changed). **Restore initial state**
clears the simulated server's records and returns to `success`. Latency and randomness are
seeded, so a scenario behaves the same on every run.

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

### Reproducing failures

- **Registration during an outage:** choose `register-unavailable`, finish a match, and the
  result screen reports "Not registered" with a Retry. Refresh: the match is still pending.
  Switch back to `success` and press Retry: it appears once in both tabs.
- **Timeout after the server saved the match:** choose `register-timeout` and finish a
  match. The first response times out, the automatic retry recovers the existing record,
  and the history shows it once.
- **Failing lists:** choose `ranking-failure`, `http-5xx` or `timeout` and open the Captain's
  Log: the error appears with Try again, and the game stays playable.
- **Stale responses:** choose `out-of-order` and page quickly; the page shown always matches
  the page selected.
- **Asset loading failure:** in the browser's DevTools, block a request such as
  `tiles_sheet*.png` (Network panel, "Block request URL") and press Play: the error and a
  Retry appear; unblock and retry to start the match.

## Testing

- **Unit tests** (`npm test`) cover the rules, collisions, avoidance, inputs, HUD, storage,
  stores and the API client against the real MSW handlers.
- **End-to-end tests** (`npm run e2e`) cover the twelve flows of the brief, with visual
  regression of the menu, a stable arena and the result screen, on desktop Chromium and a
  Pixel 7 in landscape. They run against the production build with seeded matches and a
  controllable clock; failures keep a trace (`npx playwright show-trace <trace.zip>`).
- **Test instrumentation:** `?testHooks` exposes `window.__pirateBattle` to observe the match
  and control its clock, `?frozenClock` starts each match with the clock stopped, and
  `?matchSeed=<n>` fixes the seed. All three are inert in normal play.
- Visual baselines in `e2e/13-visual.spec.ts-snapshots/` are per platform; regenerate them
  with `npm run e2e:update-snapshots` on a new one.

## Deployment

The app is a static build, mocks included, so any static host works. On
[Vercel](https://vercel.com/): import the GitHub repository and keep the detected settings
(framework Vite, build `npm run build`, output `dist`); `vercel.json` adds the cache headers.
Every push to `main` then redeploys. The game works when the published URL is opened or
reloaded, mocks included.

## Assets

The challenge assets live unmodified in `assets/`; `assets/SOURCES.md` records their origin
and the conversions applied at load time. The pack ships without a licence file; it is used
under the terms of the challenge.
