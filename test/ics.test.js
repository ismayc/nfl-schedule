import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildIcs, downloadIcs, escapeText, fold, toIcsDate } from '../src/utils/ics.js'

const NOW = '2026-07-20T12:00:00.000Z'
const build = (games) => buildIcs(games, { now: NOW })
const lines = (ics) => ics.split('\r\n')

const base = {
  id: 'g1',
  tip: '2026-09-13T17:00:00.000Z',
  home: 'KC',
  away: 'DEN',
  venue: 'GEHA Field at Arrowhead Stadium',
  city: 'Kansas City',
  state: 'MO',
  broadcast: ['CBS'],
  week: 2,
  score: [24, 20],
}

describe('escapeText', () => {
  it('escapes the RFC 5545 delimiters', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d')
  })

  it('turns newlines into the literal escape', () => {
    expect(escapeText('a\nb')).toBe('a\\nb')
    expect(escapeText('a\r\nb')).toBe('a\\nb')
  })

  it('defaults to an empty string', () => {
    expect(escapeText()).toBe('')
  })
})

describe('toIcsDate', () => {
  it('emits a UTC basic-format timestamp', () => {
    expect(toIcsDate('2026-09-13T17:00:00.000Z')).toBe('20260913T170000Z')
  })
})

describe('fold', () => {
  it('leaves short lines alone', () => {
    expect(fold('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('folds past 75 octets with a leading space on continuations', () => {
    const out = fold('SUMMARY:' + 'x'.repeat(200))
    const parts = out.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe('SUMMARY:' + 'x'.repeat(200))
  })

  it('measures octets, not characters, and never splits a multi-byte char', () => {
    // 'é' is two UTF-8 bytes, forcing the backoff that walks off a continuation byte.
    const out = fold('SUMMARY:' + 'é'.repeat(60))
    for (const part of out.split('\r\n')) {
      expect(part).not.toContain('�')
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    }
    expect(out.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe('SUMMARY:' + 'é'.repeat(60))
  })
})

describe('buildIcs', () => {
  it('wraps events in a valid calendar envelope with CRLF endings', () => {
    const ics = build([base])
    const l = lines(ics)
    expect(l[0]).toBe('BEGIN:VCALENDAR')
    expect(l).toContain('VERSION:2.0')
    expect(l.at(-2)).toBe('END:VCALENDAR')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('puts the score in the title of a finished game but not an upcoming one', () => {
    expect(build([base])).toMatch(/SUMMARY:.*\(20–24\)/)
    expect(build([{ ...base, score: undefined }])).not.toMatch(/SUMMARY:.*\(\d+–\d+\)/)
  })

  it('uses team display names, falling back to the abbreviation for an unknown team', () => {
    const ics = build([{ ...base, home: 'ZZZ', away: 'YYY' }])
    expect(ics).toMatch(/SUMMARY:YYY at ZZZ/)
  })

  it('includes location built from venue, city and state', () => {
    expect(build([base])).toContain('LOCATION:GEHA Field at Arrowhead Stadium\\, Kansas City\\, MO')
  })

  it('omits the location line when there is no venue detail', () => {
    const ics = build([{ ...base, venue: undefined, city: undefined, state: undefined }])
    expect(ics).not.toContain('LOCATION:')
  })

  it('builds the description from week, broadcast, round and note', () => {
    const ics = build([{ ...base, round: 'WC', note: 'AFC Wild Card' }])
    expect(ics).toMatch(/DESCRIPTION:.*Week 2/)
    expect(ics).toMatch(/DESCRIPTION:.*Watch: CBS/)
    // A known round key resolves to its display name.
    expect(ics).toMatch(/DESCRIPTION:.*Wild Card/)
    expect(ics).toMatch(/DESCRIPTION:.*AFC Wild Card/)
  })

  it('falls back to the raw round key when it is not in the playoff map', () => {
    const ics = build([{ ...base, week: undefined, broadcast: undefined, round: 'MYSTERY' }])
    expect(ics).toMatch(/DESCRIPTION:MYSTERY/)
  })

  it('omits the description line when there is nothing to say', () => {
    const ics = build([{ ...base, week: undefined, broadcast: undefined, round: undefined, note: undefined }])
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it('marks a postponed or canceled game CANCELLED rather than dropping it', () => {
    expect(build([{ ...base, postponed: true }])).toContain('STATUS:CANCELLED')
    expect(build([{ ...base, canceled: true }])).toContain('STATUS:CANCELLED')
    expect(build([base])).not.toContain('STATUS:CANCELLED')
  })

  it('emits one VEVENT per game with a stable UID', () => {
    const ics = build([base, { ...base, id: 'g2' }])
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:g1@the-nfl-schedule')
  })

  it('uses the default calendar name when none is given', () => {
    expect(buildIcs([base])).toContain('X-WR-CALNAME:NFL')
  })
})

describe('downloadIcs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('creates a blob URL, clicks a download anchor, and revokes the URL', () => {
    vi.useFakeTimers()
    const createSpy = vi.fn(() => 'blob:mock')
    const revokeSpy = vi.fn()
    URL.createObjectURL = createSpy
    URL.revokeObjectURL = revokeSpy
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadIcs([base], { filename: 'season.ics' })

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    // The anchor is removed synchronously; the URL is revoked on the next tick.
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeSpy).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock')
  })

  it('defaults the filename from the league id', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
    let captured
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      captured = this.getAttribute('download')
    })
    downloadIcs([base])
    expect(captured).toBe('nfl.ics')
  })
})
