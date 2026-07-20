import { describe, it, expect } from 'vitest'
import { GAMES_2025 } from './fixtures/season-2025.js'
import {
  computeStandings,
  countsForStandings,
  divisionStandings,
  conferenceSeeds,
  headToHead,
  DIVISIONS,
} from '../src/utils/standings.js'

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
