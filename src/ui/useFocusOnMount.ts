import { useEffect, useRef } from 'react'

/**
 * Moves focus to a screen's heading when the screen appears, so keyboard and screen reader
 * users land at the start of the new content instead of on a removed element.
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}
