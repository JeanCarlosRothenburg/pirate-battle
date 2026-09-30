export interface Letterbox {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Fits the arena inside the screen, preserving aspect ratio and centring it. Screen units
 * are CSS pixels, the same units pointer events use.
 */
export function fitLetterbox(
  screenWidth: number,
  screenHeight: number,
  arenaWidth: number,
  arenaHeight: number,
  out: Letterbox = { scale: 1, offsetX: 0, offsetY: 0 },
): Letterbox {
  out.scale = Math.min(screenWidth / arenaWidth, screenHeight / arenaHeight)
  out.offsetX = (screenWidth - arenaWidth * out.scale) / 2
  out.offsetY = (screenHeight - arenaHeight * out.scale) / 2
  return out
}

/** Converts a point in screen CSS pixels to arena coordinates. */
export function screenToArena(
  box: Letterbox,
  screenX: number,
  screenY: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = (screenX - box.offsetX) / box.scale
  out.y = (screenY - box.offsetY) / box.scale
  return out
}
