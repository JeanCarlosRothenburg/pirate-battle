import { UI_SOUNDS, uiSoundUrl } from '../game/assets/manifest'
import type { UiSound } from '../game/assets/manifest'
import { getAudioContext, isAudioMuted } from '../game/audio/soundBank'

const raw = new Map<UiSound, Promise<ArrayBuffer | null>>()
const decoded = new Map<UiSound, AudioBuffer>()
const decoding = new Set<UiSound>()

/**
 * Fetches the menu sounds without creating an AudioContext: browsers only allow audio after
 * a user gesture, so decoding waits for the first sound actually played. Failures are
 * silent; menus work without sound.
 */
export function preloadUiSounds(): void {
  for (const name of UI_SOUNDS) {
    if (raw.has(name)) continue
    raw.set(
      name,
      fetch(uiSoundUrl(name))
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null),
    )
  }
}

/** Plays a menu sound. Call from user input handlers, which count as gestures. */
export function playUiSound(name: UiSound, volume = 0.5): void {
  if (isAudioMuted()) return
  const context = getAudioContext()
  if (context === null) return
  if (context.state === 'suspended') void context.resume()

  const buffer = decoded.get(name)
  if (buffer !== undefined) {
    const source = context.createBufferSource()
    const gain = context.createGain()
    gain.gain.value = volume
    source.buffer = buffer
    source.connect(gain).connect(context.destination)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    source.start()
    return
  }
  if (decoding.has(name)) return
  decoding.add(name)
  preloadUiSounds()
  void raw
    .get(name)
    ?.then((data) => (data === null ? null : context.decodeAudioData(data.slice(0))))
    .then((audio) => {
      if (audio) decoded.set(name, audio)
    })
    .catch(() => undefined)
}
