import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  OUT,
  OUTCOMES,
  MAX_OPEN_GAMES,
  MAX_BRANCHES,
  BUDGET_MS,
  remainingGames,
  favoritePicks,
  enumerateScenarios,
  rankScenario,
  seedBranches,
  outcomeOf,
  meanSeed,
  rowPercents,
  combinations,
  describeResult,
  conferenceOf,
} from '../src/utils/scenarios.js'
import { computeStandings, conferenceSeeds, countsForStandings } from '../src/utils/standings.js'

// The engine stops at a 200 ms wall-clock budget (BUDGET_MS) rather than freeze the
// page. Read on the real clock, that makes every test that expects a grid depend on how
// busy the machine is: on September 29, 2026 CI's clock rehearsal (a slower coverage run)
// and a loaded laptop both tripped it, and the grid tests found the "stopped rather than
// freeze" note instead. So the clock the budget reads is frozen by default here; the
// tests of the budget itself pass their own advancing clock.
beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0)
})
afterEach(() => {
  vi.restoreAllMocks()
})
import { GAMES_2025 } from './fixtures/season-2025.js'
import { GAMES as FROZEN } from './fixtures/frozen/schedule.js'

// Boards. Everything here is built from the real, completed 2025 season (the repo's truth
// fixture for seeding) or the frozen 2026 board, so the tiebreak chain meets real
// schedules: real division pairings, real common opponents, real cross-conference games.
const REG = GAMES_2025.filter((g) => g.seasonType === 'regular')
const unplay = (pred) => REG.map((g) => (pred(g) ? { ...g, score: undefined } : g))
const sideOf = (g) => (g.score[0] > g.score[1] ? 'home' : g.score[0] < g.score[1] ? 'away' : 'tie')
const ACTUAL = Object.fromEntries(REG.map((g) => [g.id, sideOf(g)]))
const W18 = unplay((g) => g.week === 18)
const W18_OPEN = remainingGames(W18)

// The index of a scenario, given who won each undecided game.
const indexOf = (undecided, sides) =>
  undecided.reduce((idx, g, i) => idx + OUTCOMES.indexOf(sides[g.id]) * 3 ** i, 0)

// The bucket a team is settled in for one scenario, or null when it is not settled.
const settledBucket = (result, abbr, idx) => {
  for (let s = 1; s <= OUT; s++) if (result.teams[abbr][s].scenarios.includes(idx)) return s
  return null
}

// A deterministic generator, so the property tests below replay identically.
const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

describe('remainingGames', () => {
  it('keeps unscored and live regular-season games, drops the rest, in kickoff order', () => {
    const g = (id, tip, over = {}) => ({ id, tip, seasonType: 'regular', home: 'KC', away: 'DEN', ...over })
    const games = [
      g('b', '2026-12-02T00:00:00Z'),
      g('a', '2026-12-01T00:00:00Z'),
      g('c', '2026-12-01T00:00:00Z', { score: [10, 7], live: true }),
      g('final', '2026-11-01T00:00:00Z', { score: [10, 7] }),
      g('pp', '2026-12-03T00:00:00Z', { postponed: true }),
      g('cx', '2026-12-03T00:00:00Z', { canceled: true }),
      g('post', '2027-01-10T00:00:00Z', { seasonType: 'postseason' }),
    ]
    expect(remainingGames(games).map((x) => x.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('enumerateScenarios: three outcomes per game', () => {
  const keep = W18_OPEN.slice(-2)
  const picks = Object.fromEntries(W18_OPEN.filter((g) => !keep.includes(g)).map((g) => [g.id, ACTUAL[g.id]]))
  const result = enumerateScenarios(W18, picks)

  it('plays out a win, a loss, and a tie for every open game', () => {
    expect(OUTCOMES).toEqual(['home', 'away', 'tie'])
    expect(result.undecided).toEqual(keep)
    expect(result.total).toBe(9)
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [outcomeOf(i, 0), outcomeOf(i, 1)])).toEqual([
      ['home', 'home'],
      ['away', 'home'],
      ['tie', 'home'],
      ['home', 'away'],
      ['away', 'away'],
      ['tie', 'away'],
      ['home', 'tie'],
      ['away', 'tie'],
      ['tie', 'tie'],
    ])
  })

  it('settles every team in exactly one seed bucket in every outcome on a real board', () => {
    for (const [abbr, team] of Object.entries(result.teams)) {
      const all = []
      for (let s = 1; s <= OUT; s++) {
        expect(team[s].maybe).toBe(0)
        expect(team[s].count).toBe(team[s].scenarios.length)
        all.push(...team[s].scenarios)
      }
      expect(all.sort((a, b) => a - b), abbr).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    }
  })

  it('puts the real 2025 field where the real results say, tie outcomes included', () => {
    const idx = indexOf(result.undecided, ACTUAL)
    const real = conferenceSeeds(REG)
    for (const conf of ['AFC', 'NFC']) {
      for (const row of real[conf]) {
        expect(settledBucket(result, row.abbr, idx), row.abbr).toBe(Math.min(row.seed, OUT))
      }
    }
  })

  it('books a tie as a tie: the tie outcome seeds exactly like a real tied game', () => {
    // Every outcome where the first open game is tied, checked against the repo's own
    // seeding with that game scored 20-20 and the other one as the scenario says.
    const [g0, g1] = result.undecided
    for (const other of OUTCOMES) {
      const idx = indexOf(result.undecided, { [g0.id]: 'tie', [g1.id]: other })
      const scored = W18.map((g) => {
        const side = g.id === g0.id ? 'tie' : g.id === g1.id ? other : picks[g.id]
        if (!side) return g
        return { ...g, score: side === 'tie' ? [20, 20] : side === 'home' ? [27, 3] : [3, 27] }
      })
      const seeds = conferenceSeeds(scored)
      for (const conf of ['AFC', 'NFC']) {
        for (const row of seeds[conf]) {
          expect(settledBucket(result, row.abbr, idx), `${row.abbr} ${other}`).toBe(Math.min(row.seed, OUT))
        }
      }
    }
  })
})

describe('enumerateScenarios: the answer holds for any real scores (property check)', () => {
  // For random picks (ties included) and random outcomes, give every decided game a real
  // score consistent with its result and seed the season with the repo's own seeding,
  // points steps and all. The team must land in the bucket the engine settled it in, or,
  // if the engine did not settle it, in one it marked as depending on points.
  const check = (games, openN, seed, tieP) => {
    const rnd = rng(seed)
    const open = remainingGames(games)
    const keep = new Set([...open].sort(() => rnd() - 0.5).slice(0, openN).map((g) => g.id))
    const picks = {}
    for (const g of open) {
      if (!keep.has(g.id)) picks[g.id] = rnd() < tieP ? 'tie' : rnd() < 0.5 ? 'home' : 'away'
    }
    const result = enumerateScenarios(games, picks, { budgetMs: Infinity })
    let maybeHits = 0
    for (let k = 0; k < 12; k++) {
      const idx = Math.floor(rnd() * result.total)
      const sides = { ...picks }
      result.undecided.forEach((g, i) => (sides[g.id] = outcomeOf(idx, i)))
      const margin = rnd() < 0.5 ? 3 : 40
      const real = games.map((g) => {
        if (!sides[g.id]) return g
        const a = 10 + Math.floor(rnd() * margin)
        const b = Math.floor(rnd() * a)
        return { ...g, score: sides[g.id] === 'tie' ? [a, a] : sides[g.id] === 'home' ? [a, b] : [b, a] }
      })
      const seeds = conferenceSeeds(real)
      for (const conf of ['AFC', 'NFC']) {
        for (const row of seeds[conf]) {
          const b = Math.min(row.seed, OUT)
          const settled = settledBucket(result, row.abbr, idx)
          if (settled === null) {
            expect(result.teams[row.abbr][b].maybe, row.abbr).toBeGreaterThan(0)
            maybeHits++
          } else expect(settled, row.abbr).toBe(b)
        }
      }
    }
    return maybeHits
  }

  it('holds on late-season boards', () => {
    expect(check(unplay((g) => g.week >= 17), 4, 3, 0.3)).toBe(0)
    expect(check(W18, 5, 11, 0.3)).toBe(0)
  })

  it('holds on a tie-heavy board where points decide some places', () => {
    // Every game still open and most picks ties: records bunch up, ties reach the points
    // steps, and the engine must branch. Some real seeds land in a "depends on points"
    // cell, and none lands where the engine settled something else.
    expect(check(unplay(() => true), 3, 5, 0.9)).toBeGreaterThan(0)
  })
})

describe('enumerateScenarios: a live score never drives a verdict', () => {
  it('plays a game in progress out all three ways, whatever its provisional score says', () => {
    const [live, ...rest] = W18_OPEN
    const games = W18.map((g) => (g.id === live.id ? { ...g, score: [35, 0], live: true } : g))
    const picks = Object.fromEntries(rest.map((g) => [g.id, ACTUAL[g.id]]))
    const result = enumerateScenarios(games, picks)
    expect(result.undecided.map((g) => g.id)).toEqual([live.id])
    expect(result.total).toBe(3)
    // Nothing is fully decided while it is in progress, so there is no final seeding.
    expect(rankScenario(games, picks).AFC.rows).toHaveLength(16)
    // The provisional leader's loss is still counted: the away-win outcome has a seeding
    // of its own, identical to that game going final the other way.
    const awayWin = W18.map((g) =>
      g.id === live.id ? { ...g, score: [0, 35] } : picks[g.id] ? { ...g, score: picks[g.id] === 'home' ? [27, 3] : picks[g.id] === 'away' ? [3, 27] : [20, 20] } : g
    )
    const seeds = conferenceSeeds(awayWin)
    for (const row of [...seeds.AFC, ...seeds.NFC]) {
      expect(settledBucket(result, row.abbr, 1)).toBe(Math.min(row.seed, OUT))
    }
  })
})

describe('enumerateScenarios: scope limits', () => {
  it('declines past the open-game cap and says how many are open', () => {
    const result = enumerateScenarios(FROZEN)
    expect(MAX_OPEN_GAMES).toBe(6)
    expect(result.tooMany).toBe(true)
    expect(result.undecided).toHaveLength(255)
    expect(result.total).toBe(0)
    expect(result.teams).toEqual({})
    // The cap is a parameter: one more open game than allowed is declined.
    const picks = Object.fromEntries(W18_OPEN.slice(2).map((g) => [g.id, 'home']))
    expect(enumerateScenarios(W18, picks, { max: 1 }).tooMany).toBe(true)
    expect(enumerateScenarios(W18, picks, { max: 2 }).tooMany).toBe(false)
  })

  it('stops at the time budget and returns no partial counts', () => {
    let t = 0
    const now = () => (t += 50)
    const picks = Object.fromEntries(W18_OPEN.slice(2).map((g) => [g.id, 'home']))
    const result = enumerateScenarios(W18, picks, { now })
    expect(BUDGET_MS).toBe(200)
    expect(result.tooSlow).toBe(true)
    expect(result.teams).toEqual({})
    expect(enumerateScenarios(W18, picks).tooSlow).toBe(false)
  })

  it('ranks a finished season once, from the real scores, exactly as the standings do', () => {
    const result = enumerateScenarios(REG)
    expect(result.open).toHaveLength(0)
    expect(result.total).toBe(1)
    const ranked = rankScenario(REG, {})
    const real = conferenceSeeds(REG)
    for (const conf of ['AFC', 'NFC']) {
      expect(ranked[conf].rows.map((r) => r.abbr)).toEqual(real[conf].map((r) => r.abbr))
      expect(ranked[conf].scoreless).toBe(false)
      expect(ranked[conf].scoreDependent).toBe(false)
    }
  })
})

describe('points are unknown for a picked game', () => {
  // A season where every game is a tie: 32 identical records, so every tie runs to the
  // points steps. The engine must refuse to call any place.
  const allTies = REG.map((g) => ({ ...g, score: undefined }))
  const tiePicks = Object.fromEntries(allTies.map((g) => [g.id, 'tie']))

  it('gives up exploring past the branch cap and leaves every place open', () => {
    const ranked = rankScenario(allTies, tiePicks)
    expect(MAX_BRANCHES).toBe(8)
    expect(ranked.AFC.overflow).toBe(true)
    expect(ranked.AFC.scoreDependent).toBe(true)
    expect([...ranked.AFC.positions.KC].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1)
    )
  })

  it('counts an overflowed season as "depends on points" at every seed', () => {
    const [a, b, ...rest] = allTies
    const picks = Object.fromEntries(rest.map((g) => [g.id, 'tie']))
    const result = enumerateScenarios(allTies, picks, { budgetMs: Infinity })
    expect(result.total).toBe(9)
    for (let s = 1; s <= OUT; s++) {
      expect(result.teams.KC[s].count).toBe(0)
      expect(result.teams.KC[s].maybe).toBe(9)
    }
    expect([a, b].every((g) => result.undecided.includes(g))).toBe(true)
  })
})

describe('seedBranches explores every club the unknown points could favor', () => {
  // Real (scored) results, tie-heavy, with the last two games open.
  const tieHeavy = () => {
    const rnd = rng(10)
    return REG.map((g, i) => {
      if (i >= REG.length - 2) return { ...g, score: undefined }
      const r = rnd()
      return { ...g, score: r < 0.7 ? [17, 17] : r < 0.85 ? [20, 17] : [17, 20] }
    })
  }

  it('re-runs a tie-heavy season and reports each team every place it took', () => {
    const result = enumerateScenarios(tieHeavy(), {})
    const maybeCells = Object.values(result.teams).flatMap((t) => Object.values(t).filter((c) => c.maybe))
    expect(maybeCells.length).toBeGreaterThan(0)
    // Not an overflow: the teams it could not settle are still settled in other outcomes.
    expect(
      Object.values(result.teams).some(
        (t) => Object.values(t).some((c) => c.maybe) && Object.values(t).some((c) => c.count)
      )
    ).toBe(true)
  })

  it('does not read the placeholder score: with real scores the same season has one order', () => {
    // The two open games, played for real, leave nothing to branch on.
    const games = tieHeavy()
    const open = remainingGames(games)
    const result = enumerateScenarios(games, {})
    // An outcome in which some team's place was left to the points.
    const idx = [...Array(result.total).keys()].find((i) =>
      Object.keys(result.teams).some((abbr) => settledBucket(result, abbr, i) === null)
    )
    expect(idx).toBeGreaterThanOrEqual(0)
    const scored = games.map((g) => {
      const i = open.indexOf(g)
      if (i < 0) return g
      const side = outcomeOf(idx, i)
      return { ...g, score: side === 'tie' ? [17, 17] : side === 'home' ? [20, 17] : [17, 20] }
    })
    for (const conf of ['AFC', 'NFC']) {
      const real = seedBranches(conf, scored, computeStandings(scored), false)
      expect(Object.values(real.positions).every((p) => p.size === 1)).toBe(true)
    }
    const ranked = rankScenario(games, Object.fromEntries(open.map((g, i) => [g.id, outcomeOf(idx, i)])))
    expect(ranked.AFC.scoreDependent || ranked.NFC.scoreDependent).toBe(true)
    const points = [...ranked.AFC.trace, ...ranked.NFC.trace].filter((t) => t.scores)
    expect(points.length).toBeGreaterThan(0)
  })

  it('ranks a real, complete season once without choose', () => {
    const table = computeStandings(REG)
    const out = seedBranches('NFC', REG, table, false)
    expect(out.overflow).toBe(false)
    expect(out.rows.map((r) => r.abbr)).toEqual(conferenceSeeds(REG).NFC.map((r) => r.abbr))
    expect(Object.values(out.positions).every((p) => p.size === 1)).toBe(true)
  })
})

describe('favoritePicks', () => {
  it('picks the better record, and the home team when records are level', () => {
    const table = computeStandings(W18.filter(countsForStandings))
    const picks = favoritePicks(W18_OPEN, table)
    for (const g of W18_OPEN) {
      const want = table[g.away].pct > table[g.home].pct ? 'away' : 'home'
      expect(picks[g.id]).toBe(want)
    }
    const level = { id: 'x', home: 'KC', away: 'DEN' }
    expect(favoritePicks([level], { KC: { pct: 0.5 }, DEN: { pct: 0.5 } })).toEqual({ x: 'home' })
    expect(favoritePicks([level], { KC: { pct: 0.4 }, DEN: { pct: 0.5 } })).toEqual({ x: 'away' })
  })
})

describe('meanSeed and rowPercents', () => {
  const cellRow = (counts, maybes = {}) =>
    Object.fromEntries(
      Array.from({ length: OUT }, (_, i) => [i + 1, { count: counts[i + 1] ?? 0, maybe: maybes[i + 1] ?? 0 }])
    )

  it('orders by the average bucket, counting a points-dependent outcome everywhere it lands', () => {
    expect(meanSeed(cellRow({ 1: 2, 3: 2 }))).toBe(2)
    expect(meanSeed(cellRow({ 1: 1 }, { 3: 1 }))).toBe(2)
  })

  it('rounds each row to exactly 100 by largest remainder', () => {
    // 1/3 each would round to 33 + 33 + 33 = 99 cell by cell.
    const p = rowPercents(cellRow({ 1: 1, 2: 1, 3: 1 }), 3)
    expect(p).toEqual({ 1: 34, 2: 33, 3: 33 })
    // 13 + 75 + 13 = 101 cell by cell. Level remainders go to the better seed.
    const q = rowPercents(cellRow({ 1: 1, 2: 6, 3: 1 }), 8)
    expect(Object.values(q).reduce((a, b) => a + b)).toBe(100)
    expect(q).toEqual({ 1: 13, 2: 75, 3: 12 })
    // Level remainders with different counts: the bigger count first (12.5 vs 37.5).
    expect(rowPercents(cellRow({ 1: 1, 5: 3, 6: 4 }), 8)).toEqual({ 1: 12, 5: 38, 6: 50 })
  })

  it('leaves points-dependent outcomes out of the row total', () => {
    expect(rowPercents(cellRow({ 1: 1 }, { 2: 1 }), 2)).toEqual({ 1: 50 })
  })
})

describe('combinations', () => {
  const games = Array.from({ length: 3 }, (_, i) => ({ id: `g${i}`, home: `H${i}`, away: `A${i}` }))
  const expand = (pieces) =>
    pieces.flatMap(({ results }) => {
      let idxs = [0]
      for (let i = 0; i < games.length; i++) {
        const allowed = results.find((r) => r.game === games[i])?.sides ?? OUTCOMES
        idxs = idxs.flatMap((x) => allowed.map((s) => x + OUTCOMES.indexOf(s) * 3 ** i))
      }
      return idxs
    })

  it('writes a cell as disjoint pieces that expand back to exactly its outcomes', () => {
    const rnd = rng(42)
    for (let trial = 0; trial < 40; trial++) {
      const list = Array.from({ length: 27 }, (_, i) => i).filter(() => rnd() < 0.5)
      const pieces = combinations(list, games)
      const back = expand(pieces)
      expect(back.sort((a, b) => a - b)).toEqual(list)
      expect(pieces.reduce((n, p) => n + p.count, 0)).toBe(list.length)
      for (let i = 1; i < pieces.length; i++) expect(pieces[i - 1].count).toBeGreaterThanOrEqual(pieces[i].count)
    }
  })

  it('merges two outcomes of one game into "beats or ties", and all three into nothing', () => {
    const one = [games[0]]
    expect(combinations([0, 2], one)).toEqual([{ count: 2, results: [{ game: games[0], sides: ['home', 'tie'] }] }])
    expect(combinations([1, 2], one)[0].results[0].sides).toEqual(['away', 'tie'])
    expect(combinations([0, 1], one)[0].results[0].sides).toEqual(['home', 'away'])
    expect(combinations([0, 1, 2], one)).toEqual([{ count: 3, results: [] }])
    expect(combinations([], one)).toEqual([])
  })

  it('pulls a required result out first', () => {
    // Game 1 must be an away win; game 0 is free.
    const list = [3, 4, 5]
    expect(combinations(list, games.slice(0, 2))).toEqual([
      { count: 3, results: [{ game: games[1], sides: ['away'] }] },
    ])
  })

  it('reads every allowed-outcome set in plain English', () => {
    const g = { home: 'KC', away: 'DEN' }
    expect(describeResult(g, ['home'])).toBe('KC beats DEN')
    expect(describeResult(g, ['away'])).toBe('DEN beats KC')
    expect(describeResult(g, ['tie'])).toBe('DEN and KC tie')
    expect(describeResult(g, ['home', 'tie'])).toBe('KC beats or ties DEN')
    expect(describeResult(g, ['away', 'tie'])).toBe('DEN beats or ties KC')
    expect(describeResult(g, ['home', 'away'])).toBe('DEN @ KC is not a tie')
  })

  it('covers every cell of a real board exactly', () => {
    const keep = W18_OPEN.slice(-3)
    const picks = Object.fromEntries(W18_OPEN.filter((g) => !keep.includes(g)).map((g) => [g.id, 'home']))
    const result = enumerateScenarios(W18, picks)
    for (const team of Object.values(result.teams)) {
      for (let s = 1; s <= OUT; s++) {
        const { scenarios } = team[s]
        const pieces = combinations(scenarios, result.undecided)
        const back = pieces.flatMap(({ results }) => {
          let idxs = [0]
          result.undecided.forEach((g, i) => {
            const allowed = results.find((r) => r.game === g)?.sides ?? OUTCOMES
            idxs = idxs.flatMap((x) => allowed.map((side) => x + OUTCOMES.indexOf(side) * 3 ** i))
          })
          return idxs
        })
        expect(back.sort((a, b) => a - b)).toEqual([...scenarios].sort((a, b) => a - b))
      }
    }
  })
})

describe('conferenceOf', () => {
  it('reads the membership the grid splits on', () => {
    expect(conferenceOf('KC')).toBe('AFC')
    expect(conferenceOf('SF')).toBe('NFC')
  })
})
