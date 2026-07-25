import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { GAMES } from '../src/data/schedule.js'

const count = (q) => {
  const p = parseQuery(q)
  return GAMES.filter((g) => matchesSearch(g, p)).length
}

// A game whose abbreviations aren't in TEAM_BY_ABBR — exercises the unknown-team and
// missing-field fallbacks without depending on the committed snapshot.
const bogus = { home: 'ZZZ', away: 'YYY' }

describe('parseQuery', () => {
  it('treats bare text as free text', () => {
    expect(parseQuery('Chiefs')).toEqual({ free: 'Chiefs', tokens: [] })
  })

  it('returns an empty query for empty input', () => {
    expect(parseQuery('')).toEqual({ free: '', tokens: [] })
    expect(parseQuery()).toEqual({ free: '', tokens: [] })
  })

  it('parses a single scoped token', () => {
    expect(parseQuery('team: Chiefs')).toEqual({
      free: '',
      tokens: [{ field: 'team', value: 'Chiefs' }],
    })
  })

  it('parses multiple tokens, with or without a space after the colon', () => {
    expect(parseQuery('team:KC city:Kansas City')).toEqual({
      free: '',
      tokens: [
        { field: 'team', value: 'KC' },
        { field: 'city', value: 'Kansas City' },
      ],
    })
  })

  it('maps venue aliases (arena / stadium) to venue', () => {
    expect(parseQuery('venue: Arrowhead').tokens[0].field).toBe('venue')
    expect(parseQuery('arena: Arrowhead').tokens[0].field).toBe('venue')
    expect(parseQuery('stadium: Arrowhead').tokens[0].field).toBe('venue')
  })

  it('maps broadcast aliases (tv / network / watch) to broadcast', () => {
    expect(parseQuery('broadcast: NBC').tokens[0].field).toBe('broadcast')
    expect(parseQuery('tv: NBC').tokens[0].field).toBe('broadcast')
    expect(parseQuery('network: NBC').tokens[0].field).toBe('broadcast')
    expect(parseQuery('watch: NBC').tokens[0].field).toBe('broadcast')
  })

  it('keeps leading bare text as free text alongside tokens', () => {
    expect(parseQuery('Chiefs team: KC')).toEqual({
      free: 'Chiefs',
      tokens: [{ field: 'team', value: 'KC' }],
    })
  })

  it('treats an unknown field as free text', () => {
    expect(parseQuery('coach: Someone')).toEqual({ free: 'Someone', tokens: [] })
  })

  it('drops a scoped field with no value', () => {
    expect(parseQuery('team:')).toEqual({ free: '', tokens: [] })
  })
})

describe('matchesSearch', () => {
  it('matches a team by nickname, city, abbreviation, and full name', () => {
    expect(count('team: Chiefs')).toBeGreaterThan(0)
    expect(count('team: Chiefs')).toBe(count('team: Kansas City'))
    expect(count('team: Chiefs')).toBe(count('team: KC'))
    expect(count('team: Chiefs')).toBe(count('team: Kansas City Chiefs'))
  })

  it('matches either side of the game', () => {
    // Every Chiefs game, home or away, counts.
    const kc = GAMES.filter((g) => g.home === 'KC' || g.away === 'KC').length
    expect(count('team: Chiefs')).toBe(kc)
  })

  it('scopes by city', () => {
    const kc = GAMES.filter((g) => g.city === 'Kansas City').length
    expect(count('city: Kansas City')).toBe(kc)
    expect(kc).toBeGreaterThan(0)
  })

  it('scopes by venue (and its aliases)', () => {
    const stadium = GAMES.filter((g) => /arrowhead/i.test(g.venue)).length
    expect(count('venue: Arrowhead')).toBe(stadium)
    expect(count('arena: Arrowhead')).toBe(stadium)
    expect(stadium).toBeGreaterThan(0)
  })

  it('scopes by broadcast (and its aliases)', () => {
    const nbc = GAMES.filter((g) => (g.broadcast || []).some((b) => /nbc/i.test(b))).length
    expect(count('broadcast: NBC')).toBe(nbc)
    expect(count('tv: NBC')).toBe(nbc)
    expect(count('network: NBC')).toBe(nbc)
    expect(nbc).toBeGreaterThan(0)
  })

  it('matches broadcast in unscoped free text', () => {
    // A network name with no scope still hits via the broad substring match.
    expect(count('NBC')).toBeGreaterThan(0)
  })

  it('handles a game with no broadcast list', () => {
    const noTv = { home: 'ZZZ', away: 'YYY' }
    expect(matchesSearch(noTv, parseQuery('broadcast: NBC'))).toBe(false)
    expect(matchesSearch(noTv, parseQuery('tv: anything'))).toBe(false)
  })

  it('combines tokens (AND semantics)', () => {
    // A Chiefs game played in Kansas City is a subset of all Chiefs games.
    expect(count('team: Chiefs city: Kansas City')).toBeLessThanOrEqual(count('team: Chiefs'))
    expect(count('team: Chiefs city: Kansas City')).toBeGreaterThan(0)
  })

  it('does a broad substring match on unscoped free text', () => {
    // Free text hits team names, city, and venue alike.
    expect(count('Kansas City')).toBeGreaterThan(0)
    expect(count('arrowhead')).toBeGreaterThan(0)
  })

  it('returns everything for an empty query', () => {
    expect(count('')).toBe(GAMES.length)
  })

  it('returns nothing when nothing matches', () => {
    expect(count('team: Nonexistent')).toBe(0)
    expect(count('zzzznope')).toBe(0)
  })

  it('handles games with unknown teams and missing fields', () => {
    // Unknown abbr falls back to the raw string; missing city/venue don't throw.
    expect(matchesSearch(bogus, parseQuery('team: zzz'))).toBe(true)
    expect(matchesSearch(bogus, parseQuery('zzz'))).toBe(true)
    expect(matchesSearch(bogus, parseQuery('city: nowhere'))).toBe(false)
    expect(matchesSearch(bogus, parseQuery('venue: nowhere'))).toBe(false)
  })

  it('handles a game with empty team abbreviations', () => {
    // An empty abbr resolves to no team and an empty search string, matching nothing
    // specific but never throwing.
    const blank = { home: '', away: '', city: '', venue: '' }
    expect(matchesSearch(blank, parseQuery('team: anything'))).toBe(false)
    expect(matchesSearch(blank, parseQuery(''))).toBe(true)
  })
})
