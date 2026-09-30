export const SESSION_SECONDS_LIMITS = { min: 60, max: 180, step: 5 } as const

export const SPAWN_INTERVAL_LIMITS = { min: 0.5, max: 10, step: 0.5 } as const

export function clampSessionSeconds(value: number): number {
  return clamp(value, SESSION_SECONDS_LIMITS.min, SESSION_SECONDS_LIMITS.max)
}

export function clampSpawnInterval(value: number): number {
  return clamp(value, SPAWN_INTERVAL_LIMITS.min, SPAWN_INTERVAL_LIMITS.max)
}

export function isValidSessionSeconds(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= SESSION_SECONDS_LIMITS.min &&
    value <= SESSION_SECONDS_LIMITS.max
  )
}

export function isValidSpawnInterval(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    value >= SPAWN_INTERVAL_LIMITS.min &&
    value <= SPAWN_INTERVAL_LIMITS.max
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
