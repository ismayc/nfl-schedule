import { describe, it, expect } from 'vitest'
import { GAMES_2025 } from './fixtures/season-2025.js'
import { GAMES } from '../src/data/schedule.js'
import {
  seasonTotals,
  teamScoring,
  leaderboard,
  playersByTeam,
  LEADER_CATEGORIES,
} from '../src/utils/stats.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2025-09-10T00:00:00.000Z',
  home: 'KC',
  away: 'DEN',
  score: [24, 20],
  ...over,
})

describe('seasonTotals (populated)', () => {
  const t = seasonTotals(GAMES_2025)

  it('counts only the 272 completed regular-season games', () => {
    expect(t.played).toBe(272)
    expect(t.scheduled).toBe(272)
    expect(t.remaining).toBe(0)
  })

  it('derives averages from the games actually played', () => {
    expect(t.combinedPpg).toBeCloseTo(t.totalPoints / t.played, 6)
    expect(t.ppg).toBeCloseTo(t.combinedPpg / 2, 6)
    expect(t.homeWinPct).toBeCloseTo(t.homeWins / t.played, 6)
  })

  it('surfaces the real edge cases in the season', () => {
    expect(t.ties.length).toBeGreaterThan(0) // GB tied a game in 2025
    expect(t.overtimes.length).toBeGreaterThan(0)
    expect(t.closest).toHaveLength(5)
    expect(t.highestScoring).toHaveLength(5)
    // closest is sorted by ascending margin, highestScoring by descending total.
    expect(t.closest[0].margin).toBeLessThanOrEqual(t.closest[4].margin)
    const total = (g) => g.score[0] + g.score[1]
    expect(total(t.highestScoring[0])).toBeGreaterThanOrEqual(total(t.highestScoring[4]))
  })

  it('classifies one-score games and blowouts by margin', () => {
    expect(t.oneScore.every((g) => Math.abs(g.score[0] - g.score[1]) <= 8)).toBe(true)
    expect(t.blowouts.every((g) => Math.abs(g.score[0] - g.score[1]) >= 21)).toBe(true)
  })
})

describe('seasonTotals (empty schedule)', () => {
  const t = seasonTotals(GAMES) // 2026: scheduled but unplayed

  it('reports nothing played and every game remaining', () => {
    expect(t.played).toBe(0)
    expect(t.totalPoints).toBe(0)
    expect(t.remaining).toBe(t.scheduled)
    expect(t.scheduled).toBeGreaterThan(0)
  })

  it('avoids dividing by zero', () => {
    expect(t.ppg).toBe(0)
    expect(t.combinedPpg).toBe(0)
    expect(t.homeWinPct).toBe(0)
  })
})

describe('teamScoring', () => {
  it('ranks offense, defense and differential over a populated season', () => {
    const rows = teamScoring(GAMES_2025)
    expect(rows.length).toBe(32)
    // Sorted by point differential, best first.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].diff).toBeGreaterThanOrEqual(rows[i].diff)
    }
    // Every team has a full set of 1..32 ranks.
    const offRanks = rows.map((r) => r.offRank).sort((a, b) => a - b)
    expect(offRanks[0]).toBe(1)
    expect(offRanks[31]).toBe(32)
  })

  it('ranks defense by fewest points allowed', () => {
    const rows = teamScoring([
      game({ home: 'KC', away: 'DEN', score: [30, 10] }),
      game({ home: 'BUF', away: 'MIA', score: [20, 19] }),
    ])
    const kc = rows.find((r) => r.abbr === 'KC')
    const buf = rows.find((r) => r.abbr === 'BUF')
    expect(kc.defRank).toBeLessThan(buf.defRank)
  })

  it('returns nothing when no team has played', () => {
    expect(teamScoring(GAMES)).toEqual([])
  })
})

describe('LEADER_CATEGORIES', () => {
  it('describes eight leaderboards with a key, label, short and unit', () => {
    expect(LEADER_CATEGORIES).toHaveLength(8)
    for (const c of LEADER_CATEGORIES) {
      expect(c).toMatchObject({
        key: expect.any(String),
        label: expect.any(String),
        short: expect.any(String),
        unit: expect.any(String),
      })
    }
  })
})

describe('leaderboard', () => {
  const players = [
    { id: '1', name: 'Alpha', team: 'KC', passYds: 400, rushYds: 10 },
    { id: '2', name: 'Bravo', team: 'KC', passYds: 300, rushYds: 20 },
    { id: '3', name: 'Charlie', team: 'DEN', passYds: 300, rushYds: 0 },
    { id: '4', name: 'Delta', team: 'DEN', passYds: 100 },
  ]

  it('gives tied players a shared rank and consumes the slots below', () => {
    const rows = leaderboard('passYds', { players, limit: 10 })
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4])
    // A tie breaks alphabetically by name (Bravo before Charlie).
    expect(rows[1].name).toBe('Bravo')
    expect(rows[2].name).toBe('Charlie')
  })

  it('keeps everyone tied at the cutoff rather than truncating mid-tie', () => {
    const rows = leaderboard('passYds', { players, limit: 2 })
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.rank <= 2)).toBe(true)
  })

  it('drops players missing the stat instead of ranking them zero', () => {
    const rows = leaderboard('rushYds', { players, limit: 10 })
    // Delta has no rushYds and is excluded.
    expect(rows.map((r) => r.name)).toEqual(['Bravo', 'Alpha', 'Charlie'])
  })

  it('returns everyone when the limit exceeds the field', () => {
    const rows = leaderboard('passYds', { players, limit: 50 })
    expect(rows).toHaveLength(4)
  })

  it('defaults to the committed (empty) player table', () => {
    expect(leaderboard('passYds')).toEqual([])
  })
})

describe('playersByTeam', () => {
  const players = [
    { id: '1', name: 'Alpha', team: 'KC', passYds: 100, rushYds: 50, recYds: 0 },
    { id: '2', name: 'Bravo', team: 'KC', rushYds: 500 },
    // A receiver with no passing/rushing yards — every scrimmage component nullish
    // for at least one KC player, exercising each `?? 0` default.
    { id: '4', name: 'Echo', team: 'KC', recYds: 300 },
    { id: '3', name: 'Charlie', team: 'DEN', recYds: 900 },
  ]

  it('filters to one team and sorts by yards from scrimmage', () => {
    const roster = playersByTeam('KC', players)
    expect(roster.map((p) => p.name)).toEqual(['Bravo', 'Echo', 'Alpha'])
  })

  it('defaults to the committed (empty) player table', () => {
    expect(playersByTeam('KC')).toEqual([])
  })
})
