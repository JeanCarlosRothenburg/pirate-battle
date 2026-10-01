import { z } from 'zod'
import { DEFAULT_GAME_CONFIG, buildConfig } from '../game/config/gameConfig'
import type { GameConfig } from '../game/config/gameConfig'
import { SESSION_SECONDS_LIMITS, SPAWN_INTERVAL_LIMITS } from '../game/config/limits'
import { STORAGE_KEYS, readStored, writeStored } from './localStore'

export const PLAYER_NAME_MAX = 16

export const optionsSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(1, 'Enter a name for the ranking.')
    .max(PLAYER_NAME_MAX, `Use at most ${PLAYER_NAME_MAX} characters.`),
  sessionSeconds: z
    .number({ invalid_type_error: 'Enter a number of seconds.' })
    .int('Use whole seconds.')
    .min(SESSION_SECONDS_LIMITS.min, `Use at least ${SESSION_SECONDS_LIMITS.min} seconds.`)
    .max(SESSION_SECONDS_LIMITS.max, `Use at most ${SESSION_SECONDS_LIMITS.max} seconds.`),
  spawnIntervalSeconds: z
    .number({ invalid_type_error: 'Enter a number of seconds.' })
    .positive('The interval must be positive.')
    .min(SPAWN_INTERVAL_LIMITS.min, `Use at least ${SPAWN_INTERVAL_LIMITS.min} seconds.`)
    .max(SPAWN_INTERVAL_LIMITS.max, `Use at most ${SPAWN_INTERVAL_LIMITS.max} seconds.`),
})

export type PlayerOptions = z.infer<typeof optionsSchema>

export const DEFAULT_OPTIONS: PlayerOptions = {
  playerName: 'Captain',
  sessionSeconds: DEFAULT_GAME_CONFIG.sessionSeconds,
  spawnIntervalSeconds: DEFAULT_GAME_CONFIG.spawn.intervalSeconds,
}

/**
 * The saved player options, or the defaults. The brief requires the two gameplay options
 * (session time and spawn interval, validated against their documented limits); the player
 * name is added because the ranking must identify players.
 */
export function loadOptions(storage: Storage | null): PlayerOptions {
  return readStored(storage, STORAGE_KEYS.options, optionsSchema) ?? DEFAULT_OPTIONS
}

export function saveOptions(storage: Storage | null, options: PlayerOptions): boolean {
  return writeStored(storage, STORAGE_KEYS.options, options)
}

/** The configuration a new match freezes at start. */
export function gameConfigFor(options: PlayerOptions): GameConfig {
  return buildConfig({
    sessionSeconds: options.sessionSeconds,
    spawnIntervalSeconds: options.spawnIntervalSeconds,
  })
}
