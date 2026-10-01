import { useEffect, useRef, useState } from 'react'
import { isAudioMuted, setAudioMuted } from '../../game/audio/soundBank'
import { MenuButton } from '../components/MenuButton'
import { playUiSound } from '../uiSounds'

interface PauseDialogProps {
  readonly open: boolean
  /** The device is upright; matches resume only in landscape. */
  readonly rotateToResume?: boolean
  readonly onResume: () => void
  readonly onMainMenu: () => void
}

/**
 * Modal pause menu. `showModal` makes the rest of the page inert, traps focus inside the
 * dialog and moves focus to the first control. Esc and P resume, like the keys that paused.
 *
 * Held upright, a touch device cannot resume (matches are played in landscape), so the
 * dialog shrinks to that one message and a way out. Turning the device back shows the full
 * pause menu, where Resume is still the player's choice.
 */
export function PauseDialog({ open, rotateToResume = false, onResume, onMainMenu }: PauseDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [muted, setMuted] = useState(isAudioMuted)

  useEffect(() => {
    const el = dialog.current
    if (el === null) return
    if (open && !el.open) {
      setMuted(isAudioMuted())
      el.showModal()
      playUiSound('ui_open')
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  // The content swaps when the device turns; keep focus inside the dialog on its first control.
  useEffect(() => {
    if (dialog.current?.open) dialog.current.querySelector<HTMLButtonElement>('button')?.focus()
  }, [rotateToResume])

  const resume = (): void => {
    if (rotateToResume) return
    playUiSound('ui_close')
    onResume()
  }

  return (
    <dialog
      ref={dialog}
      className="panel pause-dialog"
      aria-labelledby="pause-title"
      onCancel={(event) => {
        event.preventDefault()
        resume()
      }}
      onKeyDown={(event) => {
        if (event.code === 'KeyP' && !event.repeat) resume()
      }}
    >
      {rotateToResume ? (
        <>
          <h2 id="pause-title" className="panel-title">
            Turn your device
          </h2>
          <span className="rotate-icon" aria-hidden="true" />
          <p className="rotate-note">Pirate Battle is played in landscape. The match is paused.</p>
          <div className="form-actions">
            <MenuButton variant="secondary" sound="ui_back" onClick={onMainMenu}>
              Main Menu
            </MenuButton>
          </div>
        </>
      ) : (
        <>
          <h2 id="pause-title" className="panel-title">
            Paused
          </h2>
          <p className="pause-note">The timer, cooldowns and enemies are stopped.</p>
          <div className="form-actions">
            <MenuButton autoFocus sound="ui_close" onClick={onResume}>
              Resume
            </MenuButton>
            <MenuButton
              variant="secondary"
              aria-pressed={muted}
              onClick={() => {
                setAudioMuted(!muted)
                setMuted(!muted)
              }}
            >
              {muted ? 'Sound off' : 'Sound on'}
            </MenuButton>
            <MenuButton variant="secondary" sound="ui_back" onClick={onMainMenu}>
              Main Menu
            </MenuButton>
          </div>
          <p className="pause-note">Leaving to the main menu abandons the match; it is not recorded.</p>
        </>
      )}
    </dialog>
  )
}
