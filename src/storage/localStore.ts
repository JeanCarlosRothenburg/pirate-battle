import type { ZodType } from 'zod'

export const STORAGE_KEYS = {
  options: 'pirate-battle:options:v1',
  player: 'pirate-battle:player:v1',
  lastResult: 'pirate-battle:last-result:v1',
  view: 'pirate-battle:view:v1',
  pendingMatches: 'pirate-battle:pending-matches:v1',
} as const

/**
 * Reads and validates a stored JSON value. Every key is versioned, so a schema change moves
 * to a new key. Missing, unreadable or invalid data (older
 * versions, manual edits, private browsing without storage) yields `null` instead of
 * breaking the app.
 */
export function readStored<T>(storage: Storage | null, key: string, schema: ZodType<T>): T | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Writes a JSON value. Returns false when storage is unavailable or full. */
export function writeStored(storage: Storage | null, key: string, value: unknown): boolean {
  if (storage === null) return false
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Removes a stored value. Returns false when storage is unavailable, where there is nothing to remove. */
export function removeStored(storage: Storage | null, key: string): boolean {
  try {
    storage?.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** The page's localStorage, or null where it is blocked (some privacy modes throw on access). */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
