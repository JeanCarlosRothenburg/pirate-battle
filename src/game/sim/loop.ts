import type { Simulation } from './simulation'
import type { InputIntent } from './types'

export const FIXED_STEP_SECONDS = 1 / 60

export const MAX_FRAME_SECONDS = 0.25

/**
 * Advances the simulation in fixed 1/60 s steps through an accumulator, so movement, damage,
 * cooldowns and spawns do not depend on the frame rate. Frames longer than 0.25 s are
 * clamped, so a backgrounded tab cannot replay a burst of simulation on return.
 */
export class FixedStepRunner {
  private accumulator = 0
  private stepsLastFrame = 0

  constructor(private readonly step: number = FIXED_STEP_SECONDS) {}

  /**
   * Returns the interpolation alpha to use when rendering this frame.
   *
   * `simulation.events` only holds the latest step's events, so `onStep` runs after every
   * step to let a consumer read them before the next step clears them.
   */
  advance(
    simulation: Simulation,
    frameSeconds: number,
    intent: InputIntent,
    onStep?: (simulation: Simulation) => void,
  ): number {
    this.accumulator += Math.min(frameSeconds, MAX_FRAME_SECONDS)
    this.stepsLastFrame = 0
    while (this.accumulator >= this.step) {
      simulation.step(this.step, intent)
      onStep?.(simulation)
      this.accumulator -= this.step
      this.stepsLastFrame++
    }
    return this.accumulator / this.step
  }

  /** Called on resume so the paused period cannot be replayed as movement. */
  clear(): void {
    this.accumulator = 0
    this.stepsLastFrame = 0
  }

  get lastStepCount(): number {
    return this.stepsLastFrame
  }
}
