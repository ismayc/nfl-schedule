// Seeding scenarios: pick results for the regular-season games that are left, and play
// out every combination of the rest, to show which seeds each team can still reach and
// exactly which results each one needs. Ported from the WNBA viewer's Scenarios tab and
// reshaped for the NFL:
//
// - THREE outcomes per game. An NFL game can end tied (half a win), so every open game
//   is played out as a home win, an away win, and a tie. 6 open games is 3^6 = 729
//   complete seasons, where the WNBA's 12 two-way games were 4,096.
// - The WHOLE league is enumerated. Strength of victory and strength of schedule (steps
//   5 and 6 of the division chain) read opponents' full records, so a game between two
//   NFC clubs can reorder an AFC tie. No game is left out as "irrelevant".
// - Seeding is the repo's own: every season is ranked by seedConference in
//   standings.js, the official division and wild-card procedures. There is no second
//   tiebreak implementation here.
// - Points are unknown. A picked or enumerated result has a winner but no score, and the
//   NFL chain reaches points (combined ranking in points scored and allowed, then net
//   points) after strength of schedule. When a tie gets that far, standings.js hands
//   the tied clubs to `choose` instead of guessing, and this engine re-runs the seeding
//   once for every club the unknown points could favor. A team whose seed differs across
//   those runs is counted as "depends on scores" (the * in the grid) at every seed it
//   reached, never as settled. That set is an over-approximation: the engine does not
//   prove each of those orders is reachable by some real scores, and the UI says so.
//
// A live game's provisional score is not a result: a game in progress is open here, so it
// is played out all three ways and can never move a verdict (same predicate as
// countsForStandings).

import { bookGame, computeStandings, countsForStandings, finishRow, seedConference } from './standings.js'
import { CONFERENCE_KEYS, PLAYOFF } from '../config/league.js'
import { CONFERENCE_BY_ABBR } from '../data/teams.js'

// Seed buckets reported per team: 1..seedsPerConference, then one "out" bucket.
export const OUT = PLAYOFF.seedsPerConference + 1

// Every way one game can end, in the order the engine numbers them (outcome digit 0-2).
export const OUTCOMES = ['home', 'away', 'tie']

// Enumeration cap: 3^6 = 729 complete seasons, each ranked twice (one conference at a
// time). Measured at 45 to 130 ms in Node on real boards (September 29, 2026); 3^7 =
// 2,187 would be about three times that, past a 200 ms budget for work on the main
// thread. Past the cap the view asks for more picks instead of freezing.
export const MAX_OPEN_GAMES = 6

// Re-runs of one conference's seeding for a single season when points decide ties. Past
// this the engine stops exploring and counts every team of that conference as "depends
// on scores" at every seed (sound, and in practice only reached by picking a season of
// near-identical records, such as every game a tie).
export const MAX_BRANCHES = 8

// Wall-clock guard. The caps above bound the number of seasons, but not what one season
// costs: a season of identical records sends 16-club ties through every step of the chain
// and was measured at 2 to 4 seconds for 729 seasons. Past this many milliseconds the
// engine stops and reports `tooSlow` instead of freezing the page. Real boards with six
// games open measured 45 to 130 ms in Node (September 29, 2026), inside it.
export const BUDGET_MS = 200

// Games still to be decided, in kickoff order.
export const remainingGames = (games) =>
  games
    .filter((g) => g.seasonType === 'regular' && !g.postponed && !g.canceled && (!g.score || g.live))
    .sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))

// A decided copy of an open game. The placeholder score only says who won (a tie is
// level); no tiebreak step reads its points, because every season with one of these in
// it is ranked with `choose` set (see seedBranches).
const SCORE = { home: [1, 0], away: [0, 1], tie: [0, 0] }
const decide = (g, side) => ({ ...g, score: SCORE[side], live: false, hypothetical: true })

// Picks for the favorite in every open game: the better current record, the home team
// when the records are level. Never a tie: that is a pick a person makes on purpose.
export function favoritePicks(open, table) {
  const picks = {}
  for (const g of open) picks[g.id] = table[g.away].pct > table[g.home].pct ? 'away' : 'home'
  return picks
}

const cloneRow = (r) => ({
  ...r,
  home: { ...r.home },
  road: { ...r.road },
  div: { ...r.div },
  conf: { ...r.conf },
  results: [...r.results],
})

// A copy of `table` with `decided` games booked, by the same bookGame/finishRow that
// computeStandings uses. Only the rows those games touch are copied.
function bookAll(table, decided) {
  const out = { ...table }
  const touched = new Set()
  for (const g of decided) {
    for (const abbr of [g.home, g.away]) {
      if (!touched.has(abbr)) {
        touched.add(abbr)
        out[abbr] = cloneRow(out[abbr])
      }
    }
    bookGame(out, g)
  }
  for (const abbr of touched) finishRow(out[abbr])
  return out
}

/**
 * Seed one conference for one complete season, re-running the seeding for every club
 * that unknown points could favor. `scoreless` is true when any result in `season` is
 * hypothetical; a real, fully played season is ranked once, points and all.
 *
 * Returns { rows, trace, positions, overflow }: `rows` and `trace` from the first run
 * (the order shown when the points happen to favor clubs alphabetically), `positions`
 * maps each abbr to the Set of final places (1-based) it took across all runs, and
 * `overflow` is set when more than MAX_BRANCHES runs were needed.
 */
export function seedBranches(conf, season, table, scoreless) {
  const positions = {}
  const record = (rows) =>
    rows.forEach((r, i) => (positions[r.abbr] ??= new Set()).add(i + 1))
  if (!scoreless) {
    const trace = []
    const rows = seedConference(conf, season, table, { trace })
    record(rows)
    return { rows, trace, positions, overflow: false }
  }
  // Depth-first over the choice points: `script` fixes the choices made so far, and every
  // choice past it takes the first club. After each run, advance the last choice that
  // still has clubs left, like an odometer.
  let script = []
  let first = null
  let runs = 0
  for (;;) {
    const used = []
    const widths = []
    const trace = []
    const choose = (group) => {
      const k = used.length
      const i = script[k] ?? 0
      used.push(i)
      widths.push(group.length)
      return group[i]
    }
    const rows = seedConference(conf, season, table, { choose, trace })
    record(rows)
    first ??= { rows, trace }
    if (++runs > MAX_BRANCHES) return { ...first, positions, overflow: true }
    let j = used.length - 1
    while (j >= 0 && used[j] + 1 >= widths[j]) j--
    if (j < 0) return { ...first, positions, overflow: false }
    script = [...used.slice(0, j), used[j] + 1]
  }
}

const bucket = (pos) => Math.min(pos, OUT)

// The outcome digit (0 home, 1 away, 2 tie) of undecided game `i` in scenario `idx`.
export const outcomeOf = (idx, i) => OUTCOMES[Math.floor(idx / 3 ** i) % 3]

/**
 * Enumerate every completion of the season consistent with `picks` ({ gameId: 'home' |
 * 'away' | 'tie' }).
 *
 * Returns { open, undecided, total, tooMany, teams } where `teams[abbr]` holds, per seed
 * bucket (1..seedsPerConference and OUT):
 *   count      - scenarios that land the team in that bucket, settled by results alone
 *   maybe      - scenarios where it lands there only if the unknown points fall that way
 *   tiebreaks  - { step label: n }: how many of those scenarios that step helped decide
 *   scenarios  - every scenario index (base 3 over `undecided`) counted in `count`
 * With more than `max` undecided games nothing is enumerated and `tooMany` is set. If the
 * run passes `budgetMs` (read from `now`), it stops, empties `teams`, and sets `tooSlow`:
 * a partial count is never returned.
 */
export function enumerateScenarios(
  games,
  picks = {},
  { max = MAX_OPEN_GAMES, budgetMs = BUDGET_MS, now = () => performance.now() } = {}
) {
  const open = remainingGames(games)
  const undecided = open.filter((g) => !picks[g.id])
  const result = { open, undecided, total: 0, tooMany: undecided.length > max, tooSlow: false, teams: {} }
  if (result.tooMany) return result
  const start = now()

  const played = games.filter(countsForStandings)
  const fixed = open.filter((g) => picks[g.id]).map((g) => decide(g, picks[g.id]))
  // The real table plus every pick, booked once; each scenario adds only its own games.
  const base = bookAll(computeStandings(played), fixed)
  const prefix = [...played, ...fixed]
  const scoreless = open.length > 0

  for (const abbr of Object.keys(base)) {
    result.teams[abbr] = {}
    for (let s = 1; s <= OUT; s++) {
      result.teams[abbr][s] = { count: 0, maybe: 0, tiebreaks: {}, scenarios: [] }
    }
  }

  result.total = 3 ** undecided.length
  for (let idx = 0; idx < result.total; idx++) {
    if (now() - start > budgetMs) return { ...result, tooSlow: true, teams: {} }
    const decided = undecided.map((g, i) => decide(g, outcomeOf(idx, i)))
    const table = bookAll(base, decided)
    const season = decided.length ? [...prefix, ...decided] : prefix
    for (const conf of CONFERENCE_KEYS) {
      const { trace, positions, overflow } = seedBranches(conf, season, table, scoreless)
      // Which tiebreak steps helped place each team in this season.
      const stepsOf = {}
      for (const t of trace) for (const a of t.teams) (stepsOf[a] ??= new Set()).add(t.step)
      for (const [abbr, places] of Object.entries(positions)) {
        const cells = result.teams[abbr]
        if (overflow) {
          for (let s = 1; s <= OUT; s++) cells[s].maybe++
          continue
        }
        const buckets = [...new Set([...places].map(bucket))]
        const steps = stepsOf[abbr] ?? []
        for (const s of buckets) {
          const cell = cells[s]
          if (buckets.length === 1) {
            cell.count++
            cell.scenarios.push(idx)
          } else cell.maybe++
          for (const step of steps) cell.tiebreaks[step] = (cell.tiebreaks[step] ?? 0) + 1
        }
      }
    }
  }
  return result
}

// Rank one fully decided season: the real results plus `picks` for every open game.
// Returns, per conference, the seeded rows, how each tie broke, each team's set of
// possible places, and whether any order hinges on points no pick can settle.
export function rankScenario(games, picks) {
  const played = games.filter(countsForStandings)
  const fixed = remainingGames(games)
    .filter((g) => picks[g.id])
    .map((g) => decide(g, picks[g.id]))
  const season = [...played, ...fixed]
  const table = bookAll(computeStandings(played), fixed)
  const scoreless = fixed.length > 0
  return Object.fromEntries(
    CONFERENCE_KEYS.map((conf) => {
      const out = seedBranches(conf, season, table, scoreless)
      // Past the branch cap not every order was played out, so no place is known.
      if (out.overflow) {
        const all = out.rows.map((_, i) => i + 1)
        for (const r of out.rows) out.positions[r.abbr] = new Set(all)
      }
      const scoreDependent = Object.values(out.positions).some((p) => p.size > 1)
      return [conf, { ...out, scoreless, scoreDependent }]
    })
  )
}

// A team's mean seed bucket across the enumerated scenarios (an outcome that depends on
// scores counted at every seed it could reach), used to order the grid from favorite to
// longshot.
export function meanSeed(team) {
  let sum = 0
  let total = 0
  for (let s = 1; s <= OUT; s++) {
    const n = team[s].count + team[s].maybe
    sum += s * n
    total += n
  }
  return sum / total
}

// Whole-number percentages for one team's row that add up exactly, by the
// largest-remainder method (the WNBA fix for rows reading 101%): every cell gets its
// floor, and the points still missing go to the biggest fractional parts (the bigger
// count, then the better seed, breaks a tie). Outcomes that depend on scores are left out,
// so a row sums to 100 only when none of its outcomes do. Returns { [seed]: percent } for
// the buckets with a settled count.
export function rowPercents(team, total) {
  const cells = []
  let settled = 0
  for (let s = 1; s <= OUT; s++) {
    const { count } = team[s]
    if (!count) continue
    settled += count
    const exact = (100 * count) / total
    cells.push({ s, count, pct: Math.floor(exact), rest: exact - Math.floor(exact) })
  }
  let missing = Math.round((100 * settled) / total) - cells.reduce((n, c) => n + c.pct, 0)
  const byRest = [...cells].sort((a, b) => b.rest - a.rest || b.count - a.count || a.s - b.s)
  for (const c of byRest) {
    if (missing <= 0) break
    c.pct++
    missing--
  }
  return Object.fromEntries(cells.map((c) => [c.s, c.pct]))
}

/**
 * The exact set of results behind a cell, written as few non-overlapping combinations as
 * possible. `list` holds the cell's scenario indexes (base 3 over `undecided`). The set
 * is split one game at a time, always on the game whose three outcomes divide it most
 * unevenly, until each piece is "these results, anything in the other games"; then any
 * two pieces that agree everywhere except one game are merged, so a game can read "KC
 * beats or ties DEN" (and drops out once all three outcomes are covered). The pieces stay
 * disjoint, so their counts add up to the cell's count exactly.
 * Returns [{ results: [{ game, sides }], count }], largest first; `sides` lists the
 * allowed outcomes of that game in OUTCOMES order.
 */
export function combinations(list, undecided) {
  const out = []
  const split = (set, fixed, free) => {
    if (!set.length) return
    if (set.length === 3 ** free.length) {
      out.push({ fixed, count: set.length })
      return
    }
    // The most lopsided game: a required result (two outcomes empty) comes out first.
    let best = free[0]
    let bestGap = -1
    for (const i of free) {
      const n = [0, 0, 0]
      for (const idx of set) n[Math.floor(idx / 3 ** i) % 3]++
      const gap = Math.max(...n) - Math.min(...n)
      if (gap > bestGap) [best, bestGap] = [i, gap]
    }
    const rest = free.filter((i) => i !== best)
    OUTCOMES.forEach((side, o) =>
      split(
        set.filter((idx) => Math.floor(idx / 3 ** best) % 3 === o),
        { ...fixed, [best]: [side] },
        rest
      )
    )
  }
  split(list, {}, undecided.map((_, i) => i))

  // Merge two pieces that constrain the same games identically except for one.
  const key = (sides) => sides.join()
  for (let merged = true; merged; ) {
    merged = false
    for (let a = 0; a < out.length && !merged; a++)
      for (let b = a + 1; b < out.length && !merged; b++) {
        const fa = out[a].fixed
        const fb = out[b].fixed
        const ka = Object.keys(fa)
        if (ka.length !== Object.keys(fb).length || !ka.every((k) => k in fb)) continue
        const diff = ka.filter((k) => key(fa[k]) !== key(fb[k]))
        if (diff.length !== 1) continue
        const k = diff[0]
        const sides = OUTCOMES.filter((s) => fa[k].includes(s) || fb[k].includes(s))
        const { [k]: _, ...fixed } = fa
        if (sides.length < OUTCOMES.length) fixed[k] = sides
        out[a] = { fixed, count: out[a].count + out[b].count }
        out.splice(b, 1)
        merged = true
      }
  }
  return out
    .map(({ fixed, count }) => ({
      count,
      results: Object.keys(fixed)
        .map(Number)
        .sort((a, b) => a - b)
        .map((i) => ({ game: undecided[i], sides: fixed[i] })),
    }))
    .sort((a, b) => b.count - a.count)
}

// Plain-English text for one constrained game in a combination.
export function describeResult(game, sides) {
  const { home, away } = game
  switch (sides.join()) {
    case 'home':
      return `${home} beats ${away}`
    case 'away':
      return `${away} beats ${home}`
    case 'tie':
      return `${away} and ${home} tie`
    case 'home,tie':
      return `${home} beats or ties ${away}`
    case 'away,tie':
      return `${away} beats or ties ${home}`
    default:
      return `${away} @ ${home} is not a tie`
  }
}

// The conference an abbr plays in (re-exported for the view's grid split).
export const conferenceOf = (abbr) => CONFERENCE_BY_ABBR[abbr]
