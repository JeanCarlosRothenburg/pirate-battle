import { formatClockPadded, formatPlayedAt } from './format'

describe('format', () => {
  it('formats durations', () => {
    expect(formatClockPadded(120)).toBe('02:00')
    expect(formatClockPadded(78.4)).toBe('01:18')
  })

  it('formats a played date as day, short month and 24-hour time', () => {
    const local = new Date(2026, 8, 8, 21, 42)
    expect(formatPlayedAt(local.toISOString())).toEqual({ day: '08 SEP', time: '21:42' })
  })
})
