import type { Simulation } from './simulation'
import type { InputIntent } from './types'

export const FIXED_STEP_SECONDS = 1 / 60

/** Longest frame fed into the accumulator, so a backgrounded tab cannot spiral. */
export const MAX_FRAME_SECONDS = 0.25

export class FixedStepRunner {
  private accumulator = 0
  private stepsLastFrame = 0

  constructor(private readonly step: number = FIXED_STEP_SECONDS) {}

  /** Returns the interpolation alpha to use when rendering this frame. */
  advance(simulation: Simulation, frameSeconds: number, intent: InputIntent): number {
    this.accumulator += Math.min(frameSeconds, MAX_FRAME_SECONDS)
    this.stepsLastFrame = 0
    while (this.accumulator >= this.step) {
      simulation.step(this.step, intent)
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
