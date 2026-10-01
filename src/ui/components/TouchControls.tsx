import type { PointerEvent } from 'react'
import type { TouchAction, TouchButtons } from '../../game/input/touch'

const LEFT: readonly (readonly [TouchAction, string, string])[] = [
  ['left', 'Turn left', 'turn-left'],
  ['forward', 'Sail forward', 'forward'],
  ['right', 'Turn right', 'turn-right'],
]
const RIGHT: readonly (readonly [TouchAction, string, string])[] = [
  ['fireLeft', 'Port broadside', 'fire-left'],
  ['fireFront', 'Bow gun', 'fire-front'],
  ['fireRight', 'Starboard broadside', 'fire-right'],
]

/**
 * Hold-to-act buttons for touch screens, shown only where a coarse pointer exists. Each
 * button captures its own pointer, so sliding a finger off it, lifting it, or the browser
 * cancelling the touch all release the action; several buttons work at once.
 */
export function TouchControls({ touch }: { readonly touch: TouchButtons }) {
  const handlers = (action: TouchAction) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      capturePointer(event.currentTarget, event.pointerId)
      touch.press(action)
    },
    onPointerUp: () => touch.release(action),
    onPointerCancel: () => touch.release(action),
    onLostPointerCapture: () => touch.release(action),
    onContextMenu: (event: { preventDefault(): void }) => event.preventDefault(),
  })

  const cluster = (buttons: typeof LEFT, side: string) => (
    <div className={`touch-cluster touch-${side}`}>
      {buttons.map(([action, label, icon]) => (
        <button key={action} type="button" tabIndex={-1} aria-label={label} className={`touch-button touch-${icon}`} {...handlers(action)}>
          <span className={`hud-icon touch-icon-${icon}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  )

  return (
    <div className="touch-controls">
      {cluster(LEFT, 'left')}
      {cluster(RIGHT, 'right')}
    </div>
  )
}

/**
 * Captures the pointer on the button, so sliding off still releases the action. It fails if
 * the pointer is already gone; the press then still counts until its pointerup.
 */
function capturePointer(element: Element, pointerId: number): boolean {
  try {
    element.setPointerCapture(pointerId)
    return true
  } catch {
    return false
  }
}
