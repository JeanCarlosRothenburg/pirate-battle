# Architecture

## Layering

```
src/game/config   typed balancing values and the documented option bounds
src/game/sim      pure simulation: entities, pools, RNG, broadphase, fixed-step loop
src/game/systems  collision, combat, enemy behaviour, obstacle avoidance, spawning
src/game/assets   asset manifest, loading with progress and retry, atlas conversion
src/game/audio    Web Audio sound bank shared across mounts
src/game/render   PixiJS views and effects driven by simulation state
src/game/input    keyboard, pointer and touch sources producing an InputIntent
src/game/bridge   React/PixiJS integration: game session, lifecycle, HUD, audio, test API
src/ui            React screens, forms and dialogs, app and submission state (zustand)
src/storage       versioned, schema-validated localStorage persistence
src/api           typed contracts, Axios client, TanStack Query hooks
src/mocks         MSW handlers, fixtures, mock database and network scenarios
e2e               Playwright end-to-end and visual regression suite
perf              performance profiling suite
```

`sim/` and `systems/` import no rendering, React, HTTP or browser globals. That boundary
keeps the rules unit-testable in Node and identical in every environment: the same seed
and inputs give the same match in Node and in the browser.

Design patterns used where they remove branching or coupling:

| Pattern | Where | Why |
| --- | --- | --- |
| Strategy | `MatchClock` (`RealTimeClock`, `ManualClock`); enemy behaviours per kind (`enemyAI.ts`); network scenarios (`mocks/handlers.ts`) | New clocks, enemy kinds or scenarios are new entries, not new branches |
| Observer | `GameSession.observe` | Renderer, audio and the test tally each receive every fixed step without the session knowing them |
| Facade | `installTestApi` | Tests see one small API over the session: state, clock and coordinates |
| Object pool | ships, projectiles, effect sprites, ship views | No allocation inside the step or the frame |

## React and PixiJS integration

React owns menus, forms, panels and dialogs; PixiJS owns the arena, ships, projectiles,
effects and the indicators above ships. The match never lives in React state.

- **Lifecycle (`mountGame`).** `Application.init` and asset loading are async, while React
  effect cleanup is sync. `mountGame` therefore returns a handle at once, and its `destroy`
  is idempotent and safe at any moment. Under Strict Mode's mount, unmount and mount, the
  first application is destroyed as soon as its init settles and never attaches its canvas,
  so only one canvas ever exists. The match screen is keyed by match id: every match mounts
  a fresh application and simulation, and leaving the screen tears them down.
- **Session (`GameSession`).** One running match: it owns the simulation, inputs, renderer,
  audio and HUD, drives them from the Pixi ticker, and on `dispose` removes the ticker
  callback and every DOM listener, disposes inputs and audio, and destroys the display tree.
- **Sync without per-frame React renders.** The HUD is rendered once by React with empty
  slots; `HudPublisher` writes score, time, hull and enemy count straight into them at
  10 Hz, touching a node only when its text changes. React hears about the match only on
  phase transitions (`onPhaseChange`) and once at the end (`onMatchEnd`), which drive the
  pause dialog and the result screen.
- **Canvas fit.** The canvas follows its container with `autoDensity` and a resolution capped
  at 2. The arena is letterboxed (`fitLetterbox`), so proportions, input coordinates and
  arena limits never change with the screen. The same mapping converts pointer positions to
  arena coordinates. The sea still covers the whole screen: on each resize the water is
  stretched over the visible area, with its tile pattern anchored to the arena origin so
  there is no seam; outside the arena it is dimmed and a thin line marks the limit.
- **Code splitting.** The match screen and PixiJS load on demand with the first match, so the
  menus never download the renderer.

## Simulation loop

The simulation advances in fixed 1/60 s steps through an accumulator (`FixedStepRunner`).
Frame time never reaches the physics, so movement, damage, cooldowns and spawns behave the
same at 30, 60 or 144 Hz. Frames longer than 250 ms are clamped, so a backgrounded tab
cannot replay a burst of simulation on return, and resuming clears the accumulator, so a
paused period never becomes movement.

Each step stores every entity's previous transform; the renderer interpolates between the
previous and current transform with the leftover accumulator ratio. `simulation.events` only
holds the latest step's events and a frame can run several steps, so every step is handed to
the session's observers before the next one clears them.

Match states: `idle → running ⇄ paused → ended`. `step` returns at once outside `running`,
so one guard makes pausing or ending stop movement, attacks, damage, spawns and scoring.
Cooldowns and the match timer are simulation time, so they pause with it.

A `mulberry32` generator seeded per match drives spawn placement and enemy types. The
simulation never reads a clock or `Math.random`; entity arrays are dense, iterated in a
stable order and compacted rather than spliced.

## Movement and collisions

Ships only sail forward (the brief allows forward movement and turning). The player turns
with A/D or toward the pointer; enemies turn toward the heading their behaviour chooses.

Ships and projectiles are circles; islands are circles and axis-aligned rectangles from the
arena configuration. Ship movement slides tangentially along the contact surface
(`resolveCircleMove`), the same for the player and enemies:

1. A ship that starts a step overlapping an island is pushed out along the surface normal,
   so no step can end inside one.
2. The move advances to the moment it would first enter an island, found by bisection.
   Moves are a few pixels per step against radii of 20 px or more, so the end position is
   enough to detect an entry without tunnelling.
3. The surface normal comes from the circle centre or from the nearest point of a rectangle,
   rounded around corners for smooth sliding.
4. The rest of the move keeps its tangential part, `slide = move - n * dot(move, n)`, scaled
   by hull friction. The tangent comes from the move itself, so a ship angled toward one
   side scrapes toward that side, and a head-on move stops.
5. If the slid position still collides (a pocket between two islands), the ship stays where
   it started the step.

`ship.speed` is the thrust along the heading, not the actual velocity while scraping: contact
removes only the part of each step's movement that pushes into the island. Zeroing or
re-projecting the speed every step would make a ship pressing at an angle against a flat face
grind to a crawl. Hull friction scales the slide and the stored speed by the same factor
(`1 - friction × dt`) on each contact step, so the two stay in step. Each contact step emits a `scrape` event (contact point and the speed lost
into the surface); the renderer and audio do not use it yet. Arena walls clamp, which slides
along them without a scrape event.

Projectiles use a swept segment-versus-circle test: at 540 px/s a ball travels 9 px per step,
more than its radius, so a point test would tunnel. Player projectiles query enemies through
a uniform grid broadphase (128 px cells) rebuilt each step into pre-allocated arrays.

## Enemies

Each enemy kind is a behaviour (`enemyAI.ts`): the **Chaser** heads straight for the player
and explodes on contact; the **Shooter** closes to its preferred range, then holds and keeps
turning to aim, and fires only within attack range and while its bow points at the player
(its gun fires along the bow). Enemies spawn on the configured interval at points chosen by
seeded rejection sampling: in open water, clear of islands, and at least 420 px from the
player so a spawn cannot deal unavoidable damage.

Enemies steer around islands with context steering (Fray, "Context Steering: Behavior-Driven
Steering at the Macro Scale", *Game AI Pro 2*, ch. 18), a refinement of Reynolds' steering
behaviours (GDC 1999). The behaviour decides where an enemy wants to go; `ContextSteering`
bends that heading around obstacles. Each step it fills two maps over 16 headings:

- **interest**: cosine falloff toward the desired heading, plus a small bias toward the
  current heading, so a ship facing an island head-on keeps the detour it started;
- **danger**: for each heading, a ray as wide as the hull plus a margin is cast up to the
  lookahead; the closer an island or wall, the higher the danger.

Headings noticeably more dangerous than the safest are masked; the most interesting
remaining heading wins, refined between slots by a parabolic fit, and throttle drops with
its danger. When the line to the goal is clear, the desired heading is used unchanged, and a
holding Shooter skips avoidance so its aim stays exact. Avoidance uses the same shapes as the
contact physics, so the two agree.

| Alternative | Why not here |
| --- | --- |
| Reynolds obstacle avoidance | Blended with seek, the two vectors can cancel head-on; the ship oscillates or stalls |
| Ray "whiskers" | A few fixed rays miss obstacles between them and need special cases to pick a side |
| Potential fields | Local minima right behind round obstacles, the case of an island between enemy and player |
| RVO / ORCA | Built for moving agents avoiding each other, not static geometry |
| A* on a grid or navmesh | Exact but heavy for five convex islands; only worth it for mazes or concave bays |

## Damage and scoring

A projectile's `alive` flag clears the moment it applies damage and the sweep skips dead
projectiles, so a projectile can never damage twice. Enemies destroyed by player projectiles
award one point. A Chaser that explodes against the player damages it and awards nothing;
the two cases are told apart by the `DeathCause` recorded when the enemy dies. Destroyed
enemies leave the arrays at the end of the step, so they stop dealing damage, firing and
colliding at once.

## Rendering, assets and audio

`loadGameAssets` loads everything a match needs before combat starts: the ships atlas, the UI
atlas, the tile sheet, three seamless tiles and the game sounds, reporting progress to the
loading screen. A failure shows an error with Retry; Pixi's loader drops failed entries from
its cache, so a retry refetches only what failed. Files are imported through Vite, which
fingerprints them; UI and tile art switch to their 2× variants on high-density screens. The
ships atlas is Starling XML, which Pixi does not read, so `parseTextureAtlasXml` converts it
at load time and the provided file stays the single source.

Ships use the atlas sprite of their kind (player blue, Chaser red, Shooter black) and swap
to damaged art at 2/3 and heavily damaged art at 1/3 health; heavily damaged ships burn and
destroyed ones leave a sinking wreck. Health bars above every ship use the UI atlas frame and
fills. Projectiles are pooled sprites with trails; muzzle flashes, impacts, debris and
explosions come from a fixed sprite pool with seeded randomness, so screenshots are
reproducible. Effects freeze while the match is paused.

Islands are drawn over their exact collision shapes with the sand and grass tiles as
patterns. The tile sheet's prebuilt islands only fit multiples of 64 px, and stretching them
tore the art. Hull sprites are 2.8 times the collision radius long, so bow and stern
overhang the circle slightly while the beam sits inside it.

Sounds play through Web Audio on one page-wide `AudioContext` (buffers belong to the context
that decoded them); each session routes through its own gain node, so disposing it stops its
loops without touching the shared context. `GameAudio` maps simulation events and phase
changes to sounds. Menus play the `ui_*` sounds, decoded on first use after a user gesture.
One mute switch (M, or the pause dialog) covers menus and matches.

## Resource management

- Ships, projectiles, effect sprites and ship views come from pre-allocated pools and are
  mutated in place; nothing is allocated inside the simulation step.
- Textures and audio buffers are cached for the page's lifetime and reused by every match;
  disposing a session destroys the display tree and Graphics contexts, never shared textures.
- Disposing a session removes the ticker callback, the resize, blur and visibility
  listeners, the keyboard and pointer listeners and the audio loops. The profiling run shows
  DOM nodes and event listeners constant over five play-and-leave cycles, and no canvas left
  behind (see `reports/performance/REPORT.md`).

## Input

Input sources write into one reused `InputIntent` each frame; the simulation reads it and
knows nothing about devices.

- **Keyboard** (`KeyboardInput`): W sails, A/D turn, Space and Q/E fire, P/Esc pause and M
  mutes. Keys are bound by `KeyboardEvent.code`, so the layout does not matter, and they are
  only captured while a match runs, so menus and dialogs get every key.
- **Pointer** (`PointerSteering`): slither.io-style steering. The pointer position is
  converted to arena coordinates through the letterbox and passed as a target point; the
  simulation re-aims at it every step, at the ship's turn rate. A pointer resting on the hull
  holds the heading. Keyboard turning overrides the pointer until the pointer moves again.
- **Touch** (`TouchButtons`): hold-to-act buttons with pointer capture, several at once, so
  the ship can sail, turn and fire together; dragging on the sea steers. They appear on
  coarse-pointer devices only.

Matches are played in landscape on touch devices: the brief leaves the orientation to the
solution, and a 16:9 arena in portrait would shrink to about a quarter of a phone's width.
Turning a device upright pauses the match and the pause dialog asks to rotate; turned back,
it becomes the normal pause menu, where Resume is still the player's choice. The rules never
change with the screen.

## Screens, persistence and accessibility

A zustand store (`ui/appStore.ts`) holds the screen, the saved options, the player id, the
last result and the setup of the match in progress. Play freezes the options into a
`GameConfig` snapshot with a new match id and seed; later option changes apply to the next
match. Main menu, Captain's Log and result follow `assets/sample_menu.png`,
`sample_ranking.png`, `sample_history.png` and `sample_result.png`. Where the brief requires
something the samples do not show, the brief wins: the control instructions sit on the main
menu, and the result screen reports the match's registration state.

Every stored value is parsed with a zod schema under a versioned key; missing, corrupted or
out-of-range data falls back to defaults. Options, the player id, the last result and the
pending registrations persist; only the result screen is restored after a refresh, and
reloading or leaving mid-match abandons it unrecorded.

Accessibility: every screen moves focus to its heading when it opens; the record tabs follow
the WAI-ARIA tabs pattern; the Options form reports errors with an alert summary, per-field
messages and focus on the first invalid field; the pause menu is a native modal `<dialog>`
that traps focus. Score, time and hull are text in the DOM, and the match state is announced
through a polite live region on phase changes only. Menu panels and buttons are the UI atlas
pieces drawn as CSS nine-slices, with dark text on gold and light text on navy for contrast.

## Ranking and match history

**Contracts** (`api/contracts.ts`) are zod schemas shared by the client, the MSW handlers
and the tests. A match record carries match and player ids, end time, score, active
duration, end reason and the configuration used with its fingerprint.

| Endpoint | Purpose |
| --- | --- |
| `PUT /api/matches/:matchId` | Register a completed match. Idempotent: a repeat returns the stored record with `created: false` |
| `GET /api/ranking?config=&page=&pageSize=` | Ranking for one configuration fingerprint, five per page |
| `GET /api/players/:playerId/matches?page=&pageSize=` | A player's history, newest first |

The ranking only compares matches with the same configuration. Ties break
deterministically: higher score, then less active time, then the earlier match, then the
match id. Other players come from seeded fixtures.

**Client and cache.** Axios with a 5 s timeout validates every response against its
schema. TanStack Query owns caching (10 s stale time), retries (at most two, with exponential
backoff, only for timeouts, connection failures and 5xx) and background refreshes. Each tab
mounts only while shown and refetches on mount, so both tabs refresh whenever they reappear.
Every page has its own query key, and a superseded request for the same key is aborted
through Axios's signal, so a slow, older response never overwrites newer data. When a refresh
fails, the last data received stays on screen under an error notice with a retry.

**Registration and pending records.** When a match ends, its record is saved as the last
result and added to a persisted pending queue in the same step. `SubmissionManager`, mounted
on every screen, sends queued records through a TanStack mutation in the background, so a
pending registration never blocks starting another match. Success removes the record and
invalidates both tabs; failure keeps it queued, shown on the result screen and the menu with
a retry, and retried when the browser comes back online and after every refresh. The
endpoint is idempotent, so a timed-out request whose record the server did save, or repeated
clicks, never create a second entry.

**Mocks.** `createMockApi` builds the handlers on a mock database: the fixtures plus the
matches this browser registered, persisted to localStorage, so both tabs read one consistent
store and confirmed records survive a refresh. The same handlers run in a service worker in
development and in the published build, and under `msw/node` in the unit tests. Network
scenarios add seeded latency or failures per request; see the README for the list.

## Testing

- **Unit tests (Vitest, Node):** simulation rules, collisions, avoidance, input sources, HUD
  publishing, persistence, stores, and the API client against the real MSW handlers.
- **End to end (Playwright):** the twelve flows of the brief, plus visual regression of the
  menu, a stable arena and the result screen, in desktop Chromium and a Pixel 7 in
  landscape, against the production build. Each test starts from a fresh browser context.
- **Test instrumentation:** `?testHooks` installs `window.__pirateBattle`, which observes
  state and controls the clock: `?frozenClock` starts the match on the manual clock and
  `step(seconds)` advances it in fixed steps with the live inputs, so rules, inputs,
  collisions and rendering run unchanged. `?matchSeed=<n>` fixes the match seed. Combat
  tests press the real keys and touch buttons and check their effects.
- **Profiling:** `npm run perf` measures the optimised build in Google Chrome (see
  `reports/performance/REPORT.md`).

## Balancing decisions

All values live in `src/game/config/gameConfig.ts`; systems read them, so tuning never
touches logic. Notable choices:

| Value | Setting | Reason |
| --- | --- | --- |
| Session time / spawn interval | 120 s / 3 s by default | Options bounds 60–180 s and 0.5–10 s |
| Player speed, turn rate | 190 px/s, 2.3 rad/s | Faster than every enemy, turns tighter than a Shooter |
| Front gun | 25 damage, 0.45 s cooldown | Two hits sink a Chaser (40 HP), three a Shooter (65 HP) |
| Broadside | 3 × 20 damage, 0.95 s cooldown | Strong, but rewards positioning side-on |
| Chaser | 155 px/s, 20 contact damage | Must be shot before it arrives; five contacts sink the player |
| Shooter | 115 px/s, range 390 px, holds at 300 px, 10 damage every 1.7 s, aim tolerance 0.25 rad | Keeps distance and only fires when actually aimed |
| Spawn distance | at least 420 px from the player | Over two seconds of Chaser travel: never unavoidable damage |
| Hull friction | player 1.5/s, enemies 2.5/s | A scraping player keeps about 97 % of cruise speed; pursuers lose ground rounding islands |
| Avoidance | 16 headings, 170 px lookahead, 10 px margin, heading bias 0.2, slowdown 0.4 | About one second of Chaser travel: time to turn, without far islands bending the chase |

## Limitations

- Ships do not collide with each other: enemies can overlap, and a Shooter can sit on the
  player's hull. Only a Chaser's contact with the player has an effect.
- Enemy avoidance is local (170 px ahead, no global path). A player deep in a U-shaped bay
  could hold an enemy at its mouth; the default arena has no such shape.
- Cooldowns are quantised to the fixed step, so over a long window the fire rate can fall
  one shot short of the continuous-time ideal; it never exceeds it.
- Rounded rectangle corners leave a few pixels of collision outside the island art.
- Sounds ship as the provided WAV files (about 5 MB, loaded with the first match). A
  compressed format would cut the download, but decoding support for compressed audio in
  `decodeAudioData` varies across browsers, so the lossless originals were kept.
- The mock API's data lives in the browser: records registered on one device are not
  visible on another, and the fixtures stand in for other players.
- Visual regression baselines are rendered per platform (Playwright names them by OS), so a
  new platform needs its own baselines.
