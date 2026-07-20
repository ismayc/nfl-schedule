// Season-wide derived stats. Everything here is a pure function of the merged game list
// or the committed player table — no fetching, no DOM.
import { PLAYERS } from '../data/leaders.js'
import { LEAGUE } from '../config/league.js'
import { countsForStandings, computeStandings } from './standings.js'

export function seasonTotals(games) {
  const played = games.filter(countsForStandings)
  const totalPoints = played.reduce((n, g) => n + g.score[0] + g.score[1], 0)
  const scheduled = games.filter((g) => g.seasonType === 'regular' && !g.canceled)

  const withMargin = played.map((g) => ({ ...g, margin: Math.abs(g.score[0] - g.score[1]) }))
  const byMargin = [...withMargin].sort((a, b) => a.margin - b.margin)
  const byTotal = [...played].sort((a, b) => b.score[0] + b.score[1] - (a.score[0] + a.score[1]))
  const homeWins = played.filter((g) => g.score[0] > g.score[1]).length

  return {
    played: played.length,
    scheduled: scheduled.length,
    remaining: scheduled.length - played.length,
    totalPoints,
    ppg: played.length ? totalPoints / played.length / 2 : 0,
    combinedPpg: played.length ? totalPoints / played.length : 0,
    // Home-field advantage, measured rather than assumed. (A tie counts as neither.)
    homeWins,
    homeWinPct: played.length ? homeWins / played.length : 0,
    ties: played.filter((g) => g.score[0] === g.score[1]),
    overtimes: played.filter((g) => g.ot),
    // A one-score game: within 8 points (a touchdown and a two-point conversion).
    oneScore: withMargin.filter((g) => g.margin <= LEAGUE.closeMargin),
    blowouts: withMargin.filter((g) => g.margin >= 21),
    closest: byMargin.slice(0, 5),
    highestScoring: byTotal.slice(0, 5),
  }
}

// Offensive and defensive strength as points per game, plus total point differential —
// the figure the NFL itself uses as a late tiebreaker. Deliberately NOT called
// "efficiency" or "rating": the public feeds expose no per-drive or per-play denominator,
// so anything labelled that way would be fabricated (PLAYBOOK §4).
export function teamScoring(games) {
  const table = computeStandings(games)
  const rows = Object.values(table)
    .filter((r) => r.gp > 0)
    .map((r) => ({
      abbr: r.abbr,
      team: r.team,
      gp: r.gp,
      ppg: r.ppg,
      oppPpg: r.oppPpg,
      netPpg: r.netPpg,
      pf: r.pf,
      pa: r.pa,
      diff: r.diff,
      pct: r.pct,
    }))

  const rank = (key, dir = -1) => {
    const sorted = [...rows].sort((a, b) => (a[key] - b[key]) * dir)
    return Object.fromEntries(sorted.map((r, i) => [r.abbr, i + 1]))
  }
  const offRank = rank('ppg')
  const defRank = rank('oppPpg', 1) // fewer points allowed is better
  const netRank = rank('diff')

  return rows
    .map((r) => ({ ...r, offRank: offRank[r.abbr], defRank: defRank[r.abbr], netRank: netRank[r.abbr] }))
    .sort((a, b) => b.diff - a.diff)
}

// The leaderboards. Each key maps to a field on the committed player record. A player
// only appears where the stat applies (only QBs have passYds), because leaderboard()
// filters out null values.
export const LEADER_CATEGORIES = [
  { key: 'passYds', label: 'Passing yards', short: 'YDS', unit: 'passing' },
  { key: 'passTD', label: 'Passing TDs', short: 'TD', unit: 'passing' },
  { key: 'rushYds', label: 'Rushing yards', short: 'YDS', unit: 'rushing' },
  { key: 'rushTD', label: 'Rushing TDs', short: 'TD', unit: 'rushing' },
  { key: 'recYds', label: 'Receiving yards', short: 'YDS', unit: 'receiving' },
  { key: 'rec', label: 'Receptions', short: 'REC', unit: 'receiving' },
  { key: 'sacks', label: 'Sacks', short: 'SACK', unit: 'defense' },
  { key: 'defInt', label: 'Interceptions', short: 'INT', unit: 'defense' },
]

// Ties share a rank and consume the slots below them (1, 2, 2, 4) — the standard
// leaderboard convention, and the reason this isn't just index + 1.
export function leaderboard(key, { limit = 10, players = PLAYERS } = {}) {
  const eligible = players.filter((p) => p[key] != null)
  const sorted = [...eligible].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))

  const ranked = []
  let rank = 0
  let prev = null
  sorted.forEach((p, i) => {
    if (p[key] !== prev) {
      rank = i + 1
      prev = p[key]
    }
    ranked.push({ ...p, rank, value: p[key] })
  })

  // Keep everyone tied at the cutoff rather than truncating mid-tie.
  const cut = ranked[limit - 1]
  return cut ? ranked.filter((p) => p.rank <= cut.rank) : ranked
}

const scrimmage = (p) => (p.passYds ?? 0) + (p.rushYds ?? 0) + (p.recYds ?? 0)

export const playersByTeam = (abbr, players = PLAYERS) =>
  players.filter((p) => p.team === abbr).sort((a, b) => scrimmage(b) - scrimmage(a))
