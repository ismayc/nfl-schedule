import { describe, it, expect } from 'vitest'
import { PLAYERS } from '../../src/data/leaders.js'
import { ALL_ABBRS } from '../../src/data/teams.js'
import { leaderboard, LEADER_CATEGORIES } from '../../src/utils/stats.js'

// LIVE suite (npm run test:data): reads the real, refreshed player table.
//
// Only INVARIANTS belong here: things true of any valid table, on any day of any season,
// including the first day (no games played, the table empty). A fact about the current
// season (who leads, how many players qualify) does not belong, because the day it stops
// being true it blocks a refresh that did nothing wrong. This repo's week-1 refresh went
// red on September 6, 2026 on exactly that: two tests asserting the table was empty.
// Every check below loops over the rows, so an empty table passes them all vacuously.
//
// Unlike the basketball siblings, an NFL row has one `team` and no per-club `teams` list.

const known = new Set(ALL_ABBRS)

describe('the refreshed player table', () => {
  it('gives every player a unique id and a name', () => {
    const ids = PLAYERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PLAYERS) expect(p.name, p.id).toBeTruthy()
  })

  it('puts every player on a real team', () => {
    for (const p of PLAYERS) expect(known.has(p.team), `${p.name} team=${p.team}`).toBe(true)
  })

  it('holds every stat as a finite number or null, never NaN or a string', () => {
    for (const p of PLAYERS) {
      for (const [k, v] of Object.entries(p)) {
        if (['id', 'name', 'short', 'pos', 'team'].includes(k)) continue
        expect(v === null || Number.isFinite(v), `${p.name}.${k} = ${v}`).toBe(true)
      }
    }
  })

  it('builds every leaderboard, ranked in order, without throwing', () => {
    for (const cat of LEADER_CATEGORIES) {
      const rows = leaderboard(cat.key, { limit: 10 })
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].value, cat.key).toBeGreaterThanOrEqual(rows[i].value)
        expect(rows[i - 1].rank, cat.key).toBeLessThanOrEqual(rows[i].rank)
      }
    }
  })
})
