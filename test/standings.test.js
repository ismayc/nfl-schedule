import { describe, it, expect } from 'vitest'
import { GAMES_2025 } from './fixtures/season-2025.js'
import {
  computeStandings,
  countsForStandings,
  compareTeams,
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

// ── Official tie-breaking procedures ───────────────────────────────────────────
// Synthetic fixtures ONLY (the nightly refresh must never move these). Every fixture is
// hand-built so exactly ONE step decides the tie while a LATER step — or the
// alphabetical coin-toss stand-in — favors the OTHER club, so each test fails if its
// targeted step is removed from the chain. Divisions used: AFC East = BUF MIA NE NYJ,
// AFC North = BAL CIN CLE PIT, AFC South = HOU IND JAX TEN, AFC West = DEN KC LAC LV.
let synId = 0
const sg = (home, away, hs, as) => ({
  id: `syn-${synId++}`,
  seasonType: 'regular',
  tip: '2026-09-13T17:00:00.000Z',
  home,
  away,
  score: [hs, as],
})
// sameDivision:true → the official DIVISION chain; default → the WILD-CARD chain.
const cmpDiv = (games, a, b) => {
  const t = computeStandings(games)
  return compareTeams(t[a], t[b], games, { table: t, sameDivision: true })
}
const cmpWC = (games, a, b) => {
  const t = computeStandings(games)
  return compareTeams(t[a], t[b], games, { table: t })
}

describe('division tiebreaker, two clubs (official steps in order)', () => {
  it('step 1: head-to-head, even when a later step favors the other club', () => {
    // BUF beat MIA head-to-head; SOV favors MIA (NE, whom MIA beat, is 2-1 while BUF's
    // beaten opponent MIA is 1-1). Both 1-1 overall, division/conference records tied,
    // no common opponents. Remove step 1 and MIA wins at strength of victory.
    const games = [
      sg('BUF', 'MIA', 20, 10),
      sg('NYJ', 'BUF', 20, 10),
      sg('MIA', 'NE', 20, 10),
      sg('NE', 'CLE', 20, 10),
      sg('NE', 'CIN', 20, 10),
    ]
    expect(cmpDiv(games, 'BUF', 'MIA')).toBeLessThan(0)
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeGreaterThan(0)
  })

  it('counts a tied head-to-head game as half a win in the step', () => {
    // BUF is 1-0-1 against MIA: the tie counts half, so head-to-head is .75 vs .25.
    const games = [
      sg('BUF', 'MIA', 20, 10),
      sg('MIA', 'BUF', 20, 20),
      sg('MIA', 'KC', 20, 10),
      sg('KC', 'BUF', 20, 10),
    ]
    expect(headToHead(games, 'BUF', 'MIA')).toEqual({ w: 1, l: 0, t: 1 })
    expect(cmpDiv(games, 'BUF', 'MIA')).toBeLessThan(0)
  })

  it('step 2: division record, after a split head-to-head', () => {
    // Head-to-head split 1-1. BUF's third win is in-division (div 2-1), MIA's is not
    // (div 1-1) — BUF takes step 2. MIA outscores BUF, so removing the step hands MIA
    // the tie at the combined-ranking step.
    const games = [
      sg('BUF', 'MIA', 20, 10),
      sg('MIA', 'BUF', 20, 10),
      sg('BUF', 'NYJ', 20, 10),
      sg('MIA', 'KC', 30, 10),
    ]
    expect(cmpDiv(games, 'BUF', 'MIA')).toBeLessThan(0)
  })

  it('step 3: common games by percentage — and the wild-card chain gates the same fixture out', () => {
    // Common opponents {KC, DEN}: MIA is 2-0 against them, BUF 1-1 — but only TWO
    // common games. The division chain has NO four-game minimum, so MIA wins there;
    // the wild-card chain's official minimum of four skips the step, and BUF wins at
    // the combined-ranking step instead. Same games, different chains, different
    // winners — removing either the step or the gate flips one of the two assertions.
    const games = [
      sg('BUF', 'KC', 20, 10),
      sg('DEN', 'BUF', 20, 10),
      sg('BUF', 'PIT', 20, 2),
      sg('MIA', 'KC', 20, 10),
      sg('MIA', 'DEN', 20, 18),
      sg('CLE', 'MIA', 20, 2),
      sg('PIT', 'CLE', 20, 10), // equalizes SOV: PIT and CLE both finish 1-1
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0) // division: common games decide
    expect(cmpWC(games, 'BUF', 'MIA')).toBeLessThan(0) // wild card: min-four gate skips them
  })

  it('step 4: conference record, after tied common games', () => {
    // Split head-to-head, division 2-1 each, one common opponent (NE) both beat. BUF's
    // extra win is in-conference (KC), MIA's is not (ATL) — BUF takes step 4. ATL is
    // 2-1 to KC's 0-1, so removing the step gives MIA strength of victory.
    const games = [
      sg('BUF', 'MIA', 20, 10),
      sg('MIA', 'BUF', 20, 10),
      sg('BUF', 'NE', 20, 10),
      sg('MIA', 'NE', 20, 10),
      sg('BUF', 'KC', 20, 10),
      sg('MIA', 'ATL', 30, 10),
      sg('ATL', 'CAR', 20, 10),
      sg('ATL', 'TB', 20, 10),
    ]
    expect(cmpDiv(games, 'BUF', 'MIA')).toBeLessThan(0)
  })

  it('step 5: strength of victory, with everything after it dead even', () => {
    // Both played {KC, DEN}, so SOS and common games tie; MIA beat DEN (2-1), BUF beat
    // KC (1-1) — SOV takes MIA. All points are symmetric 20-10s, so every later step
    // ties and removing SOV would fall through to the coin toss and pick BUF.
    const games = [
      sg('BUF', 'KC', 20, 10),
      sg('DEN', 'BUF', 20, 10),
      sg('MIA', 'DEN', 20, 10),
      sg('KC', 'MIA', 20, 10),
      sg('DEN', 'NYG', 20, 10),
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0)
  })

  it('step 6: strength of schedule, when both beat the same club', () => {
    // Both beat only KC (SOV identical). BUF's other game is against 1-0 LV, MIA's
    // against 2-0 DEN — MIA played the tougher slate. Symmetric scores again: remove
    // SOS and the coin toss picks BUF.
    const games = [
      sg('BUF', 'KC', 20, 10),
      sg('LV', 'BUF', 20, 10),
      sg('MIA', 'KC', 20, 10),
      sg('DEN', 'MIA', 20, 10),
      sg('DEN', 'NYG', 20, 10),
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0)
  })

  it('step 7: combined conference ranking in points scored and allowed', () => {
    // Identical schedules ({KC, DEN}), so steps 1-6 tie; net points are +12 for both,
    // so steps 9-10 tie. PIT (pf 41) sits between BUF's 40 and MIA's 42 in the AFC
    // scoring table, tipping the conference rank sum to MIA — while NYG/ATL/CAR mirror
    // the arithmetic in the NFC so the LEAGUE-wide sums stay equal (step 8 ties).
    const games = [
      sg('BUF', 'KC', 25, 10),
      sg('DEN', 'BUF', 18, 15),
      sg('MIA', 'KC', 26, 11),
      sg('DEN', 'MIA', 19, 16),
      sg('PIT', 'NYG', 21, 20),
      sg('NYG', 'PIT', 40, 20),
      sg('ATL', 'CAR', 30, 29),
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0)
    expect(cmpWC(games, 'MIA', 'BUF')).toBeLessThan(0) // same step, wild-card chain
  })

  it('step 8: combined league-wide ranking when the conference ranking ties', () => {
    // Same adjacent-rank cancellation, but the tipping club (NYG, pf 41) is in the
    // OTHER conference: conference sums tie, league sums favor MIA.
    const games = [
      sg('BUF', 'KC', 25, 10),
      sg('DEN', 'BUF', 18, 15),
      sg('MIA', 'KC', 26, 11),
      sg('DEN', 'MIA', 19, 16),
      sg('NYG', 'ATL', 41, 30),
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0)
    expect(cmpWC(games, 'MIA', 'BUF')).toBeLessThan(0)
  })

  it('step 9: net points in common games, with net points overall tied', () => {
    // Both 1-1 vs common {KC, DEN}; MIA's common net is +25 to BUF's +15, but each
    // club's season pf and pa are exactly 60-60, so both ranking steps and overall net
    // points tie. Removing step 9 falls to the coin toss and BUF.
    const games = [
      sg('BUF', 'KC', 30, 10),
      sg('DEN', 'BUF', 20, 15),
      sg('PIT', 'BUF', 30, 15),
      sg('MIA', 'KC', 35, 5),
      sg('DEN', 'MIA', 15, 10),
      sg('CLE', 'MIA', 40, 15),
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0)
  })

  it('step 10: net points in all games, when common net points tie', () => {
    // Common net is +15 for both; MIA's non-common loss is narrower (-1 vs -5), so
    // overall net favors MIA (+14 vs +10). pf/pa are adjacent (65/55 vs 64/50) with no
    // third club between them, so both ranking steps tie by cancellation.
    const games = [
      sg('BUF', 'KC', 31, 10),
      sg('DEN', 'BUF', 22, 16),
      sg('PIT', 'BUF', 23, 18),
      sg('MIA', 'KC', 30, 10),
      sg('DEN', 'MIA', 20, 15),
      sg('CLE', 'MIA', 20, 19),
    ]
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeLessThan(0)
  })

  it('steps 11-12: net touchdowns is a documented skip, and the coin toss is alphabetical', () => {
    // Two clubs with mirror-identical records against opponents outside the league
    // table: every step ties or skips (net touchdowns CANNOT be computed — the
    // committed data has final scores only), so the deterministic alphabetical
    // coin-toss stand-in decides, in both chains and both argument orders.
    const games = [sg('BUF', 'XXX', 20, 10), sg('MIA', 'YYY', 20, 10)]
    expect(cmpDiv(games, 'BUF', 'MIA')).toBeLessThan(0)
    expect(cmpDiv(games, 'MIA', 'BUF')).toBeGreaterThan(0)
    expect(cmpWC(games, 'BUF', 'MIA')).toBeLessThan(0)
    expect(cmpWC(games, 'MIA', 'BUF')).toBeGreaterThan(0)
  })

  it('overall percentage decides before any chain step runs', () => {
    // Different pct never reaches the chains; also exercises the option-less call
    // (table derived internally, wild-card chain by default).
    const games = [sg('KC', 'LV', 20, 10), sg('KC', 'LV', 20, 10), sg('LV', 'DEN', 20, 10)]
    const t = computeStandings(games)
    expect(compareTeams(t.KC, t.LV, games)).toBeLessThan(0)
    expect(compareTeams(t.LV, t.KC, games)).toBeGreaterThan(0)
  })
})

describe('wild-card tiebreaker, two clubs from different divisions', () => {
  it('step 1: head-to-head, only because they played', () => {
    // PIT beat BUF outright; BUF has the better conference record (.500 vs .333), so
    // removing head-to-head hands BUF the tie at step 2.
    const games = [
      sg('PIT', 'BUF', 20, 10),
      sg('BUF', 'KC', 20, 10),
      sg('CIN', 'PIT', 20, 10),
      sg('CLE', 'PIT', 20, 10),
      sg('PIT', 'NYG', 20, 10),
    ]
    expect(cmpWC(games, 'PIT', 'BUF')).toBeLessThan(0)
  })

  it('step 2: conference record when the clubs never met', () => {
    // No head-to-head, no common opponents. BUF's win is in-conference, PIT's is not —
    // BUF takes step 2. PIT's beaten opponent (NYG, 2-1) far outclasses BUF's (KC,
    // 0-1), so removing the step gives PIT strength of victory.
    const games = [
      sg('BUF', 'KC', 20, 10),
      sg('ATL', 'BUF', 20, 10),
      sg('PIT', 'NYG', 20, 10),
      sg('TB', 'PIT', 20, 10),
      sg('NYG', 'PHI', 20, 10),
      sg('NYG', 'DAL', 20, 10),
    ]
    expect(cmpWC(games, 'BUF', 'PIT')).toBeLessThan(0)
  })

  it('step 3: common games decide once the four-game minimum is met', () => {
    // Four common opponents (the whole AFC West): BUF 3-1, PIT 2-2. CLE (whom PIT
    // beat) is 2-1 to LAC's 1-1, so removing the step gives PIT strength of victory.
    const games = [
      sg('BUF', 'KC', 20, 10),
      sg('BUF', 'DEN', 20, 10),
      sg('BUF', 'LAC', 20, 10),
      sg('LV', 'BUF', 20, 10),
      sg('NYJ', 'BUF', 20, 10),
      sg('PIT', 'KC', 20, 10),
      sg('PIT', 'DEN', 20, 10),
      sg('LAC', 'PIT', 20, 10),
      sg('LV', 'PIT', 20, 10),
      sg('PIT', 'CLE', 20, 10),
      sg('CLE', 'NYG', 20, 10),
      sg('CLE', 'DAL', 20, 10),
    ]
    expect(cmpWC(games, 'BUF', 'PIT')).toBeLessThan(0)
  })

  it('steps 4-5: strength of victory then strength of schedule (shared with the division chain)', () => {
    // The SOV fixture from the division chain, read through the wild-card chain: the
    // two common games are under the four-game minimum, so the chain skips straight
    // from conference record to SOV.
    const sov = [
      sg('BUF', 'KC', 20, 10),
      sg('DEN', 'BUF', 20, 10),
      sg('MIA', 'DEN', 20, 10),
      sg('KC', 'MIA', 20, 10),
      sg('DEN', 'NYG', 20, 10),
    ]
    expect(cmpWC(sov, 'MIA', 'BUF')).toBeLessThan(0)
    const sos = [
      sg('BUF', 'KC', 20, 10),
      sg('LV', 'BUF', 20, 10),
      sg('MIA', 'KC', 20, 10),
      sg('DEN', 'MIA', 20, 10),
      sg('DEN', 'NYG', 20, 10),
    ]
    expect(cmpWC(sos, 'MIA', 'BUF')).toBeLessThan(0)
  })

  it('step 8: net points in CONFERENCE games (not common games)', () => {
    // Identical 1-1 records and identical season pf/pa (ranks tie), identical overall
    // net (-10): only the SPLIT differs — PIT is +10 in conference play to BUF's +5.
    // Removing the step falls through tied net-points-overall to the coin toss (BUF).
    const games = [
      sg('PIT', 'KC', 30, 20),
      sg('ATL', 'PIT', 30, 10),
      sg('BUF', 'KC', 25, 20),
      sg('ATL', 'BUF', 30, 15),
    ]
    expect(cmpWC(games, 'PIT', 'BUF')).toBeLessThan(0)
  })

  it('step 9: net points in all games when conference net ties', () => {
    // Conference net is +15 for both; PIT's non-conference loss is narrower, so
    // overall net favors PIT (+14 vs +10) with rank sums tied by adjacent-rank
    // cancellation (65/55 vs 64/50, no club between).
    const games = [
      sg('BUF', 'KC', 31, 10),
      sg('DEN', 'BUF', 22, 16),
      sg('TB', 'BUF', 23, 18),
      sg('PIT', 'KC', 30, 10),
      sg('DEN', 'PIT', 20, 15),
      sg('NO', 'PIT', 20, 19),
    ]
    expect(cmpWC(games, 'PIT', 'BUF')).toBeLessThan(0)
  })
})

describe('division tiebreaker, three or more clubs, with the official restart rule', () => {
  it('3 -> 2: the two survivors restart at step 1 of the TWO-club chain', () => {
    // BUF/MIA/NE all .500, round-robin 1-1 each (step 1 ties). NE's extra division
    // loss eliminates it at step 2. The survivors must RESTART at two-club step 1:
    // head-to-head, which BUF won. Without the restart the chain would continue at
    // step 3, where the only common opponent (NE) favors MIA — so this fails if the
    // restart is removed.
    const games = [
      sg('BUF', 'MIA', 20, 10),
      sg('MIA', 'NE', 20, 10),
      sg('NE', 'BUF', 20, 10),
      sg('NYJ', 'NE', 20, 10),
      sg('NE', 'ATL', 20, 10),
    ]
    const east = divisionStandings(games)['AFC East'].map((r) => r.abbr)
    // NYJ is 1-0 (pct 1.0) and tops the table alone; the .500 group resolves behind it.
    expect(east).toEqual(['NYJ', 'BUF', 'MIA', 'NE'])
  })

  it('4 -> 3: the three survivors restart at step 2, NOT at head-to-head', () => {
    // Four clubs at .500. Steps 1-2 tie; the four-club common set ({KC}) eliminates
    // MIA at step 3. The trio must restart at step 2 (division record, tied) — NOT at
    // step 1, where NE holds the best head-to-head among the trio and would wrongly
    // win. The trio's common set ({KC, DEN}) then drops NYJ, and the last pair
    // restarts at two-club step 1 (never met -> skip) down to the conference ranking
    // step, where BUF's 40-point win takes it.
    const games = [
      sg('BUF', 'MIA', 20, 10),
      sg('NE', 'NYJ', 20, 10),
      sg('MIA', 'NE', 20, 10),
      sg('NYJ', 'BUF', 20, 10),
      sg('BUF', 'KC', 40, 10),
      sg('NE', 'KC', 20, 10),
      sg('NYJ', 'KC', 20, 10),
      sg('KC', 'MIA', 20, 10),
      sg('BUF', 'DEN', 20, 10),
      sg('NE', 'DEN', 20, 10),
      sg('DEN', 'NYJ', 20, 10),
      sg('ATL', 'BUF', 20, 10),
      sg('CAR', 'BUF', 20, 10),
      sg('ATL', 'NE', 20, 10),
      sg('CAR', 'NE', 20, 10),
      sg('MIA', 'TB', 20, 10),
    ]
    const east = divisionStandings(games)['AFC East'].map((r) => r.abbr)
    // Positions 2-4 re-run the procedure: MIA holds the best head-to-head among
    // {MIA, NE, NYJ} (1.0), then NE beat NYJ.
    expect(east).toEqual(['BUF', 'MIA', 'NE', 'NYJ'])
  })
})

// Clear-cut division winners so the wild-card scenarios below stay isolated: each
// winner sweeps a two-game set against a division mate and nobody else in that division
// reaches .500.
const afcWinners = () => [
  sg('BUF', 'NYJ', 20, 10),
  sg('BUF', 'NYJ', 20, 10),
  sg('BAL', 'CLE', 20, 10),
  sg('BAL', 'CLE', 20, 10),
  sg('HOU', 'JAX', 20, 10),
  sg('HOU', 'JAX', 20, 10),
  sg('KC', 'LV', 20, 10),
  sg('KC', 'LV', 20, 10),
]
const wildcards = (games) =>
  conferenceSeeds(games)
    .AFC.filter((r) => r.seed >= 5 && r.seed <= 7)
    .map((r) => r.abbr)
// Local pct helper for conference sub-records in assertions (ties count half).
const pct5 = (r) => (r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0)

describe('wild card, three or more clubs: one club per division, frozen order', () => {
  // CIN, PIT (AFC North) and TEN (AFC South) all .500. The frozen division order ranks
  // CIN over PIT (division record), even though PIT beats CIN on the WILD-CARD chain
  // (conference record) — asserted directly below. The one-club-per-division rule must
  // therefore field CIN against TEN, and PIT can never leapfrog its division mate:
  // official order TEN, CIN, PIT. A naive flat sort by the wild-card comparator would
  // put PIT first.
  const games = [
    ...afcWinners(),
    sg('KC', 'LV', 20, 10), // KC 3-0 so CIN's loss to KC below can't drag KC to a tie
    sg('CIN', 'CLE', 20, 10),
    sg('KC', 'CIN', 20, 10),
    sg('PIT', 'LAC', 20, 10),
    sg('NYG', 'PIT', 20, 10),
    sg('TEN', 'IND', 20, 10),
    sg('CAR', 'TEN', 20, 10),
  ]

  it('freezes the division order by the DIVISION procedure, not the wild-card chain', () => {
    const north = divisionStandings(games)['AFC North'].map((r) => r.abbr)
    expect(north).toEqual(['BAL', 'CIN', 'PIT', 'CLE'])
    // The wild-card chain disagrees with that order — PIT wins it pairwise on
    // conference record — which is exactly what the frozen rule must override.
    expect(cmpWC(games, 'PIT', 'CIN')).toBeLessThan(0)
  })

  it('eliminates the lower-ranked division mate before comparing across divisions', () => {
    // Seed 5: reps are CIN (North, frozen rank) and TEN (South); TEN wins on
    // conference record. Seed 6: {CIN, PIT} reduces to CIN alone. PIT is last despite
    // being the flat-sort favorite.
    expect(wildcards(games)).toEqual(['TEN', 'CIN', 'PIT'])
  })
})

describe('wild card: the whole procedure repeats for each successive slot', () => {
  it('re-runs the one-club-per-division elimination for the second wild card', () => {
    // JAX > IND in the frozen AFC South order (head-to-head); LV is the AFC West
    // candidate; all three .500. Pass 1 fields {JAX, LV} and JAX wins head-to-head.
    // Pass 2 must REPEAT from scratch: IND is now the South's club and beats LV
    // head-to-head. A naive continuation of pass 1 — where IND had been "eliminated" —
    // would seed LV second: the official repeat makes IND the second wild card.
    // Winners built inline: HOU's two-game set beats TEN here (not JAX, who must stay
    // at .500 to contend).
    const games = [
      sg('BUF', 'NYJ', 20, 10),
      sg('BUF', 'NYJ', 20, 10),
      sg('BAL', 'CLE', 20, 10),
      sg('BAL', 'CLE', 20, 10),
      sg('HOU', 'TEN', 20, 10),
      sg('HOU', 'TEN', 20, 10),
      sg('KC', 'DEN', 20, 10),
      sg('KC', 'DEN', 20, 10),
      sg('JAX', 'IND', 20, 10),
      sg('JAX', 'LV', 20, 10),
      sg('IND', 'LV', 20, 10),
      sg('ATL', 'JAX', 20, 10),
      sg('CAR', 'JAX', 20, 10),
      sg('IND', 'TB', 20, 10),
      sg('NO', 'IND', 20, 10),
      sg('LV', 'NYG', 20, 10),
      sg('LV', 'DAL', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['JAX', 'IND', 'LV']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)).toEqual(['JAX', 'IND', 'LV'])
  })
})

describe('wild card, three or more clubs: head-to-head sweep', () => {
  it('advances a club that beat every other tied club', () => {
    // MIA swept CIN and TEN. Every club's conference record is .500 and there are no
    // common opponents, so without the sweep step the next decisive step is strength
    // of victory — where CIN (which beat 2-1 DAL and 2-1 NYG) wins. The sweep must
    // pre-empt that.
    const games = [
      ...afcWinners(),
      sg('KC', 'MIA', 20, 10), // KC 3-0, safely clear of the .500 group
      sg('MIA', 'CIN', 20, 10),
      sg('MIA', 'TEN', 20, 10),
      sg('LAC', 'MIA', 20, 10),
      sg('CIN', 'LAC', 20, 10),
      sg('CIN', 'DAL', 20, 10),
      sg('CIN', 'NYG', 20, 10),
      sg('TB', 'CIN', 20, 10),
      sg('TB', 'CIN', 20, 10),
      sg('TEN', 'IND', 20, 10),
      sg('TEN', 'GB', 20, 10),
      sg('DET', 'TEN', 20, 10),
      sg('DAL', 'WSH', 20, 10),
      sg('DAL', 'WSH', 20, 10),
      sg('NYG', 'PHI', 20, 10),
      sg('NYG', 'PHI', 20, 10),
      sg('SEA', 'LAC', 20, 10),
      sg('SF', 'LAC', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('MIA')
  })

  it('does NOT fire on a split — a partial head-to-head is no sweep', () => {
    // Same shape, but MIA and TEN split their two games: no club swept the group, so
    // the step passes and conference record (TEN, .667) decides. If a split counted as
    // a sweep, MIA would still advance.
    const games = [
      ...afcWinners(),
      sg('KC', 'MIA', 20, 10),
      sg('MIA', 'CIN', 20, 10),
      sg('MIA', 'TEN', 20, 10),
      sg('TEN', 'MIA', 20, 10),
      sg('CIN', 'LAC', 20, 10),
      sg('CIN', 'DAL', 20, 10),
      sg('CIN', 'NYG', 20, 10),
      sg('TB', 'CIN', 20, 10),
      sg('TB', 'CIN', 20, 10),
      sg('TEN', 'IND', 20, 10),
      sg('DET', 'TEN', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).not.toBe('MIA')
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('eliminates a club that lost to every other tied club, and restarts with two', () => {
    // TEN lost to both MIA and CIN, who never met each other: no sweeper, but TEN is
    // swept OUT. The remaining pair restarts at two-club step 1 (never met -> skip)
    // and CIN takes conference record. Without the elimination, TEN's .600 conference
    // record would win the three-way comparison at the very step CIN wins two-way.
    const games = [
      ...afcWinners(),
      sg('KC', 'MIA', 20, 10),
      sg('MIA', 'TEN', 20, 10),
      sg('MIA', 'NYG', 20, 10),
      sg('LAC', 'MIA', 20, 10),
      sg('CIN', 'TEN', 20, 10),
      sg('CLE', 'CIN', 20, 10),
      sg('CIN', 'DAL', 20, 10),
      sg('TB', 'CIN', 20, 10),
      sg('TEN', 'IND', 20, 10),
      sg('TEN', 'JAX', 20, 10),
      sg('TEN', 'LAC', 20, 10),
      sg('GB', 'TEN', 20, 10),
      sg('SEA', 'LAC', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    // TEN's conference record is the best of the three — proof the elimination, not a
    // conference-record comparison, removed it.
    expect(pct5(t.TEN.conf)).toBeGreaterThan(pct5(t.CIN.conf))
    expect(wildcards(games)[0]).toBe('CIN')
  })
})

describe('wild card, three clubs: every step of the multi-club chain can decide', () => {
  // Each fixture below ties (or skips) every step of the three-club wild-card chain
  // before the targeted one, and the alphabetical coin-toss stand-in favors CIN — so
  // the assertions fail if the targeted step is removed from THIS chain (the two-club
  // chains are pinned separately by the pairwise tests above).

  it('step 4: common games decide when the trio shares four common opponents', () => {
    // All three at .500 with conference records .500 and common set {KC, LAC, LV, DEN}
    // (four games each -> the minimum is met). TEN is 3-1 in common play, MIA/CIN 2-2.
    // DEN's weak record drags TEN's SOV below MIA's, so removing the step yields MIA.
    const games = [
      ...afcWinners(),
      sg('KC', 'MIA', 20, 10),
      sg('KC', 'CIN', 20, 10),
      sg('KC', 'TEN', 20, 10),
      sg('MIA', 'LAC', 20, 10),
      sg('CIN', 'LAC', 20, 10),
      sg('TEN', 'LAC', 20, 10),
      sg('MIA', 'LV', 20, 10),
      sg('LV', 'CIN', 20, 10),
      sg('TEN', 'LV', 20, 10),
      sg('DEN', 'MIA', 20, 10),
      sg('CIN', 'DEN', 20, 10),
      sg('TEN', 'DEN', 20, 10),
      sg('NE', 'TEN', 20, 10),
      sg('PIT', 'TEN', 20, 10),
      sg('SEA', 'NE', 20, 10),
      sg('SF', 'NE', 20, 10),
      sg('SEA', 'PIT', 20, 10),
      sg('SF', 'PIT', 20, 10),
      sg('LV', 'NYG', 20, 10),
      sg('LV', 'NYG', 20, 10),
      sg('LV', 'DAL', 20, 10),
      sg('SEA', 'LV', 20, 10),
      sg('SF', 'LV', 20, 10),
      sg('GB', 'LV', 20, 10),
      sg('GB', 'DEN', 20, 10),
      sg('SEA', 'LAC', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 4: the four-game minimum gates the trio too — one common game must not decide', () => {
    // The trio's only common opponent is LV, whom MIA and CIN beat and TEN lost to: if
    // the sub-minimum common record counted, TEN would be eliminated on the spot. The
    // gate skips it and TEN wins the tie at strength of victory (its victim DEN is
    // 2-3; LV is 1-4).
    const games = [
      ...afcWinners(),
      sg('MIA', 'LV', 20, 10),
      sg('CIN', 'LV', 20, 10),
      sg('LV', 'TEN', 20, 10),
      sg('KC', 'MIA', 20, 10),
      sg('KC', 'CIN', 20, 10),
      sg('TEN', 'DEN', 20, 10),
      sg('DEN', 'NYG', 20, 10),
      sg('DEN', 'NYG', 20, 10),
      sg('SEA', 'DEN', 20, 10),
      sg('SF', 'DEN', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 5: strength of victory, with schedule strength opposing it', () => {
    // Symmetric shells: each club beat one 0-2 team and lost to KC. TEN's victim (DEN,
    // 2-3) is the only one with wins, so SOV takes TEN — while TEN's overall schedule
    // is the WEAKEST, so removing SOV eliminates TEN at strength of schedule instead.
    const games = [
      ...afcWinners(),
      sg('KC', 'MIA', 20, 10),
      sg('KC', 'CIN', 20, 10),
      sg('KC', 'TEN', 20, 10),
      sg('MIA', 'LAC', 20, 10),
      sg('CIN', 'LV', 20, 10),
      sg('TEN', 'DEN', 20, 10),
      sg('MIA', 'ATL', 20, 20),
      sg('CIN', 'CAR', 20, 20),
      sg('TEN', 'TB', 20, 20),
      sg('LAC', 'SEA', 10, 20),
      sg('LV', 'SF', 10, 20),
      sg('DEN', 'NYJ', 20, 10),
      sg('DEN', 'NYJ', 20, 10),
      sg('SEA', 'DEN', 20, 10),
      sg('SF', 'DEN', 20, 10),
      sg('DEN', 'GB', 10, 20),
      sg('ATL', 'NYG', 20, 10),
      sg('ATL', 'DAL', 20, 10),
      sg('CAR', 'NYG', 20, 10),
      sg('CAR', 'DAL', 20, 10),
      sg('TB', 'NYG', 10, 20),
      sg('TB', 'DAL', 10, 20),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 6: strength of schedule, when the victims are identical', () => {
    // Each club beat a different 0-2 team (SOV all zero) and lost to KC; the third
    // game is a TIE against an NFC club — TB (2-0-1) makes TEN's slate the toughest.
    // Scores are mirror-identical, so every later step ties and removing SOS falls to
    // the coin toss (CIN).
    const games = [
      ...afcWinners(),
      sg('KC', 'MIA', 20, 10),
      sg('KC', 'CIN', 20, 10),
      sg('KC', 'TEN', 20, 10),
      sg('MIA', 'LAC', 20, 10),
      sg('CIN', 'LV', 20, 10),
      sg('TEN', 'DEN', 20, 10),
      sg('MIA', 'ATL', 20, 20),
      sg('CIN', 'CAR', 20, 20),
      sg('TEN', 'TB', 20, 20),
      sg('SEA', 'LAC', 20, 10),
      sg('SF', 'LV', 20, 10),
      sg('SEA', 'DEN', 20, 10),
      sg('TB', 'NYG', 20, 10),
      sg('TB', 'NYG', 20, 10),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 7: combined conference ranking, with the league ranking neutralized', () => {
    // Identical schedules (all three beat LAC, lost to KC) tie steps 2-6. Staggered
    // pf/pa (30/30, 32/32, 34/34) cancel pairwise — PIT (pf 33) tips the CONFERENCE
    // sum to TEN, while NYG (pa 33, from beating PIT) and DAL (pf 29, pa 33) rebalance
    // the LEAGUE sums to a three-way tie. Nets are zero all around.
    const games = [
      ...afcWinners(),
      sg('KC', 'LV', 21, 19), // pads KC's points-allowed out of the critical 30-34 band
      sg('KC', 'MIA', 20, 10),
      sg('KC', 'CIN', 22, 10),
      sg('KC', 'TEN', 24, 10),
      sg('MIA', 'LAC', 20, 10),
      sg('CIN', 'LAC', 22, 10),
      sg('TEN', 'LAC', 24, 10),
      sg('NYG', 'PIT', 27, 16),
      sg('NYG', 'PIT', 30, 17),
      sg('WSH', 'DAL', 16, 14),
      sg('WSH', 'DAL', 17, 15),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 8: combined league ranking, when the conference ranking ties', () => {
    // Same stagger, but the tipping clubs live entirely in the NFC: conference sums
    // tie three ways, and WSH (pf 33) breaks only the league sum in TEN's favor.
    const games = [
      ...afcWinners(),
      sg('KC', 'LV', 21, 19),
      sg('KC', 'MIA', 20, 10),
      sg('KC', 'CIN', 22, 10),
      sg('KC', 'TEN', 24, 10),
      sg('MIA', 'LAC', 20, 10),
      sg('CIN', 'LAC', 22, 10),
      sg('TEN', 'LAC', 24, 10),
      sg('WSH', 'DAL', 18, 14),
      sg('WSH', 'NYG', 15, 13),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBe(0.5)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 9: net points in conference games, with overall net tied', () => {
    // Every club is +5, +10 or +5 in conference play but exactly -15 overall; pf/pa
    // stagger (50/65, 51/66, 52/67) keeps both ranking steps tied by cancellation.
    // TEN's +10 conference net wins; removing the step falls through the tied overall
    // net to the coin toss.
    const games = [
      ...afcWinners(),
      sg('MIA', 'LAC', 30, 20),
      sg('CIN', 'LAC', 30, 20),
      sg('TEN', 'LAC', 32, 20),
      sg('KC', 'MIA', 20, 15),
      sg('KC', 'CIN', 21, 16),
      sg('KC', 'TEN', 20, 18),
      sg('ATL', 'MIA', 25, 5),
      sg('ATL', 'CIN', 25, 5),
      sg('ATL', 'TEN', 27, 2),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBeCloseTo(1 / 3, 10)
    expect(t.MIA.diff).toBe(-15)
    expect(t.CIN.diff).toBe(-15)
    expect(t.TEN.diff).toBe(-15)
    expect(wildcards(games)[0]).toBe('TEN')
  })

  it('step 10: net points in all games, when conference net ties', () => {
    // Conference nets are +5 for all three; TEN's narrower non-conference loss makes
    // it -14 overall to the others' -15, with the pf/pa stagger again cancelling both
    // ranking steps. Removing the step ends at the coin toss (CIN).
    const games = [
      ...afcWinners(),
      sg('MIA', 'LAC', 30, 20),
      sg('CIN', 'LAC', 31, 20),
      sg('TEN', 'LAC', 32, 20),
      sg('KC', 'MIA', 20, 15),
      sg('KC', 'CIN', 21, 15),
      sg('KC', 'TEN', 20, 13),
      sg('ATL', 'MIA', 25, 5),
      sg('ATL', 'CIN', 25, 5),
      sg('ATL', 'TEN', 27, 8),
    ]
    const t = computeStandings(games)
    for (const abbr of ['MIA', 'CIN', 'TEN']) expect(t[abbr].pct).toBeCloseTo(1 / 3, 10)
    expect(t.TEN.diff).toBe(-14)
    expect(wildcards(games)[0]).toBe('TEN')
  })
})

describe('conference seeding: ties among division winners use the wild-card procedures', () => {
  it('breaks a two-winner tie by head-to-head even though conference record disagrees', () => {
    // BUF and BAL both win their divisions at 2-1. BAL beat BUF head-to-head; BUF has
    // the better conference record (.667 vs .500), so removing the head-to-head step
    // would flip seeds 3 and 4.
    const games = [
      sg('BUF', 'NYJ', 20, 10),
      sg('BUF', 'NYJ', 20, 10),
      sg('BAL', 'BUF', 20, 10),
      sg('BAL', 'NYG', 20, 10),
      sg('PIT', 'BAL', 20, 10),
      sg('ATL', 'PIT', 20, 10),
      sg('CAR', 'PIT', 20, 10),
      sg('HOU', 'JAX', 20, 10),
      sg('HOU', 'JAX', 20, 10),
      sg('HOU', 'JAX', 20, 10),
      sg('KC', 'LV', 30, 10),
    ]
    const afc = conferenceSeeds(games).AFC
    const seedOf = Object.fromEntries(afc.map((r) => [r.abbr, r.seed]))
    // HOU (3-0) and KC (1-0) share pct 1.0 and take the top two seeds either way.
    expect([seedOf.HOU, seedOf.KC].sort()).toEqual([1, 2])
    expect(seedOf.BAL).toBe(3)
    expect(seedOf.BUF).toBe(4)
    // Division winners always outrank every wild card.
    expect(afc.slice(0, 4).every((r) => r.seedType === 'division')).toBe(true)
  })
})

describe('official procedures reproduce the 2025 postseason field exactly', () => {
  it('orders the identical-record NFC wild cards as the league did (LAR 5, SF 6)', () => {
    // The frozen 2025 fixture's own postseason is the proof: CAR (4) hosted LAR — the
    // 4v5 game — and PHI (3) hosted SF, the 3v6 game. The old pruned pairwise chain
    // ordered them SF then LAR; the official chain agrees with the league.
    const nfc = conferenceSeeds(GAMES_2025).NFC
    expect(nfc.find((r) => r.seed === 5).abbr).toBe('LAR')
    expect(nfc.find((r) => r.seed === 6).abbr).toBe('SF')
    expect(nfc.find((r) => r.seed === 7).abbr).toBe('GB')
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
