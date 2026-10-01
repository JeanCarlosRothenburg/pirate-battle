import { z } from 'zod'
import { STORAGE_KEYS, readStored, writeStored } from './localStore'

const playerSchema = z.object({ id: z.string().min(1) })

/**
 * A stable id for this browser's player, created on first use. Match records carry it, so
 * a player's history survives name changes.
 */
export function loadPlayerId(storage: Storage | null, newId: () => string = randomId): string {
  const stored = readStored(storage, STORAGE_KEYS.player, playerSchema)
  if (stored !== null) return stored.id
  const id = newId()
  writeStored(storage, STORAGE_KEYS.player, { id })
  return id
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
