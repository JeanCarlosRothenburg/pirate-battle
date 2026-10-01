import type { Simulation } from '../sim/simulation'

export interface EventCounts {
  playerFrontShots: number
  playerSideShots: number
  enemyShots: number
  enemiesHitByPlayer: number
  playerHits: number
  scoredKills: number
  chaserSelfDestructs: number
  islandHits: number
  playerScrapes: number
  enemyScrapes: number
}

/**
 * Counts simulation events across a match (an Observer of every fixed step). Tests read it
 * to check cooldowns, damage and scoring without relying on rendered pixels.
 */
export class EventTally {
  readonly counts: EventCounts = {
    playerFrontShots: 0,
    playerSideShots: 0,
    enemyShots: 0,
    enemiesHitByPlayer: 0,
    playerHits: 0,
    scoredKills: 0,
    chaserSelfDestructs: 0,
    islandHits: 0,
    playerScrapes: 0,
    enemyScrapes: 0,
  }

  /** Adds the events of one fixed step. */
  onStep(simulation: Simulation): void {
    const c = this.counts
    for (const event of simulation.events) {
      switch (event.type) {
        case 'shot':
          if (event.faction === 'enemy') c.enemyShots++
          else if (event.weapon === 'side') c.playerSideShots++
          else c.playerFrontShots++
          break
        case 'hit':
          if (event.surface === 'island') c.islandHits++
          else if (event.faction === 'player') c.enemiesHitByPlayer++
          else c.playerHits++
          break
        case 'enemyKilled':
          if (event.scored) c.scoredKills++
          else if (event.cause === 'selfDestruct') c.chaserSelfDestructs++
          break
        case 'scrape':
          if (event.faction === 'player') c.playerScrapes++
          else c.enemyScrapes++
          break
        default:
          break
      }
    }
  }
}
