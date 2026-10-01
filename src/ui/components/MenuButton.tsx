import type { ButtonHTMLAttributes } from 'react'
import type { UiSound } from '../../game/assets/manifest'
import { playUiSound } from '../uiSounds'

interface MenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary'
  /** Sound played on activation. */
  readonly sound?: UiSound
}

/** A button drawn with the UI atlas art (normal, hover, pressed and disabled states). */
export function MenuButton({
  variant = 'primary',
  sound = 'ui_click',
  className,
  onClick,
  type = 'button',
  ...rest
}: MenuButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`menu-button menu-button-${variant}${className ? ` ${className}` : ''}`}
      onPointerEnter={() => playUiSound('ui_hover', 0.2)}
      onClick={(event) => {
        playUiSound(sound)
        onClick?.(event)
      }}
    />
  )
}
