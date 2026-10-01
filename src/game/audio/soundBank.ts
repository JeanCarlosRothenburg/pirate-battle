import type { GameSound } from '../assets/manifest'

export type SoundBuffers = ReadonlyMap<GameSound, AudioBuffer>

let sharedContext: AudioContext | null | undefined

/**
 * One AudioContext for the whole page: browsers cap how many can exist, and decoded
 * buffers belong to the context that decoded them. Returns null where Web Audio is missing.
 */
export function getAudioContext(): AudioContext | null {
  if (sharedContext === undefined) {
    try {
      sharedContext = typeof AudioContext === 'undefined' ? null : new AudioContext()
    } catch {
      sharedContext = null
    }
  }
  return sharedContext
}

let pageMuted = false
const muteListeners = new Set<(muted: boolean) => void>()

/** One mute switch for the page: menus and matches share it. */
export function isAudioMuted(): boolean {
  return pageMuted
}

export function setAudioMuted(muted: boolean): void {
  pageMuted = muted
  for (const listener of muteListeners) listener(muted)
}

interface ActiveLoop {
  readonly source: AudioBufferSourceNode
  readonly gain: GainNode
}

/**
 * Plays decoded game sounds through a per-mount master gain, so unmounting silences and
 * disconnects everything this mount started without touching the shared context.
 */
export class SoundBank {
  private readonly master: GainNode | null
  private readonly loops = new Map<GameSound, ActiveLoop>()
  private readonly onMute = (muted: boolean): void => this.applyMute(muted)

  constructor(
    private readonly context: AudioContext | null,
    private readonly buffers: SoundBuffers,
  ) {
    this.master = context?.createGain() ?? null
    if (context !== null && this.master !== null) this.master.connect(context.destination)
    this.applyMute(pageMuted)
    muteListeners.add(this.onMute)
  }

  get isMuted(): boolean {
    return pageMuted
  }

  /** Must run inside a user gesture: browsers start contexts suspended until then. */
  unlock(): void {
    if (this.context?.state === 'suspended') void this.context.resume()
  }

  setMuted(muted: boolean): void {
    setAudioMuted(muted)
  }

  play(name: GameSound, volume = 1): void {
    const node = this.createSource(name, volume)
    node?.source.start()
  }

  /** Starts a loop, or updates its volume if it is already playing. */
  loop(name: GameSound, volume: number): void {
    const active = this.loops.get(name)
    if (active !== undefined) {
      if (this.context !== null) active.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.1)
      return
    }
    const node = this.createSource(name, volume)
    if (node === null) return
    node.source.loop = true
    node.source.start()
    this.loops.set(name, node)
  }

  stopLoop(name: GameSound): void {
    const active = this.loops.get(name)
    if (active === undefined) return
    active.source.stop()
    active.source.disconnect()
    active.gain.disconnect()
    this.loops.delete(name)
  }

  dispose(): void {
    muteListeners.delete(this.onMute)
    for (const name of [...this.loops.keys()]) this.stopLoop(name)
    this.master?.disconnect()
  }

  private applyMute(muted: boolean): void {
    if (this.master !== null && this.context !== null) {
      this.master.gain.setValueAtTime(muted ? 0 : 1, this.context.currentTime)
    }
  }

  private createSource(name: GameSound, volume: number): ActiveLoop | null {
    const buffer = this.buffers.get(name)
    if (this.context === null || this.master === null || buffer === undefined) return null
    const source = this.context.createBufferSource()
    source.buffer = buffer
    const gain = this.context.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(this.master)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    return { source, gain }
  }
}
