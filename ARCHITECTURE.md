# Architecture

## Layering

```
src/game/config   typed balancing values and documented option bounds
src/game/sim      pure simulation: entities, pools, RNG, clock, broadphase, loop
src/game/systems  movement, collision, combat, enemy behaviour, spawning
src/game/render    PixiJS views driven by simulation state (pending)
src/game/input     keyboard and touch sources producing InputIntent (pending)
src/game/bridge    HUD publishing and test instrumentation (pending)
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
in the arena configuration, independent of the island artwork. Ship movement resolves each
axis separately, so a ship slides along an island rather than sticking to it.

Projectiles use a swept segment-versus-circle test. At 540 px/s a projectile travels 9 px
per step, further than its own radius, so a point test would tunnel through small targets.

Projectile-versus-enemy queries go through a uniform grid broadphase with 128 px cells,
rebuilt each step into pre-allocated arrays.

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

## Open decisions

- Island shapes approximate the artwork; the trade-off buys a predictable collision cost.
- Cooldowns are quantised to the fixed step, so the observed fire rate can fall one shot
  short of the continuous-time ideal over a long window. It never exceeds it.
