import { describe, it, expect } from 'vitest'
import {
  detectTimezone,
  timezoneOptions,
  TIMEZONES,
  formatTime,
  formatDate,
  formatZoneAbbr,
  dayKey,
  todayKey,
  dayLabel,
  liveState,
  countdown,
} from '../src/utils/time.js'
import { LEAGUE } from '../src/config/league.js'

// A fixed instant so the "today/tomorrow" math is deterministic.
const NOW_ISO = '2026-07-20T12:00:00.000Z'
const NOW = new Date(NOW_ISO)
const NOW_MS = NOW.getTime()

describe('detectTimezone', () => {
  it('returns the platform zone when Intl resolves one', () => {
    // jsdom resolves a real IANA zone; just prove it is a non-empty string.
    expect(typeof detectTimezone()).toBe('string')
    expect(detectTimezone().length).toBeGreaterThan(0)
  })

  it('falls back when the platform reports no zone', () => {
    const orig = Intl.DateTimeFormat
    Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: '' }) })
    try {
      expect(detectTimezone()).toBe('America/New_York')
    } finally {
      Intl.DateTimeFormat = orig
    }
  })

  it('falls back when resolving the zone throws', () => {
    const orig = Intl.DateTimeFormat
    Intl.DateTimeFormat = () => {
      throw new Error('boom')
    }
    try {
      expect(detectTimezone()).toBe('America/New_York')
    } finally {
      Intl.DateTimeFormat = orig
    }
  })
})

describe('timezoneOptions', () => {
  it('returns the picker unchanged for a known zone', () => {
    expect(timezoneOptions('America/New_York')).toBe(TIMEZONES)
  })

  it('prepends an unknown zone with a humanized label', () => {
    const opts = timezoneOptions('America/Argentina/Buenos_Aires')
    expect(opts[0]).toEqual({ id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' })
    expect(opts.slice(1)).toEqual(TIMEZONES)
  })
})

describe('formatting', () => {
  it('formats a wall-clock time in the target zone', () => {
    // 17:00Z is 1:00 PM Eastern.
    expect(formatTime('2026-07-19T17:00:00.000Z', 'America/New_York')).toBe('1:00 PM')
    // …and 10:00 AM Pacific.
    expect(formatTime('2026-07-19T17:00:00.000Z', 'America/Los_Angeles')).toBe('10:00 AM')
  })

  it('formats a date with the default weekday/month/day parts', () => {
    expect(formatDate('2026-07-19T17:00:00.000Z', 'UTC')).toBe('Sun, Jul 19')
  })

  it('honors caller overrides to the date parts', () => {
    expect(formatDate('2026-07-19T17:00:00.000Z', 'UTC', { year: 'numeric' })).toContain('2026')
  })

  it('extracts the short zone abbreviation', () => {
    expect(formatZoneAbbr('2026-07-19T17:00:00.000Z', 'UTC')).toBe('UTC')
  })

  it('returns empty string when no zone-name part is present', () => {
    const orig = Intl.DateTimeFormat
    Intl.DateTimeFormat = function () {
      return { formatToParts: () => [], format: () => '' }
    }
    try {
      expect(formatZoneAbbr('2026-07-19T17:00:00.000Z', 'UTC')).toBe('')
    } finally {
      Intl.DateTimeFormat = orig
    }
  })
})

describe('day keys', () => {
  it('keys a game to the calendar day in the viewer zone', () => {
    // 02:00Z on the 20th is still the 19th on the US west coast.
    expect(dayKey('2026-07-20T02:00:00.000Z', 'UTC')).toBe('2026-07-20')
    expect(dayKey('2026-07-20T02:00:00.000Z', 'America/Los_Angeles')).toBe('2026-07-19')
  })

  it('derives today from the current instant', () => {
    expect(todayKey('UTC', NOW)).toBe('2026-07-20')
  })
})

describe('dayLabel', () => {
  it('labels the current day Today', () => {
    expect(dayLabel('2026-07-20', 'UTC', NOW)).toBe('Today')
  })

  it('labels the next day Tomorrow', () => {
    expect(dayLabel('2026-07-21', 'UTC', NOW)).toBe('Tomorrow')
  })

  it('labels the previous day Yesterday', () => {
    expect(dayLabel('2026-07-19', 'UTC', NOW)).toBe('Yesterday')
  })

  it('spells out any other day', () => {
    expect(dayLabel('2026-08-01', 'UTC', NOW)).toBe('Saturday, August 1')
  })
})

describe('liveState', () => {
  it('is void for a postponed or canceled game', () => {
    expect(liveState({ postponed: true })).toBe('void')
    expect(liveState({ canceled: true })).toBe('void')
  })

  it('is live when the feed flags it live', () => {
    expect(liveState({ live: true })).toBe('live')
  })

  it('is final once a score is committed', () => {
    expect(liveState({ score: [24, 20] })).toBe('final')
  })

  it('is upcoming before kickoff', () => {
    expect(liveState({ tip: '2026-07-20T13:00:00.000Z' }, NOW_MS)).toBe('upcoming')
  })

  it('is likely-live inside the game-length window', () => {
    // Kicked off an hour ago; still inside the 3.5h window.
    const tip = new Date(NOW_MS - 60 * 60 * 1000).toISOString()
    expect(liveState({ tip }, NOW_MS)).toBe('likely-live')
  })

  it('is past once the game-length window has elapsed', () => {
    const tip = new Date(NOW_MS - LEAGUE.gameLengthMs - 1000).toISOString()
    expect(liveState({ tip }, NOW_MS)).toBe('past')
  })
})

describe('countdown', () => {
  it('returns null once the instant is in the past', () => {
    expect(countdown('2026-07-20T11:00:00.000Z', NOW_MS)).toBeNull()
  })

  it('shows days and hours when more than a day away', () => {
    const iso = new Date(NOW_MS + (2 * 1440 + 3 * 60) * 60000).toISOString()
    expect(countdown(iso, NOW_MS)).toBe('2d 3h')
  })

  it('shows hours and minutes within a day', () => {
    const iso = new Date(NOW_MS + (3 * 60 + 20) * 60000).toISOString()
    expect(countdown(iso, NOW_MS)).toBe('3h 20m')
  })

  it('shows minutes within the hour', () => {
    const iso = new Date(NOW_MS + 20 * 60000).toISOString()
    expect(countdown(iso, NOW_MS)).toBe('20m')
  })
})
