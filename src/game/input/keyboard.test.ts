import { KeyboardInput } from './keyboard'
import type { InputCommand } from './keyboard'

function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  return Object.assign(new Event(type, { cancelable: true }), { code, repeat })
}

describe('KeyboardInput', () => {
  let target: EventTarget
  let input: KeyboardInput

  beforeEach(() => {
    target = new EventTarget()
    input = new KeyboardInput(target)
  })

  afterEach(() => input.dispose())

  it('reads neutral with no keys held', () => {
    expect(input.read()).toMatchObject({ throttle: 0, turn: 0, fireFront: false, fireLeft: false, fireRight: false })
  })

  it('maps held keys to throttle, turn and weapons', () => {
    target.dispatchEvent(key('keydown', 'KeyW'))
    target.dispatchEvent(key('keydown', 'KeyA'))
    target.dispatchEvent(key('keydown', 'Space'))
    target.dispatchEvent(key('keydown', 'KeyE'))
    expect(input.read()).toMatchObject({ throttle: 1, turn: -1, fireFront: true, fireLeft: false, fireRight: true })

    target.dispatchEvent(key('keyup', 'KeyW'))
    expect(input.read().throttle).toBe(0)
    target.dispatchEvent(key('keydown', 'ArrowUp'))
    expect(input.read().throttle).toBe(1)
  })

  it('has no reverse binding', () => {
    const back = key('keydown', 'KeyS')
    target.dispatchEvent(back)
    target.dispatchEvent(key('keydown', 'ArrowDown'))
    expect(input.read().throttle).toBe(0)
    expect(back.defaultPrevented).toBe(false)
  })

  it('cancels opposing keys', () => {
    target.dispatchEvent(key('keydown', 'KeyA'))
    target.dispatchEvent(key('keydown', 'KeyD'))
    expect(input.read().turn).toBe(0)
  })

  it('prevents default only for bound keys', () => {
    const bound = key('keydown', 'Space')
    const unbound = key('keydown', 'KeyZ')
    target.dispatchEvent(bound)
    target.dispatchEvent(unbound)
    expect(bound.defaultPrevented).toBe(true)
    expect(unbound.defaultPrevented).toBe(false)
  })

  it('releases held keys on blur', () => {
    target.dispatchEvent(key('keydown', 'KeyW'))
    target.dispatchEvent(new Event('blur'))
    expect(input.read().throttle).toBe(0)
  })

  it('emits commands once per press, ignoring auto-repeat', () => {
    const commands: InputCommand[] = []
    input.onCommand = (command) => commands.push(command)
    target.dispatchEvent(key('keydown', 'Enter'))
    target.dispatchEvent(key('keydown', 'Enter', true))
    target.dispatchEvent(key('keydown', 'KeyP'))
    expect(commands).toEqual(['confirm', 'togglePause'])
  })

  it('stops listening after dispose', () => {
    input.dispose()
    target.dispatchEvent(key('keydown', 'KeyW'))
    expect(input.read().throttle).toBe(0)
  })
})
