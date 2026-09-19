import { describe, it, expect } from 'vitest'
import { GAMES } from '../../src/data/schedule.js'
import { TEAMS, CONFERENCE_BY_ABBR } from '../../src/data/teams.js'
import {
  conferenceSeeds,
  divisionStandings,
  playoffPicture,
  countsForStandings,
  DIVISIONS,
} from '../../src/utils/standings.js'
import { PLAYOFF, CONFERENCE_KEYS } from '../../src/config/league.js'

// LIVE suite (npm run test:data): the tables the site derives from the refreshed scores.
// Invariants only; see test/live/players.test.js for why. Each holds on opening day,
// when every club is 0-0-0, and in week 18 alike.
//
// Two NFL rules shape these, and each would make a basketball sibling's check wrong here:
// a regular-season game can end TIED (a tie is half a win), and the seeds are NOT in
// win-percentage order, because the four division winners take seeds 1 to 4 whatever
// their record. So order is checked within each of those two groups, never across them.

const seeds = conferenceSeeds(GAMES)
const divisions = divisionStandings(GAMES)

describe('standings derived from the refreshed schedule', () => {
  it('seeds every club exactly once, 1 through N within its own conference', () => {
    const all = CONFERENCE_KEYS.flatMap((c) => seeds[c])
    expect(all).toHaveLength(TEAMS.length)
    expect(new Set(all.map((r) => r.abbr)).size).toBe(TEAMS.length)
    for (const c of CONFERENCE_KEYS) {
      expect(seeds[c].map((r) => r.seed), c).toEqual(seeds[c].map((_, i) => i + 1))
      for (const r of seeds[c]) expect(CONFERENCE_BY_ABBR[r.abbr], r.abbr).toBe(c)
    }
  })

  it('gives every club a record that independently recounts the committed games', () => {
    // A different code path than computeStandings: catches a miscounted, tie-dropping, or
    // home/away-swapped record without naming a number the refresh moves.
    for (const c of CONFERENCE_KEYS) {
      for (const row of seeds[c]) {
        let w = 0
        let l = 0
        let t = 0
        for (const g of GAMES) {
          if (!countsForStandings(g) || (g.home !== row.abbr && g.away !== row.abbr)) continue
          const [mine, theirs] = g.home === row.abbr ? g.score : [g.score[1], g.score[0]]
          if (mine === theirs) t++
          else if (mine > theirs) w++
          else l++
        }
        expect({ abbr: row.abbr, w: row.w, l: row.l, t: row.t }).toEqual({ abbr: row.abbr, w, l, t })
        const gp = w + l + t
        expect(row.pct, row.abbr).toBeCloseTo(gp ? (w + t / 2) / gp : 0, 10)
      }
    }
  })

  it('seeds the division winners first, one from each division, then everyone else', () => {
    for (const c of CONFERENCE_KEYS) {
      const winners = seeds[c].slice(0, PLAYOFF.divisionWinnerSeeds)
      expect(winners.every((r) => r.isDivisionWinner), c).toBe(true)
      expect(new Set(winners.map((r) => r.division)).size, c).toBe(PLAYOFF.divisionWinnerSeeds)
      expect(seeds[c].slice(PLAYOFF.divisionWinnerSeeds).some((r) => r.isDivisionWinner), c).toBe(false)
    }
  })

  it('orders by win percentage within the winners and within the rest', () => {
    for (const c of CONFERENCE_KEYS) {
      for (const group of [seeds[c].slice(0, PLAYOFF.divisionWinnerSeeds), seeds[c].slice(PLAYOFF.divisionWinnerSeeds)]) {
        for (let i = 1; i < group.length; i++) expect(group[i - 1].pct, `${c} ${group[i].abbr}`).toBeGreaterThanOrEqual(group[i].pct)
      }
    }
  })

  it('puts exactly the playoff field in the field', () => {
    for (const c of CONFERENCE_KEYS) expect(seeds[c].filter((r) => r.inField), c).toHaveLength(PLAYOFF.seedsPerConference)
  })

  it('ranks every division 1 to 4, one winner, by win percentage', () => {
    expect(Object.keys(divisions).sort()).toEqual([...DIVISIONS].sort())
    for (const d of DIVISIONS) {
      const rows = divisions[d]
      expect(rows.map((r) => r.divRank), d).toEqual(rows.map((_, i) => i + 1))
      expect(rows.filter((r) => r.isDivisionWinner), d).toHaveLength(1)
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].pct, d).toBeGreaterThanOrEqual(rows[i].pct)
    }
  })

  it('never lets a club play more games than it is scheduled for', () => {
    const picture = playoffPicture(GAMES)
    for (const c of CONFERENCE_KEYS) {
      for (const row of picture[c]) expect(row.remaining, row.abbr).toBeGreaterThanOrEqual(0)
    }
  })
})
