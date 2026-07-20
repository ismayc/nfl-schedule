import { describe, it, expect } from 'vitest'
import { GAMES_2025 } from './fixtures/season-2025.js'
import { GAMES as GAMES_2026 } from '../src/data/schedule.js'
import { buildBracket } from '../src/utils/bracket.js'

// Test the bracket against a REAL completed postseason with a known champion
// (PLAYBOOK §7) — real data has the edge cases a synthetic bracket wouldn't.
const b = buildBracket(GAMES_2025)

describe('single-elimination bracket, 2025 (completed)', () => {
  it('knows the season is played and a postseason exists', () => {
    expect(b.regularSeasonStarted).toBe(true)
    expect(b.hasPostseason).toBe(true)
  })

  it('gives each conference a #1-seed bye and three Wild Card games, all played', () => {
    for (const conf of ['AFC', 'NFC']) {
      const c = b.conferences[conf]
      expect(c.byeTeam).toBeTruthy()
      expect(c.WC).toHaveLength(3)
      expect(c.WC.every((m) => m.played && m.winner)).toBe(true)
      // The bye team is not one of the Wild Card participants.
      const wcTeams = c.WC.flatMap((m) => [m.home, m.away])
      expect(wcTeams).not.toContain(c.byeTeam)
    }
  })

  it('reseeds the Divisional round: the bye team is in it, and both games are decided', () => {
    for (const conf of ['AFC', 'NFC']) {
      const c = b.conferences[conf]
      expect(c.DIV).toHaveLength(2)
      const divTeams = c.DIV.flatMap((m) => [m.home, m.away])
      expect(divTeams).toContain(c.byeTeam)
      expect(c.DIV.every((m) => m.played && m.winner)).toBe(true)
    }
  })

  it('crowns a conference champion who won the Conference Championship game', () => {
    for (const conf of ['AFC', 'NFC']) {
      const c = b.conferences[conf]
      expect(c.CONF.played).toBe(true)
      expect(c.champion).toBe(c.CONF.winner)
    }
  })

  it('every postseason game maps into the bracket exactly once (13 total)', () => {
    const post = GAMES_2025.filter((g) => g.seasonType === 'postseason')
    expect(post.length).toBe(13) // 6 WC + 4 DIV + 2 CONF + 1 SB
    const placed = new Set()
    for (const conf of ['AFC', 'NFC']) {
      const c = b.conferences[conf]
      for (const m of [...c.WC, ...c.DIV, c.CONF]) if (m.id) placed.add(m.id)
    }
    if (b.sb.id) placed.add(b.sb.id)
    expect(placed.size).toBe(13)
  })

  it('the Super Bowl is between the two conference champions, and produces one champion', () => {
    expect([b.conferences.AFC.champion, b.conferences.NFC.champion].sort()).toEqual(
      [b.sb.home, b.sb.away].sort()
    )
    expect(b.champion).toBe(b.sb.winner)
    expect(b.champion).toBeTruthy()
  })
})

describe('bracket before the season starts (committed 2026)', () => {
  it('reports an unplayed season and renders nothing decided', () => {
    const empty = buildBracket(GAMES_2026)
    expect(empty.regularSeasonStarted).toBe(false)
    expect(empty.hasPostseason).toBe(false)
    expect(empty.champion).toBeUndefined()
  })
})
