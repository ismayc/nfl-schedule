import { describe, it, expect } from 'vitest'
import { postseasonFromScoreboard, gamesFromTeamFeed } from '../scripts/fetch-schedule.mjs'

// The team-schedule feed lags the bracket by days, so postseason games come from the
// scoreboard too. Shapes below are trimmed from the real 2026-01-10 (wild card) and
// 2026-02-08 (Super Bowl) scoreboards: the season type lives on `season.type`, the
// competition `type` is "STD" (id 1, which the normal parser drops), and unscheduled
// slots carry "TBD" teams with negative ids.
const team = (id, abbreviation, homeAway) => ({ homeAway, team: { id, abbreviation } })
const event = (over = {}) => ({
  id: '401772979',
  date: '2026-01-10T21:30Z',
  season: { year: 2025, type: 3, slug: 'post-season' },
  competitions: [
    {
      type: { id: '1', abbreviation: 'STD' },
      status: { type: { name: 'STATUS_SCHEDULED', completed: false } },
      venue: { fullName: 'Bank of America Stadium', address: { city: 'Charlotte', state: 'NC' } },
      broadcasts: [{ names: ['Prime Video'] }],
      notes: [{ headline: 'NFC Wild Card Playoffs' }],
      competitors: [team('29', 'CAR', 'home'), team('14', 'LAR', 'away')],
    },
  ],
  ...over,
})
const KNOWN = new Set(['CAR', 'LAR', 'NE', 'SEA'])

describe('postseasonFromScoreboard', () => {
  it('reads a wild-card game from the scoreboard shape', () => {
    expect(postseasonFromScoreboard([event()], KNOWN)).toEqual([
      expect.objectContaining({
        id: '401772979',
        tip: '2026-01-10T21:30:00.000Z',
        seasonType: 'postseason',
        week: undefined,
        home: 'CAR',
        away: 'LAR',
        venue: 'Bank of America Stadium',
        broadcast: ['Prime Video'],
        round: 'WC',
        note: 'NFC Wild Card Playoffs',
      }),
    ])
  })

  it('skips TBD slots, the Pro Bowl, and anything not postseason', () => {
    const tbd = event({ id: 'tbd' })
    tbd.competitions[0].competitors = [team('-1', 'TBD', 'home'), team('-2', 'TBD', 'away')]
    const proBowl = event({ id: 'probowl' })
    proBowl.competitions[0].competitors = [team('31', 'AFC', 'home'), team('32', 'NFC', 'away')]
    const regular = event({ id: 'reg', season: { year: 2025, type: 2 } })
    const superBowl = event({ id: 'sb' })
    superBowl.competitions[0].notes = [{ headline: 'Super Bowl LX' }]
    superBowl.competitions[0].competitors = [team('17', 'NE', 'home'), team('26', 'SEA', 'away')]
    expect(
      postseasonFromScoreboard([tbd, proBowl, regular, superBowl], KNOWN).map((g) => [g.id, g.round])
    ).toEqual([['sb', 'SB']])
  })
})

// The per-team feed lists an advancing team's next-round game with a "TBD" opponent
// (id -1 or -2). The WNBA viewer shipped such a slot on 2026-09-30 and its live suite
// failed, so the team-feed path applies the same real-side rule as the scoreboard path.
describe('gamesFromTeamFeed', () => {
  const teamEvent = (id, home, away, over = {}) => ({
    id,
    date: '2026-09-13T17:00Z',
    seasonType: { id: '2' },
    week: { number: 2 },
    competitions: [{ status: { type: { name: 'STATUS_SCHEDULED' } }, competitors: [home, away] }],
    ...over,
  })

  it('drops a TBD slot, keeps a real game, and dedupes a game seen in both feeds', () => {
    const real = teamEvent('g1', team('29', 'CAR', 'home'), team('14', 'LAR', 'away'))
    const slot = teamEvent('slot', team('17', 'NE', 'home'), team('-2', 'TBD', 'away'))
    expect(gamesFromTeamFeed([real, slot, real, slot], KNOWN).map((g) => [g.id, g.home, g.away])).toEqual([
      ['g1', 'CAR', 'LAR'],
    ])
  })

  it('drops an event with positive ids but an unknown abbreviation', () => {
    const odd = teamEvent('odd', team('31', 'AFC', 'home'), team('32', 'NFC', 'away'))
    expect(gamesFromTeamFeed([odd], KNOWN)).toEqual([])
  })

  it('sorts by kickoff, then id', () => {
    const late = teamEvent('b', team('29', 'CAR', 'home'), team('14', 'LAR', 'away'), { date: '2026-09-20T17:00Z' })
    const early2 = teamEvent('z', team('17', 'NE', 'home'), team('26', 'SEA', 'away'))
    const early1 = teamEvent('a', team('29', 'CAR', 'home'), team('26', 'SEA', 'away'))
    expect(gamesFromTeamFeed([late, early2, early1], KNOWN).map((g) => g.id)).toEqual(['a', 'z', 'b'])
  })
})
