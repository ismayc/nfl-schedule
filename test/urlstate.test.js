import { describe, it, expect, afterEach } from 'vitest'
import { readState, toSearch, writeState, isValidZone, DEFAULTS } from '../src/utils/urlState.js'

describe('readState', () => {
  it('falls back to defaults on an empty query', () => {
    expect(readState('')).toEqual({
      view: 'schedule',
      tz: null,
      team: '',
      game: '',
      week: null,
      hide: false,
      mine: false,
      past: false,
    })
  })

  it('reads every supported key', () => {
    expect(readState('?view=stats&tz=America/Chicago&team=KC&game=401800001&week=7&hide=1&mine=1&past=1')).toEqual({
      view: 'stats',
      tz: 'America/Chicago',
      team: 'KC',
      game: '401800001',
      week: 7,
      hide: true,
      mine: true,
      past: true,
    })
  })

  it('ignores an unknown view rather than rendering a blank page', () => {
    expect(readState('?view=nope').view).toBe(DEFAULTS.view)
  })

  it('rejects a bogus timezone so a bad link cannot crash formatting', () => {
    expect(readState('?tz=Mars/Olympus').tz).toBeNull()
  })

  it('accepts any real IANA zone, not just the ones in the picker', () => {
    expect(readState('?tz=Pacific/Auckland').tz).toBe('Pacific/Auckland')
  })

  it('accepts a week inside the 1–18 range', () => {
    expect(readState('?week=1').week).toBe(1)
    expect(readState('?week=18').week).toBe(18)
  })

  it('rejects a week outside the range or non-integer', () => {
    expect(readState('?week=0').week).toBeNull()
    expect(readState('?week=19').week).toBeNull()
    expect(readState('?week=7.5').week).toBeNull()
    expect(readState('?week=abc').week).toBeNull()
  })

  it('defaults the search argument to window.location.search', () => {
    window.history.replaceState(null, '', '/?view=standings')
    expect(readState().view).toBe('standings')
    window.history.replaceState(null, '', '/')
  })
})

describe('isValidZone', () => {
  it('accepts real zones and rejects junk or empty', () => {
    expect(isValidZone('Europe/London')).toBe(true)
    expect(isValidZone('UTC')).toBe(true)
    expect(isValidZone('Not/AZone')).toBe(false)
    expect(isValidZone(null)).toBe(false)
    expect(isValidZone('')).toBe(false)
  })
})

describe('toSearch', () => {
  const detected = 'America/New_York'

  it('writes nothing when everything is default', () => {
    expect(toSearch({ view: 'schedule', tz: detected, team: '' }, detected)).toBe('')
  })

  it('omits the timezone when it matches the viewer’s own zone', () => {
    expect(toSearch({ view: 'stats', tz: detected }, detected)).toBe('?view=stats')
  })

  it('pins the timezone when it differs', () => {
    expect(toSearch({ view: 'schedule', tz: 'Europe/London' }, detected)).toBe('?tz=Europe%2FLondon')
  })

  it('writes team and every boolean flag', () => {
    expect(toSearch({ view: 'schedule', team: 'KC', hide: true, mine: true, past: true }, detected)).toBe(
      '?team=KC&hide=1&mine=1&past=1'
    )
  })

  it('writes the week only in the week view', () => {
    expect(toSearch({ view: 'week', week: 7 }, detected)).toBe('?view=week&week=7')
    expect(toSearch({ view: 'stats', week: 7 }, detected)).toBe('?view=stats')
    expect(toSearch({ view: 'week', week: null }, detected)).toBe('?view=week')
  })

  it('round-trips through readState', () => {
    const state = {
      view: 'week',
      tz: 'Europe/London',
      team: 'GB',
      game: '',
      week: 12,
      hide: true,
      mine: true,
      past: true,
    }
    expect(readState(toSearch(state, detected))).toEqual(state)
  })
})

describe('writeState', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('replaces the URL with the encoded state', () => {
    writeState({ view: 'stats', tz: 'Europe/London', team: 'KC' }, 'America/New_York')
    expect(window.location.search).toBe('?view=stats&tz=Europe%2FLondon&team=KC')
  })

  it('clears the query when the state is all default', () => {
    window.history.replaceState(null, '', '/?view=stats')
    writeState({ view: 'schedule' }, 'America/New_York')
    expect(window.location.search).toBe('')
  })

  it('no-ops when there is no window', () => {
    const saved = global.window
    global.window = undefined
    try {
      expect(() => writeState({ view: 'stats' }, 'America/New_York')).not.toThrow()
    } finally {
      global.window = saved
    }
  })
})
