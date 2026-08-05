// Derivations over the archived seasons in data/history.js.
//
// Nothing here is committed: every season ships its final standings and its 13
// postseason games, and the bracket and the runs below are recomputed from those by the
// same functions the current season uses. That is deliberate — an archived bracket that
// renders through a second, "historical" code path is one that can silently disagree
// with the live one.

import { buildBracket } from './bracket.js'
import { CONFERENCE_KEYS, CONFERENCE_BY_ABBR } from '../config/league.js'

// Rebuild one archived season. Seeding comes from the committed standings, since a
// historical season carries no regular-season games to derive it from.
export const seasonBracket = (season) => buildBracket(season.games, season.standings)

// Deepest round first: the first round a team appears in, scanning this way, is the
// furthest it reached — and since the champion is handled separately, it's the round
// they went out in.
const EXITS = [
  ['SB', 'Lost the Super Bowl'],
  ['CONF', 'Lost the conference championship'],
  ['DIV', 'Lost in the divisional round'],
  ['WC', 'Lost in the wild card round'],
]

// How far a team went that season. Returns null for one that missed the playoffs.
export function runResult(bracket, abbr) {
  if (!abbr) return null
  if (bracket.champion === abbr) return 'Won the Super Bowl'

  const played = (m) => m && (m.home === abbr || m.away === abbr)
  const byRound = {
    SB: [bracket.sb],
    CONF: CONFERENCE_KEYS.map((c) => bracket.conferences[c].CONF),
    DIV: CONFERENCE_KEYS.flatMap((c) => bracket.conferences[c].DIV),
    WC: CONFERENCE_KEYS.flatMap((c) => bracket.conferences[c].WC),
  }

  for (const [round, label] of EXITS) {
    if (byRound[round].some(played)) return label
  }
  // A 1 seed that lost its divisional game is caught above; one that reached the
  // playoffs but appears in no matchup is impossible, so this is the missed-out case.
  return null
}

// The Super Bowl line for a season: who won, over whom, by what score, and from which
// seeds — the seed is the part that makes a wild-card run legible years later.
export function superBowlSummary(season) {
  const bracket = seasonBracket(season)
  const { sb } = bracket
  const winner = bracket.champion ?? null
  const loser = winner ? (sb.home === winner ? sb.away : sb.home) : null
  const scoreOf = (abbr) => (sb.home === abbr ? sb.score?.[0] : sb.score?.[1])

  return {
    winner,
    loser,
    score: winner && sb.score ? [scoreOf(winner), scoreOf(loser)] : null,
  }
}

// A team's seed that season, from the committed standings. Every one of the 32 teams is
// seeded 1–16 within its conference, so a lookup by conference is enough.
export const seedOf = (season, abbr) =>
  season.standings[CONFERENCE_BY_ABBR[abbr]].find((r) => r.abbr === abbr).seed

// The season's best regular-season record, across both conferences. Ties on win
// percentage fall to point differential, the same tail the standings use.
export function bestRecord(season) {
  return CONFERENCE_KEYS.flatMap((c) => season.standings[c]).sort(
    (a, b) => b.pct - a.pct || b.diff - a.diff
  )[0]
}

// One row per Super Bowl participant, newest first — the table that shows how often a
// team has reached it from outside the top seed.
export function superBowlRuns(seasons) {
  const rows = []
  for (const season of seasons) {
    const sb = superBowlSummary(season)
    if (!sb.winner) continue
    for (const [abbr, won] of [
      [sb.winner, true],
      [sb.loser, false],
    ]) {
      rows.push({
        year: season.year,
        label: season.label,
        abbr,
        won,
        seed: seedOf(season, abbr),
        score: won ? sb.score : [sb.score[1], sb.score[0]],
      })
    }
  }
  return rows
}

/**
 * One archived team's row in the shape the team panel expects.
 *
 * The panel is built for the live season, where every figure comes from the game
 * list. A finished season commits its final table as numbers instead, so the
 * same fields are rebuilt from those: per-game scoring from points for/against,
 * and the home/road splits from their compact [w, l, t] triples.
 *
 * `results` is deliberately empty — the archive holds no per-game regular-season
 * record, so there is no honest recent-form strip to draw, and the panel omits
 * that section rather than inventing one. `remaining` is 0: the season is over.
 */
export function seasonTeamRow(season, abbr) {
  if (!season || !abbr) return null
  const row = Object.values(season.standings).flat().find((r) => r.abbr === abbr)
  if (!row) return null
  const gp = row.w + row.l + (row.t || 0)
  const split = ([w, l, t]) => ({ w, l, t: t || 0 })
  return {
    ...row,
    gp,
    ppg: gp ? row.pf / gp : 0,
    oppPpg: gp ? row.pa / gp : 0,
    home: split(row.home),
    road: split(row.road),
    remaining: 0,
    results: [],
    // A finished season has no race left to run, so neither badge applies.
    clinched: false,
    eliminated: false,
  }
}

/** That season's players, ordered for the panel's leading-scorers list. */
export function seasonPlayers(season) {
  return season?.players ? Object.values(season.players) : []
}
