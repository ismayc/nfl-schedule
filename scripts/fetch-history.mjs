#!/usr/bin/env node
// Builds src/data/history.js — one entry per completed season in the current format.
//
//   node scripts/fetch-history.mjs [--from 2021] [--to <SEASON>]
//
// ESPN's NFL `season` is the STARTING year: `season=2025` is the 2025 season, which
// finished with Super Bowl LX in February 2026.
//
// WHY 2021 IS THE FLOOR — two format changes have to line up for seasons to be
// comparable, and 2021 is where both did:
//   · 2020 expanded the playoffs to 14 teams (7 seeds per conference, only the 1 seed
//     byes, every round re-seeded) — the bracket this app models.
//   · 2021 expanded the regular season to 17 games / 18 weeks.
// 2020 has the right bracket but a 16-game season, so its standings denominators don't
// match; 2019 and earlier ran a 12-team playoff with TWO byes per conference, a
// different first round entirely. Starting at 2021 means every archived season is
// directly comparable with the one the app is showing.
//
// WHAT IS COMMITTED, AND WHY IT IS SO SMALL: a full season is ~285 games with line
// scores. Each archived season keeps only
//   · its final conference standings (the computed table, not a scraped one)
//   · its POSTSEASON games — 13 of them: 6 wild card, 4 divisional, 2 championship,
//     1 Super Bowl
//   · its season totals, and its leader boards
// The bracket is then rebuilt at RUNTIME by the same buildBracket() the current season
// uses, so an archived bracket and a live one are the same code path rather than two
// renderers that can drift. Box scores aren't committed either: the game-detail modal
// fetches those from ESPN by event id, and every archived game has one.

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { fetchTeams } from './lib/espn.mjs'
import { fetchSchedule, fetchLeaders } from './fetch-schedule.mjs'
import { SEASON } from '../src/data/teams.js'
import { LEAGUE } from '../src/config/league.js'
import { conferenceSeeds, countsForStandings } from '../src/utils/standings.js'
import { buildBracket } from '../src/utils/bracket.js'
import { leaderboard, LEADER_CATEGORIES } from '../src/utils/stats.js'
import { CONFERENCE_KEYS } from '../src/config/league.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => Number(args[args.indexOf(name) + 1]) || fallback
const FROM = flag('--from', 2021)
// Up to and including the season the app is on. A season still being played has no
// champion and is dropped below, so this can run any day of the year and the current
// season joins the archive by itself the week the Super Bowl is done.
const TO = flag('--to', SEASON)

const LEADERS_PER_CAT = 10
const NOTABLE = 5

// A board row is {id, rank, value}; the stat line lives once per season in a players
// table keyed by id. A player who leads three categories is stored once, and the rows
// the History tab hands to the leaders card and the player pop-out come out the same
// shape those components already take for the live season.
const PLAYER_FIELDS = [
  'id', 'name', 'team', 'pos',
  ...new Set(LEADER_CATEGORIES.map((c) => c.key)),
]
const pick = (p) => Object.fromEntries(PLAYER_FIELDS.map((f) => [f, p[f]]))

const round1 = (v) => (typeof v === 'number' ? Number(v.toFixed(1)) : null)
const round3 = (v) => (typeof v === 'number' ? Number(v.toFixed(3)) : null)

// The committed standings row: what the history table shows, plus what buildBracket
// needs to seed a conference. `results` (a per-game array) and the resolved `team`
// object are dropped — the first only feeds the fields already here, the second is
// looked up from teams.js at render time.
const compactRow = (r) => ({
  abbr: r.abbr,
  seed: r.seed,
  seedType: r.seedType,
  inField: r.inField || undefined,
  division: r.division,
  w: r.w,
  l: r.l,
  // A tie is a real NFL outcome, so it is carried even when zero would be tempting to
  // drop — a 0 that means "no ties" reads differently from an absent field.
  t: r.t,
  pct: round3(r.pct),
  div: [r.div.w, r.div.l, r.div.t],
  conf: [r.conf.w, r.conf.l, r.conf.t],
  home: [r.home.w, r.home.l, r.home.t],
  road: [r.road.w, r.road.l, r.road.t],
  streak: r.streak,
  pf: r.pf,
  pa: r.pa,
  diff: r.diff,
  netPpg: round1(r.netPpg),
})

// Postseason games only; broadcast listings are dropped (a 2021 TV window is noise).
const compactGame = ({ broadcast, line, stars, ...g }) => g

const notableGame = (g) => ({
  id: g.id,
  tip: g.tip,
  home: g.home,
  away: g.away,
  score: g.score,
  ot: g.ot,
})

// Season-wide totals, computed here rather than committed as ~285 games. "One score" is
// the league's own close-game threshold from config (8 points — a touchdown and a
// two-point conversion), not a number invented for this file.
function seasonTotals(games) {
  const played = games.filter(countsForStandings)
  const margin = (g) => Math.abs(g.score[0] - g.score[1])
  const total = (g) => g.score[0] + g.score[1]
  const points = played.reduce((n, g) => n + total(g), 0)

  return {
    played: played.length,
    points,
    combinedPpg: round1(points / played.length),
    homeWins: played.filter((g) => g.score[0] > g.score[1]).length,
    ties: played.filter((g) => g.score[0] === g.score[1]).length,
    ot: played.filter((g) => g.ot).length,
    oneScore: played.filter((g) => margin(g) <= LEAGUE.closeMargin).length,
    shutouts: played.filter((g) => Math.min(...g.score) === 0).length,
    closest: [...played].sort((a, b) => margin(a) - margin(b)).slice(0, NOTABLE).map(notableGame),
    highest: [...played].sort((a, b) => total(b) - total(a)).slice(0, NOTABLE).map(notableGame),
  }
}

function summarise(year, games, leaderRows) {
  const seeds = conferenceSeeds(games)
  const bracket = buildBracket(games)
  const post = games.filter((g) => g.seasonType === 'postseason').map(compactGame)

  const leaders = {}
  const players = {}
  for (const cat of LEADER_CATEGORIES) {
    const board = leaderboard(cat.key, { limit: LEADERS_PER_CAT, players: leaderRows })
    for (const p of board) players[p.id] ??= pick(p)
    leaders[cat.key] = board.map((p) => ({ id: p.id, rank: p.rank, value: p.value }))
  }

  return {
    year,
    label: String(year),
    champion: bracket.champion ?? null,
    runnerUp: bracket.champion
      ? bracket.sb.home === bracket.champion
        ? bracket.sb.away
        : bracket.sb.home
      : null,
    standings: Object.fromEntries(CONFERENCE_KEYS.map((c) => [c, seeds[c].map(compactRow)])),
    games: post,
    totals: seasonTotals(games),
    players,
    leaders,
  }
}

const serialiseSeason = (s) =>
  [
    `  {`,
    `    year: ${s.year},`,
    `    label: ${JSON.stringify(s.label)},`,
    `    champion: ${JSON.stringify(s.champion)},`,
    `    runnerUp: ${JSON.stringify(s.runnerUp)},`,
    `    standings: {`,
    ...CONFERENCE_KEYS.map(
      (c) =>
        `      ${c}: [\n` +
        s.standings[c].map((r) => `        ${JSON.stringify(r)},`).join('\n') +
        `\n      ],`
    ),
    `    },`,
    `    games: [`,
    ...s.games.map((g) => `      ${JSON.stringify(g)},`),
    `    ],`,
    `    totals: {`,
    ...Object.entries(s.totals).map(([k, v]) =>
      Array.isArray(v)
        ? `      ${k}: [\n` + v.map((g) => `        ${JSON.stringify(g)},`).join('\n') + `\n      ],`
        : `      ${k}: ${JSON.stringify(v)},`
    ),
    `    },`,
    `    players: {`,
    ...Object.entries(s.players).map(([id, p]) => `      ${JSON.stringify(id)}: ${JSON.stringify(p)},`),
    `    },`,
    `    leaders: {`,
    ...LEADER_CATEGORIES.map(
      (cat) => `      ${JSON.stringify(cat.key)}: ${JSON.stringify(s.leaders[cat.key])},`
    ),
    `    },`,
    `  },`,
  ].join('\n')

async function main() {
  if (FROM < 2021) throw new Error('the 17-game / 14-team format starts at season 2021')
  if (TO < FROM) throw new Error(`--to ${TO} is before --from ${FROM}`)

  console.log('Fetching teams…')
  const teams = await fetchTeams(LEAGUE.espnPath)

  const seasons = []
  for (let year = TO; year >= FROM; year--) {
    console.log(`Season ${year}…`)
    const games = await fetchSchedule(teams, year)
    const leaderRows = await fetchLeaders(year)
    const s = summarise(year, games, leaderRows)

    if (!s.champion) {
      console.log(`  skipped — no champion yet (${games.length} games)`)
      continue
    }
    console.log(
      `  ${games.length} games → ${s.games.length} postseason rows, ` +
        `champion ${s.champion} over ${s.runnerUp}`
    )
    seasons.push(s)
  }

  const out =
    `// GENERATED by scripts/fetch-history.mjs — do not edit by hand.\n` +
    `// Source: https://site.web.api.espn.com/apis/site/v2/sports/football/nfl\n\n` +
    `// Completed seasons in the current format: a 17-game regular season (2021 on) and a\n` +
    `// 14-team playoff (2020 on). Each season carries its final conference standings, its\n` +
    `// 13 postseason games, its season totals, and its statistical leaders — the ~272\n` +
    `// regular-season games are summarised into the standings rather than committed. The\n` +
    `// bracket is rebuilt from these games at runtime by the same buildBracket() the\n` +
    `// current season uses.\n` +
    `export const HISTORY = [\n` +
    seasons.map(serialiseSeason).join('\n') +
    `\n]\n\n` +
    `export const HISTORY_BY_YEAR = Object.fromEntries(HISTORY.map((s) => [s.year, s]))\n\n` +
    `// Newest first — the order the season picker offers them in.\n` +
    `export const HISTORY_YEARS = HISTORY.map((s) => s.year)\n`

  await writeFile(join(ROOT, 'src/data/history.js'), out)
  console.log(`\nWrote src/data/history.js — ${seasons.length} seasons.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nfetch-history failed:\n${err.message}`)
    process.exit(1)
  })
}
