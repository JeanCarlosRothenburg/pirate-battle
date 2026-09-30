# Architecture

## Layering

```
src/game/config   typed balancing values and documented option bounds
src/game/sim      pure simulation: entities, pools, RNG, clock, broadphase, loop
src/game/systems  movement, collision, combat, enemy behaviour, obstacle avoidance, spawning
src/game/assets    asset manifest, loading with progress and retry, atlas conversion
src/game/audio     Web Audio sound bank shared across mounts
src/game/render    PixiJS views and effects driven by simulation state
src/game/input     keyboard, pointer and touch sources producing InputIntent (touch pending)
src/game/bridge    Pixi lifecycle, HUD publishing, event-driven audio (test instrumentation pending)
src/ui             React screens, forms, dialogs (pending)
src/api            typed contracts, Axios client, TanStack Query hooks (pending)
src/mocks          MSW handlers, fixtures and network scenarios (pending)
```

`sim/` and `systems/` import no rendering, React, HTTP or browser globals. That boundary
is what makes the rules unit-testable in Node and reproducible under test instrumentation.

## Simulation loop

The simulation advances in fixed steps of 1/60 s through an accumulator
(`FixedStepRunner`). Rendering frame time never reaches the physics, so movement, damage,
cooldowns and spawns behave identically at 30, 60 or 144 Hz. Frames longer than 250 ms are
clamped, which prevents a backgrounded tab from replaying a burst of simulation on return.
`clear()` empties the accumulator on resume, so a paused period cannot become movement.

Each step stores the previous transform of every entity. The renderer interpolates between
the previous and current transform using the leftover accumulator ratio, which removes the
stutter that a fixed step would otherwise show on high-refresh displays.

## Match state

`idle → running ⇄ paused → ended`. `step` returns immediately outside `running`, so a single
guard enforces that ending or pausing a match suspends movement, attacks, damage, spawns
and scoring. Cooldowns and the match timer are measured in simulation time rather than wall
time, so pausing them requires no extra logic.

## Determinism

A `mulberry32` generator seeded per match drives spawn placement and type selection. The
clock is injected, entity arrays are dense and iterated in stable order, and removal uses
compaction rather than index-dependent splicing.

## Collisions

Ships and projectiles are circles; islands are circles and axis-aligned rectangles declared
in the arena configuration, independent of the island artwork.

Ship movement slides tangentially along the contact surface (`resolveCircleMove`), and the
player and enemies share the same resolution:

1. A ship that starts a step overlapping an island is pushed out along the surface normal,
   so no step can end inside one.
2. The step's move advances to the moment it would first enter an island, found by
   bisection. Moves are at most a few pixels per step against radii of 20 px or more, so
   the end position is enough to detect an entry without tunnelling.
3. The surface normal at that point (`surfaceNormal`) comes from the circle centre, or from
   the nearest point of a rectangle. Rounded around corners, it gives smooth sliding.
4. The rest of the move keeps only its tangential part, `slide = move - n * dot(move, n)`,
   scaled by hull friction. The tangent comes from the move itself, so a ship angled toward
   one side of an island scrapes toward that side, and a head-on move stops.
5. If the slid position still collides, for example in a pocket between two islands, the
   ship stays where it started the step.

`ship.speed` is the thrust along the heading, not the ship's actual velocity while it
scrapes. Contact removes the part of each step's movement that pushes into the island,
without zeroing the speed; otherwise a ship pressing at an angle against a flat face would
bleed speed every step and grind to a crawl. Hull friction (`hullFriction`, a fraction of
tangential speed lost per second, player 1.5 and enemies 2.5) takes the same share from the
slide and from the stored speed. With the throttle held, a scraping player keeps about 97 %
of cruise speed along the shore.

Each contact step emits a `scrape` event with the contact point on the island surface and
its strength: the speed lost into the surface, in px/s. The renderer and audio do not
consume it yet.

Projectiles use a swept segment-versus-circle test. At 540 px/s a projectile travels 9 px
per step, further than its own radius, so a point test would tunnel through small targets.

Projectile-versus-enemy queries go through a uniform grid broadphase with 128 px cells,
rebuilt each step into pre-allocated arrays.

## Enemy obstacle avoidance

Enemies steer around islands with context steering (Fray, "Context Steering: Behavior-Driven
Steering at the Macro Scale", *Game AI Pro 2*, ch. 18), a refinement of Reynolds' steering
behaviours (GDC 1999). The AI in `enemyAI.ts` only decides where the enemy wants to go;
`ContextSteering` in `obstacleAvoidance.ts` then bends that heading around obstacles before the
ship turns.

Each step it fills two maps over 16 headings around the ship:

- **interest**: cosine falloff toward the desired heading, plus a small bias toward the
  current heading so a ship facing an island head-on keeps the detour it started instead of
  flipping sides between steps;
- **danger**: for each heading, a ray as wide as the hull plus a margin is cast up to the
  lookahead; the closer an island (circle, or rectangle grown by the reach) or arena wall,
  the higher the danger.

Headings noticeably more dangerous than the safest one are masked. The most interesting
remaining heading wins, and a parabolic fit between neighbouring slots refines it to a
continuous angle. Throttle drops with the danger of the chosen heading, so ships turn tighter
near islands.

When the direct line to the goal is clear up to the goal itself, the desired heading is used
unchanged. Unobstructed enemies behave exactly as before, and a Shooter's aim stays
exact. Avoidance only runs while an enemy is under way, so a Shooter holding at its preferred
range keeps aiming at the player. The steering pass is deterministic, runs in simulation time
and allocates nothing: its buffers are created once per match.

Avoidance and contact physics use the same shapes, so they agree: avoidance keeps enemies
clear of islands, and if one still touches (say, cornered against a wall), tangential sliding
handles the contact exactly as for the player.

Why this over the alternatives:

| Approach | Why not here |
| --- | --- |
| Reynolds obstacle avoidance (single "most threatening" obstacle, lateral push) | Blended with seek, the two vectors can cancel head-on; the result oscillates or stalls |
| Ray "whiskers" | Few fixed rays miss obstacles between them and need special cases to pick a side |
| Potential fields | Local minima directly behind round obstacles: the exact case of an island between enemy and player |
| RVO/ORCA | Designed for moving agents avoiding each other, not static geometry |
| A* on a grid or navmesh | Global and exact, but heavy for five convex islands; worth it only for mazes or concave bays |

## Damage and scoring

Each projectile carries an `alive` flag cleared the moment it applies damage, and the
sweep skips dead projectiles, so a projectile can never damage twice. Enemies destroyed by
player projectiles award one point. A Chaser that destroys itself against the player's hull
damages the player and awards nothing; the two cases are distinguished by a `DeathCause`
recorded when the enemy dies.

## Memory

Ships and projectiles come from pre-allocated pools and are mutated in place. Nothing is
allocated inside the step, which keeps garbage collection out of the frame budget and keeps
the 95th-percentile frame time stable. `reset()` returns every entity to its pool, so
repeated match cycles do not grow the heap.

## Input

Input sources write into one reused `InputIntent` each frame; the simulation reads it and
knows nothing about devices.

- **Keyboard** (`KeyboardInput`): W sails forward, A/D turn, Space and Q/E fire, and
  commands (Enter, P/Esc, M) arrive as events. Keys are bound by `KeyboardEvent.code`, so
  the layout does not matter.
- **Pointer** (`PointerSteering`): slither.io-style steering. The pointer position over the
  canvas, in CSS pixels, is converted to arena coordinates through the same letterbox the
  renderer uses (`fitLetterbox` / `screenToArena`), and passed as a target point rather than
  an angle. The simulation re-aims at that point every fixed step from the ship's current
  position, turning at the ship's turn rate, so aiming stays exact when a frame runs several
  steps. Inside a dead zone of one hull radius the heading holds, so a pointer resting on the
  ship does not spin it.
- **Priority:** keyboard turning overrides the pointer while A/D is held, and the pointer
  only takes over again when it next moves; otherwise releasing the key would swing the ship
  back toward a stale pointer position. Keeping A/D also meets the requirement for keyboard
  rotation and keeps the game playable without a mouse.

## Assets and rendering

`loadGameAssets` loads everything a match needs before combat can start: the ships atlas,
the UI atlas, the tile sheet, three seamless tiles and the game sounds. It reports progress
to the React loading screen. A failure shows an error with a Retry button, and Pixi's loader
drops failed entries from its cache, so a retry refetches only what failed. The loaded
textures and audio buffers are cached for the page's lifetime, and restarts and remounts
reuse them. Unmounting destroys the display tree and its Graphics contexts but never the
shared textures.

Files are imported through Vite (`?url`, `?raw`, JSON), so the build fingerprints them. The
UI and tile art switch to their 2× variants on high-density screens. The ships atlas ships in
Starling XML, which Pixi does not read, so `parseTextureAtlasXml` converts it to spritesheet
data at load time; the provided file stays the single source.

The renderer reads the simulation and never writes to it. Ships use the atlas sprites with a
colour per kind (player blue, Chaser red, Shooter black) and swap between intact, damaged and
heavily damaged art at 2/3 and 1/3 health; heavily damaged ships burn. Destroyed ships leave
a sinking wreck. Health bars above every ship use the UI atlas frame and fills, clipped to
twenty precomputed widths so no texture is created per frame. Projectiles are pooled sprites
with trails drawn into one Graphics per faction. Muzzle flashes, impacts, debris and
explosions come from a fixed pool of sprites, with seeded randomness so screenshots are
reproducible. Effects advance on frame time but freeze while the match is paused.

`simulation.events` only holds the latest step's events, and one frame can run several
steps. `FixedStepRunner.advance` therefore takes an `onStep` callback, and the renderer and
audio consume each step's events there.

Islands are drawn over their exact collision circles and rectangles, using the sand and
grass tiles as repeating patterns. The tile sheet's prebuilt islands only fit shapes that
are multiples of 64 px, and stretching them tore the art. Ships are long while their
collision shape is a circle: sprites are scaled to 2.8 × the radius in length, so bow and
stern overhang the circle by a few pixels and the beam sits inside it.

## Audio

Sounds play through Web Audio on one page-wide `AudioContext`, since buffers belong to the
context that decoded them. Each mount routes through its own gain node, so unmounting stops
its loops without touching the shared context. The context starts suspended until a user
gesture; the first game command resumes it. `GameAudio` maps simulation events and phase
changes to sounds: cannons, hits, explosions, scoring, low health, the final countdown, start,
pause, resume and end. Ocean and sailing loops play while the match runs. M toggles mute.

## Open decisions

- Islands are drawn from tile patterns over the collision shapes instead of the prebuilt
  tile-sheet islands. Rounded rectangle corners leave a few pixels of collision outside the art.
- Enemies do not collide with each other, so they can overlap while converging on the player.
- Enemy avoidance is local: it sees `lookahead` px ahead and has no global path. A player
  deep in a pocket that can only be reached by first sailing away (a U-shaped bay) could
  hold an enemy at the mouth. The default arena has no such shape.
- Enemies avoid islands and walls, not each other.
- Arena walls are handled by clamping. They slide like any axis-aligned surface but report
  no contact normal or scrape event.
- Sounds ship as the provided WAV files (about 5 MB). Compressing them is a pending optimisation.
- Cooldowns are quantised to the fixed step, so the observed fire rate can fall one shot
  short of the continuous-time ideal over a long window. It never exceeds it.
