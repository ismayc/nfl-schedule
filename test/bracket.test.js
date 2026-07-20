import { describe, it, expect } from 'vitest'
import { GAMES_2025 } from './fixtures/season-2025.js'
import { GAMES as GAMES_2026 } from '../src/data/schedule.js'
import { buildBracket } from '../src/utils/bracket.js'
import { conferenceSeeds } from '../src/utils/standings.js'

// Regular season only, so we can bolt on a hand-crafted postseason and drive the
// projection paths that a fully-played fixture never exercises.
const REG = GAMES_2025.filter((g) => g.seasonType === 'regular')
const afcSeed = Object.fromEntries(conferenceSeeds(REG).AFC.map((r) => [r.seed, r.abbr]))
const post = (over) => ({ seasonType: 'postseason', ...over })

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

describe('partial postseason projections', () => {
  it('projects the Conference Championship host by reseeding the two Divisional winners', () => {
    // AFC seeds 1..4 (by record). Play only the Divisional round, with the lower seed
    // upsetting in the first game so the finalists come out of seed order — the
    // Conference game must still put the higher remaining seed at home.
    const games = [
      ...REG,
      // Game 1: seed 2 hosts seed 3, seed 3 (away) wins the upset.
      post({ id: 'div1', round: 'DIV', tip: 't1', home: afcSeed[2], away: afcSeed[3], score: [17, 24] }),
      // Game 2: seed 1 hosts seed 4, seed 1 wins.
      post({ id: 'div2', round: 'DIV', tip: 't2', home: afcSeed[1], away: afcSeed[4], score: [30, 10] }),
    ]
    const c = buildBracket(games).conferences.AFC
    expect(c.CONF.projected).toBe(true)
    // finalists arrive as [seed3, seed1]; the reseed swaps seed1 to host.
    expect(c.CONF.home).toBe(afcSeed[1])
    expect(c.CONF.away).toBe(afcSeed[3])
    expect(c.CONF.seedHome).toBe(1)
  })

  it('leaves a Wild Card matchup undecided while its game has no score yet', () => {
    // A postseason game that exists but has not been played: mapped into the bracket
    // but with no winner and not marked played.
    const games = [
      ...REG,
      post({ id: 'wc-open', round: 'WC', tip: 't1', home: afcSeed[2], away: afcSeed[7] }),
    ]
    const c = buildBracket(games).conferences.AFC
    const m = c.WC.find((x) => x.id === 'wc-open')
    expect(m.played).toBe(false)
    expect(m.winner).toBeUndefined()
  })

  it('reseeds the Divisional round from the bye team plus three Wild Card winners', () => {
    // Play only the Wild Card round (2v7, 3v6, 4v5); the #1 seed byes. The projected
    // Divisional round pairs the top remaining seed against the bottom.
    const games = [
      ...REG,
      post({ id: 'wc1', round: 'WC', tip: 't1', home: afcSeed[2], away: afcSeed[7], score: [30, 10] }),
      post({ id: 'wc2', round: 'WC', tip: 't2', home: afcSeed[3], away: afcSeed[6], score: [28, 24] }),
      post({ id: 'wc3', round: 'WC', tip: 't3', home: afcSeed[4], away: afcSeed[5], score: [21, 17] }),
    ]
    const c = buildBracket(games).conferences.AFC
    // Winners are seeds 2, 3, 4; with the #1 bye that is the full four-team field.
    expect(c.DIV).toHaveLength(2)
    expect(c.DIV.every((m) => m.projected)).toBe(true)
    // Top seed (1) hosts the lowest remaining (4); 2 hosts 3.
    expect(c.DIV[0].home).toBe(afcSeed[1])
    expect(c.DIV[0].away).toBe(afcSeed[4])
    expect(c.DIV[1].home).toBe(afcSeed[2])
    expect(c.DIV[1].away).toBe(afcSeed[3])
  })
})
