/** Whole seconds as mm:ss, rounded down (time actually played), as in the samples: "02:00". */
export function formatClockPadded(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`
}

const dateParts = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "08 SEP" and "21:42", in the player's time zone. */
export function formatPlayedAt(iso: string): { readonly day: string; readonly time: string } {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return {
    day: `${parts['day'] ?? ''} ${(parts['month'] ?? '').toUpperCase()}`,
    time: `${parts['hour'] ?? ''}:${parts['minute'] ?? ''}`,
  }
}
