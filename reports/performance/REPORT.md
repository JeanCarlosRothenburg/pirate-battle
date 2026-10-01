# Performance report

Measured with `npm run perf` (`perf/profile.perf.ts`) on 2026-10-01. Raw data, including
the entity statistics and every memory sample: [profile.json](profile.json).

## Reference environment

| Item | Value |
| --- | --- |
| Hardware | Apple M1 (8-core CPU, 7-core GPU), 8 GB RAM |
| OS | macOS 15.3.2 |
| Browser | Google Chrome 154.0.8037.59, headless, rendering on the GPU (ANGLE Metal: Apple M1) |
| Build | Optimised production build (`vite build`), served by `vite preview` |
| Resolution | 1280 × 720 CSS px, device pixel ratio 1 |

Playwright's bundled Chromium renders WebGL in software (SwiftShader) when headless, so the
profile uses the installed Chrome, which keeps the real GPU even headless.

## Match configuration

| Setting | Value |
| --- | --- |
| Session time | 180 s (the maximum) |
| Enemy spawn interval | 3 s (the default) |
| Seed | 7 |
| Input | W + D + Space + Q held all match: the ship circles while firing its bow gun and port broadside |
| Player health | Sustained by the profiling hook (`sustainPlayer`), so the match runs its full three minutes; every other system runs unchanged |

## Combat: a three-minute match

| Metric | Result |
| --- | --- |
| Duration measured | 179.9 s, 10 796 frames |
| Average frame rate | **60 FPS** (target 60) |
| Frame time p50 / p95 / p99 / max | 16.7 / **16.7** / 16.8 / 16.8 ms |
| Frames over 25 ms | 0 |
| Main-thread time per frame | 0.94 ms (0.60 ms of it script), about 6 % of the 16.7 ms budget |
| Enemies alive | 5.5 on average, 10 at most |
| Projectiles in flight | 4.9 on average, 11 at most |
| Entities at most (player, enemies, projectiles) | 21 |

The frame rate holds at the display's 60 Hz for the whole match with no long frames. The
main-thread cost shows the headroom behind that number: the simulation, rendering commands,
HUD and audio take under 1 ms per frame.

## Memory: five play-and-leave cycles

Each cycle starts a match from the menu, plays 15 s with the same input, pauses, returns to
the menu, waits 1 s, forces two garbage collections and samples Chrome's metrics.

| After | JS heap used | DOM nodes | Event listeners | Canvases left |
| --- | --- | --- | --- | --- |
| Menu, before any match | 4.12 MB | 102 | 162 | 0 |
| Cycle 1 | 8.27 MB | 105 | 183 | 0 |
| Cycle 2 | 8.45 MB | 105 | 184 | 0 |
| Cycle 3 | 8.54 MB | 105 | 184 | 0 |
| Cycle 4 | 8.64 MB | 105 | 183 | 0 |
| Cycle 5 | 8.67 MB | 105 | 184 | 0 |

**Reading.** The jump after the first match is the code and data that load with it and stay
cached on purpose: the PixiJS chunk, the parsed atlases and textures, and the decoded audio
buffers, which every later match reuses. After that, DOM nodes stay at 105, listeners
fluctuate by one between samples (183 or 184) with no upward trend, and no canvas survives
leaving a match: sessions release their listeners, ticker and display tree, and the
Pixi application is destroyed with its renderer and canvas.
The heap grows 0.40 MB over cycles 1 to 5 in shrinking steps (+0.18, +0.09, +0.10,
+0.03 MB), the pattern of caches and JIT state settling rather than of a leak, which would
add a similar amount every cycle. The cycles' matches are abandoned, so they add no records.

## Limitations

- Headless Chrome paces frames to 60 Hz, so the frame rate cannot show headroom above 60
  FPS; the main-thread time per frame is the better headroom measure. GPU time per frame is
  not measured.
- Measured at device pixel ratio 1. High-density screens render with a resolution capped at
  2, which costs more fill rate.
- The steady player keeps killing enemies, so at most 10 were alive (the cap is 18); a
  denser arena was not profiled.
- One machine, one browser. First-load download time (about 5 MB of WAV sounds with the
  first match) is outside this measurement.
