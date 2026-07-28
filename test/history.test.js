import { describe, it, expect } from 'vitest'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../src/data/history.js'
import {
  seasonBracket,
  runResult,
  superBowlSummary,
  superBowlRuns,
  bestRecord,
  seedOf,
} from '../src/utils/history.js'
import { CONFERENCE_KEYS, CONFERENCE_BY_ABBR } from '../src/config/league.js'
import { TEAM_BY_ABBR } from '../src/data/teams.js'
import { LEADER_CATEGORIES } from '../src/utils/stats.js'

// Checked against the real record, not against the feed the data came from — a test
// that only restates ESPN would pass on garbage.
const SUPER_BOWLS = {
  2024: ['PHI', 'KC', [40, 22]],
  2023: ['KC', 'SF', [25, 22]],
  2022: ['KC', 'PHI', [38, 35]],
  2021: ['LAR', 'CIN', [23, 20]],
}

describe('the committed history file', () => {
  it('covers every season in the current format, newest first', () => {
    expect(HISTORY_YEARS).toEqual([2025, 2024, 2023, 2022, 2021])
    expect(Object.keys(HISTORY_BY_YEAR).map(Number).sort()).toEqual([
      2021, 2022, 2023, 2024, 2025,
    ])
  })

  it('seeds all 32 teams, 16 per conference, in every season', () => {
    for (const s of HISTORY) {
      for (const conf of CONFERENCE_KEYS) {
        expect(s.standings[conf]).toHaveLength(16)
        expect(s.standings[conf].map((r) => r.seed)).toEqual([...Array(16)].map((_, i) => i + 1))
        for (const row of s.standings[conf]) expect(CONFERENCE_BY_ABBR[row.abbr]).toBe(conf)
        // Seven make the field: four division winners and three wild cards.
        const field = s.standings[conf].filter((r) => r.inField)
        expect(field).toHaveLength(7)
        expect(field.filter((r) => r.seedType === 'division')).toHaveLength(4)
        expect(field.filter((r) => r.seedType === 'wildcard')).toHaveLength(3)
      }
    }
  })

  it('carries exactly the 13 postseason games of a 14-team playoff', () => {
    for (const s of HISTORY) {
      const byRound = s.games.reduce((a, g) => ({ ...a, [g.round]: (a[g.round] || 0) + 1 }), {})
      expect(byRound).toEqual({ WC: 6, DIV: 4, CONF: 2, SB: 1 })
      for (const g of s.games) {
        expect(g.seasonType).toBe('postseason')
        expect(g.score).toHaveLength(2)
        // No ties in the postseason — someone has to win.
        expect(g.score[0]).not.toBe(g.score[1])
      }
    }
  })

  it('commits no regular-season games — that is what keeps it small', () => {
    for (const s of HISTORY) {
      expect(s.games.some((g) => g.seasonType === 'regular')).toBe(false)
    }
  })

  it('records a 17-game season for every team, every year', () => {
    for (const s of HISTORY) {
      for (const conf of CONFERENCE_KEYS) {
        for (const r of s.standings[conf]) {
          const gp = r.w + r.l + r.t
          // The whole point of the 2021 floor: every archived season is 17 games — with
          // one real exception, below.
          expect(gp).toBeGreaterThanOrEqual(16)
          expect(gp).toBeLessThanOrEqual(17)
          expect(r.pct).toBeCloseTo((r.w + r.t / 2) / gp, 2)
          expect(r.diff).toBe(r.pf - r.pa)
        }
      }
      const all = CONFERENCE_KEYS.flatMap((c) => s.standings[c])
      // Every game has one winner and one loser, or two halves of a tie.
      expect(all.reduce((n, r) => n + r.w, 0)).toBe(all.reduce((n, r) => n + r.l, 0))
      expect(all.reduce((n, r) => n + r.t, 0) % 2).toBe(0)
    }
  })
})

describe('rebuilding an archived season', () => {
  it('reproduces the real Super Bowl result', () => {
    for (const [year, [champ, runnerUp, score]] of Object.entries(SUPER_BOWLS)) {
      const season = HISTORY_BY_YEAR[year]
      const sb = superBowlSummary(season)
      expect(sb.winner).toBe(champ)
      expect(sb.loser).toBe(runnerUp)
      expect(sb.score).toEqual(score)
      // The committed summary and the recomputed bracket must agree.
      expect(season.champion).toBe(champ)
      expect(season.runnerUp).toBe(runnerUp)
    }
  })

  it('seeds the bracket from the committed standings, not from absent regular games', () => {
    const s = HISTORY_BY_YEAR[2023]
    const b = seasonBracket(s)
    // Kansas City won it from the 3 seed; San Francisco were the NFC 1 seed.
    expect(seedOf(s, 'KC')).toBe(3)
    expect(seedOf(s, 'SF')).toBe(1)
    expect(b.regularSeasonStarted).toBe(true)
    expect(b.hasPostseason).toBe(true)
    // The 1 seed byes: it appears in the divisional round, never the wild card.
    for (const conf of CONFERENCE_KEYS) {
      const byeTeam = b.conferences[conf].byeTeam
      expect(seedOf(s, byeTeam)).toBe(1)
      expect(b.conferences[conf].WC.some((m) => m.home === byeTeam || m.away === byeTeam)).toBe(
        false
      )
      expect(b.conferences[conf].WC).toHaveLength(3)
    }
  })

  it('re-seeds every round, so the top remaining seed hosts', () => {
    for (const s of HISTORY) {
      const b = seasonBracket(s)
      for (const conf of CONFERENCE_KEYS) {
        for (const m of [...b.conferences[conf].DIV, b.conferences[conf].CONF]) {
          expect(m.seedHome).toBeLessThan(m.seedAway)
        }
      }
    }
  })
})

describe('how far a team went', () => {
  const b2023 = seasonBracket(HISTORY_BY_YEAR[2023])

  it('labels each exit round, and the title', () => {
    expect(runResult(b2023, 'KC')).toBe('Won the Super Bowl')
    expect(runResult(b2023, 'SF')).toBe('Lost the Super Bowl')
    expect(runResult(b2023, 'BAL')).toBe('Lost the conference championship')
    expect(runResult(b2023, 'BUF')).toBe('Lost in the divisional round')
    expect(runResult(b2023, 'MIA')).toBe('Lost in the wild card round')
  })

  it('returns null for a team that missed the playoffs', () => {
    expect(runResult(b2023, 'NE')).toBeNull() // 4-13 in 2023
    expect(runResult(b2023, null)).toBeNull()
  })
})

describe('the Super Bowl table', () => {
  const rows = superBowlRuns(HISTORY)

  it('has two rows a season — the winner and the loser', () => {
    expect(rows).toHaveLength(HISTORY.length * 2)
    expect(rows.filter((r) => r.won)).toHaveLength(HISTORY.length)
    expect(rows[0].year).toBe(2025)
    expect(rows.at(-1).year).toBe(2021)
  })

  it('records the seed each finalist came from', () => {
    // 2021 is the season both Super Bowl teams were 4 seeds.
    const y2021 = rows.filter((r) => r.year === 2021)
    expect(y2021.map((r) => r.seed)).toEqual([4, 4])
    // And 2022 is the one where both were 1 seeds.
    expect(rows.filter((r) => r.year === 2022).map((r) => r.seed)).toEqual([1, 1])
  })

  it('orients the score from each row’s own point of view', () => {
    const [winner, loser] = rows.filter((r) => r.year === 2023)
    expect(winner.score).toEqual([25, 22])
    expect(loser.score).toEqual([22, 25])
  })

  it('skips a season whose Super Bowl has not been played', () => {
    const unplayed = { ...HISTORY_BY_YEAR[2023], games: [] }
    expect(superBowlRuns([unplayed])).toEqual([])
    expect(superBowlSummary(unplayed).winner).toBeNull()
    expect(superBowlSummary(unplayed).score).toBeNull()
  })
})

describe('the season’s best record', () => {
  it('finds the top team across both conferences', () => {
    // 2023: Baltimore at 13-4 (SF matched the record but lost the differential tail).
    expect(bestRecord(HISTORY_BY_YEAR[2023]).abbr).toBe('BAL')
    // 2024: Detroit at 15-2, who did not reach the Super Bowl.
    expect(bestRecord(HISTORY_BY_YEAR[2024]).abbr).toBe('DET')
  })
})

describe('the leader boards', () => {
  it('covers every category the live Stats view offers', () => {
    for (const s of HISTORY) {
      for (const cat of LEADER_CATEGORIES) {
        expect(s.leaders[cat.key].length).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('joins every board row to a stat line in that season’s player table', () => {
    for (const s of HISTORY) {
      for (const [key, board] of Object.entries(s.leaders)) {
        for (const row of board) {
          const p = s.players[row.id]
          expect(p).toBeTruthy()
          expect(p[key]).toBe(row.value)
          expect(TEAM_BY_ABBR[p.team]).toBeTruthy()
        }
      }
    }
  })

  it('ranks with ties sharing a place', () => {
    // Rushing touchdowns tie constantly, so at least one season has a shared rank.
    const anyTie = HISTORY.some((s) =>
      Object.values(s.leaders).some((board) => new Set(board.map((r) => r.rank)).size < board.length)
    )
    expect(anyTie).toBe(true)
  })
})

describe('the season totals', () => {
  it('matches the games each season actually played', () => {
    for (const s of HISTORY) {
      const t = s.totals
      // Derive it rather than hardcoding 272 — one season really is 271 (see below).
      const teamGames = CONFERENCE_KEYS.flatMap((c) => s.standings[c]).reduce(
        (n, r) => n + r.w + r.l + r.t,
        0
      )
      expect(t.played).toBe(teamGames / 2)
      expect(t.combinedPpg).toBeCloseTo(t.points / t.played, 1)
      expect(t.homeWins / t.played).toBeGreaterThan(0.5)
      expect(t.closest).toHaveLength(5)
      expect(t.highest).toHaveLength(5)
      // A tie in the totals must show up in the standings as well.
      const standingsTies = CONFERENCE_KEYS.flatMap((c) => s.standings[c]).reduce(
        (n, r) => n + r.t,
        0
      )
      expect(standingsTies / 2).toBe(t.ties)
    }
  })

  it('carries the one season that was not 17 games for everybody', () => {
    // Buffalo–Cincinnati, January 2023: abandoned after Damar Hamlin's cardiac arrest and
    // never made up. Both teams finished on 16 games and the league played 271, not 272.
    // A flat "every team plays 17" assertion would be wrong about the real world here.
    const s2022 = HISTORY_BY_YEAR[2022]
    const short = CONFERENCE_KEYS.flatMap((c) => s2022.standings[c]).filter(
      (r) => r.w + r.l + r.t === 16
    )
    expect(short.map((r) => r.abbr).sort()).toEqual(['BUF', 'CIN'])
    expect(s2022.totals.played).toBe(271)

    // Every other season is the full slate.
    for (const s of HISTORY.filter((x) => x.year !== 2022)) {
      expect(s.totals.played).toBe(272)
    }
  })

  it('keeps only those ten regular-season games, each with an id to open', () => {
    for (const s of HISTORY) {
      for (const g of [...s.totals.closest, ...s.totals.highest]) {
        expect(g.id).toMatch(/^\d+$/)
        // They are NOT in the committed games list — that is postseason only.
        expect(s.games.some((x) => x.id === g.id)).toBe(false)
      }
      // Closest means closest: nothing in that list was decided by more than a field goal.
      const margin = (g) => Math.abs(g.score[0] - g.score[1])
      expect(Math.max(...s.totals.closest.map(margin))).toBeLessThanOrEqual(3)
    }
  })
})
