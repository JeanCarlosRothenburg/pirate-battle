import { FIXED_STEP_SECONDS, FixedStepRunner } from '../sim/loop'
import type { Simulation } from '../sim/simulation'
import type { InputIntent } from '../sim/types'

export type StepListener = (simulation: Simulation) => void

export interface MatchClock {
  readonly realTime: boolean
  /** Advances the match for one rendered frame and returns the interpolation alpha. */
  advance(simulation: Simulation, frameSeconds: number, intent: InputIntent, onStep: StepListener): number
  /** Drops pending time, e.g. on resume, so a paused period is never replayed. */
  clear(): void
}

/** Real time: frame time feeds a fixed-step accumulator (60 steps per second). */
export class RealTimeClock implements MatchClock {
  readonly realTime = true
  private readonly runner = new FixedStepRunner()

  advance(simulation: Simulation, frameSeconds: number, intent: InputIntent, onStep: StepListener): number {
    return this.runner.advance(simulation, frameSeconds, intent, onStep)
  }

  clear(): void {
    this.runner.clear()
  }
}

/**
 * Test-controlled time: frames render but never advance the simulation; `step` runs whole
 * fixed steps on demand, reading the live input for each one, so rules, inputs and
 * collisions run exactly as in real time.
 */
export class ManualClock implements MatchClock {
  readonly realTime = false

  advance(): number {
    return 1
  }

  clear(): void {}

  /** Runs `seconds` of simulation now, in fixed steps, returning how many ran. */
  step(seconds: number, simulation: Simulation, readIntent: () => InputIntent, onStep: StepListener): number {
    const steps = Math.round(seconds / FIXED_STEP_SECONDS)
    for (let i = 0; i < steps; i++) {
      simulation.step(FIXED_STEP_SECONDS, readIntent())
      onStep(simulation)
    }
    return steps
  }
}
