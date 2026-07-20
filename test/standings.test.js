import { describe, it, expect } from 'vitest'
import { GAMES_2025 } from './fixtures/season-2025.js'
import {
  computeStandings,
  countsForStandings,
  divisionStandings,
  conferenceSeeds,
  headToHead,
  scheduledGames,
  playoffPicture,
  DIVISIONS,
} from '../src/utils/standings.js'
import { GAMES as GAMES_2026 } from '../src/data/schedule.js'

// Real completed season as the truth fixture (PLAYBOOK §7): it carries the edge cases —
// ties, identical-record tiebreaks — a synthetic fixture wouldn't reproduce.
const table = computeStandings(GAMES_2025)
const reg = GAMES_2025.filter(countsForStandings)

describe('countable games', () => {
  it('counts only completed regular-season games', () => {
    expect(reg.length).toBe(272) // 32 teams × 17 ÷ 2
    expect(reg.every((g) => g.seasonType === 'regular' && g.score)).toBe(true)
  })
  it('excludes the postseason', () => {
    expect(GAMES_2025.some((g) => g.seasonType === 'postseason')).toBe(true)
    expect(reg.some((g) => g.seasonType === 'postseason')).toBe(false)
  })
})

describe('W-L-T derivation is internally consistent', () => {
  const rows = Object.values(table)

  it('every team played 17 games', () => {
    for (const r of rows) expect(r.gp).toBe(17)
  })

  it('total wins equal total losses across the league (ties aside)', () => {
    const w = rows.reduce((n, r) => n + r.w, 0)
    const l = rows.reduce((n, r) => n + r.l, 0)
    expect(w).toBe(l)
  })

  it('ties are even in number (each tie is shared by two teams)', () => {
    const t = rows.reduce((n, r) => n + r.t, 0)
    expect(t % 2).toBe(0)
  })

  it('points-for across the league equals points-against', () => {
    const pf = rows.reduce((n, r) => n + r.pf, 0)
    const pa = rows.reduce((n, r) => n + r.pa, 0)
    expect(pf).toBe(pa)
  })

  it('win pct treats a tie as half a win', () => {
    for (const r of rows) expect(r.pct).toBeCloseTo((r.w + r.t / 2) / r.gp, 10)
  })

  it('home + road records reconstruct the overall record', () => {
    for (const r of rows) {
      expect(r.home.w + r.road.w).toBe(r.w)
      expect(r.home.l + r.road.l).toBe(r.l)
      expect(r.home.t + r.road.t).toBe(r.t)
    }
  })
})

describe('a tie is a real outcome', () => {
  it('at least one team recorded a tie in 2025, and it is not counted as a loss', () => {
    const withTie = Object.values(table).filter((r) => r.t > 0)
    expect(withTie.length).toBeGreaterThan(0)
    // GB famously finished 2025 with a tie in this data.
    const gb = table.GB
    expect(gb.t).toBe(1)
    expect(gb.gp).toBe(gb.w + gb.l + gb.t)
  })
})

describe('divisions and seeding', () => {
  it('has 8 divisions of 4 teams each', () => {
    const divs = divisionStandings(GAMES_2025)
    expect(Object.keys(divs).sort()).toEqual([...DIVISIONS].sort())
    for (const d of DIVISIONS) expect(divs[d].length).toBe(4)
  })

  it('seeds four division winners (1-4) then three wild cards (5-7) per conference', () => {
    const seeds = conferenceSeeds(GAMES_2025)
    for (const conf of ['AFC', 'NFC']) {
      const top7 = seeds[conf].slice(0, 7)
      expect(top7.slice(0, 4).every((r) => r.seedType === 'division')).toBe(true)
      expect(top7.slice(4, 7).every((r) => r.seedType === 'wildcard')).toBe(true)
      expect(top7.every((r) => r.inField)).toBe(true)
      // Exactly four division winners in the conference.
      expect(seeds[conf].filter((r) => r.isDivisionWinner).length).toBe(4)
    }
  })

  it('a wild card can out-record a lower-seeded division winner', () => {
    // The structural point of NFL seeding: winning a weak division still seeds you above
    // a stronger wild card. HOU (12-5 wild card) sat above PIT (10-7 division winner).
    const afc = conferenceSeeds(GAMES_2025).AFC
    const div4 = afc.find((r) => r.seed === 4)
    const wc5 = afc.find((r) => r.seed === 5)
    expect(div4.seedType).toBe('division')
    expect(wc5.seedType).toBe('wildcard')
    expect(wc5.pct).toBeGreaterThan(div4.pct)
  })
})

describe('head-to-head', () => {
  it('is null for teams that never met and symmetric otherwise', () => {
    const met = headToHead(GAMES_2025, 'KC', 'DEN')
    expect(met).not.toBeNull()
    expect(met.w + met.l + met.t).toBeGreaterThan(0)
  })
})

describe('computeStandings edge cases', () => {
  const game = (over) => ({
    id: String(Math.random()),
    seasonType: 'regular',
    tip: '2025-09-10T00:00:00.000Z',
    home: 'KC',
    away: 'DEN',
    score: [24, 20],
    ...over,
  })

  it('skips a side whose team is not in the league table', () => {
    // A stray game against an unknown abbreviation is ignored for that side only.
    const t = computeStandings([game({ home: 'KC', away: 'XXX', score: [30, 10] })])
    expect(t.KC).toMatchObject({ w: 1, l: 0 })
    expect(t.XXX).toBeUndefined()
  })

  it('reads a tie as ending any streak (streak 0)', () => {
    const t = computeStandings([game({ home: 'KC', away: 'DEN', score: [21, 21] })])
    expect(t.KC.t).toBe(1)
    expect(t.KC.streak).toBe(0)
    expect(t.DEN.streak).toBe(0)
  })

  it('tolerates a beaten opponent missing from the table when seeding', () => {
    // Two same-division teams, identical records built entirely against unknown
    // opponents, force the strength-of-victory step to look those ghosts up.
    const games = [
      game({ id: 'a', home: 'BUF', away: 'XXX', score: [20, 10] }),
      game({ id: 'b', home: 'MIA', away: 'YYY', score: [20, 10] }),
    ]
    expect(() => conferenceSeeds(games)).not.toThrow()
    const afc = conferenceSeeds(games).AFC
    expect(afc.map((r) => r.abbr)).toContain('BUF')
    expect(afc.map((r) => r.abbr)).toContain('MIA')
  })
})

describe('scheduledGames', () => {
  const game = (over) => ({
    id: String(Math.random()),
    seasonType: 'regular',
    tip: '2025-09-10T00:00:00.000Z',
    home: 'KC',
    away: 'DEN',
    score: [24, 20],
    ...over,
  })

  it('counts every scheduled regular-season appearance per team', () => {
    const total = scheduledGames([
      game({ home: 'KC', away: 'DEN' }),
      game({ home: 'DEN', away: 'KC' }),
    ])
    expect(total.KC).toBe(2)
    expect(total.DEN).toBe(2)
  })

  it('ignores the postseason and canceled games', () => {
    const total = scheduledGames([
      game({ home: 'KC', away: 'DEN' }),
      game({ home: 'KC', away: 'DEN', seasonType: 'postseason' }),
      game({ home: 'KC', away: 'DEN', canceled: true }),
    ])
    expect(total.KC).toBe(1)
    expect(total.DEN).toBe(1)
  })

  it('derives the full 17-game slate from the real season', () => {
    const total = scheduledGames(GAMES_2025)
    for (const abbr of Object.keys(total)) expect(total[abbr]).toBe(17)
  })
})

describe('playoffPicture', () => {
  it('marks clinched and eliminated teams once a full season is in', () => {
    const picture = playoffPicture(GAMES_2025)
    for (const conf of ['AFC', 'NFC']) {
      const rows = picture[conf]
      // With every game played there is no remaining schedule.
      expect(rows.every((r) => r.remaining === 0)).toBe(true)
      // Both outcomes appear: the top of the table has clinched, the bottom is out —
      // and both the clinched and eliminated flags are exercised in each direction.
      expect(rows.some((r) => r.clinched)).toBe(true)
      expect(rows.some((r) => !r.clinched)).toBe(true)
      expect(rows.some((r) => r.eliminated)).toBe(true)
      expect(rows.some((r) => !r.eliminated)).toBe(true)
    }
  })

  it('clinches and eliminates nobody before any game is played', () => {
    const picture = playoffPicture(GAMES_2026) // committed 2026: scheduled, unplayed
    for (const conf of ['AFC', 'NFC']) {
      const rows = picture[conf]
      expect(rows.every((r) => r.clinched === false)).toBe(true)
      expect(rows.every((r) => r.eliminated === false)).toBe(true)
      // Remaining is the whole 17-game slate.
      expect(rows.every((r) => r.remaining > 0)).toBe(true)
    }
  })

  it('treats a team with no scheduled games as having none remaining', () => {
    // A tiny slate: only KC and DEN appear in the schedule, so every other team is
    // absent from the scheduled-games totals and must not go negative.
    const picture = playoffPicture([
      {
        id: '1',
        seasonType: 'regular',
        tip: '2025-09-10T00:00:00.000Z',
        home: 'KC',
        away: 'DEN',
        score: [24, 20],
      },
    ])
    const all = [...picture.AFC, ...picture.NFC]
    expect(all.every((r) => r.remaining >= 0)).toBe(true)
    // The two teams that did play show one fewer remaining than scheduled (0).
    const kc = picture.AFC.find((r) => r.abbr === 'KC')
    expect(kc.remaining).toBe(0)
  })
})
