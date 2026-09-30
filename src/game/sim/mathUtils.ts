export const TAU = Math.PI * 2

export function wrapAngle(angle: number): number {
  let a = (angle + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}

export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from)
}

export function turnToward(current: number, target: number, maxStep: number): number {
  const delta = angleDelta(current, target)
  if (Math.abs(delta) <= maxStep) return wrapAngle(target)
  return wrapAngle(current + Math.sign(delta) * maxStep)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distanceSquared(ax, ay, bx, by))
}

export function moveToward(current: number, target: number, maxStep: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxStep) return target
  return current + Math.sign(delta) * maxStep
}
