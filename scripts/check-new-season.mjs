#!/usr/bin/env node
// Has the NFL published the NEXT season's regular-season schedule yet?
//
// The league releases the full schedule in mid-May, months before kickoff. Nothing
// rolls over on its own — the refresh follows the committed teams.js season — so this
// tells us the day the new schedule lands and the rollover becomes a decision rather
// than a discovery. Ported from the-nba-schedule's watch after its 2026-27 release;
// the league specifics below were re-derived for the NFL, not copied.
//
// An NFL season is named for its September: season=2027 kicks off September 2027 and
// finishes with the January–February 2028 playoffs. The target defaults to the season
// AFTER the committed one, so the watch can never re-detect the season the site
// already shows.
//
// Node built-ins only, like every script here, so CI can run it on a bare checkout.
//
//   node scripts/check-new-season.mjs [--season 2027]
//
// Exit 0 always — "not yet" is a normal answer, not a failure. The workflow reads the
// `released` line from stdout rather than an exit code.

import { getJson } from './lib/fetch.mjs'
import { SEASON as COMMITTED_SEASON } from '../src/data/teams.js'

// site.web.api, not site.api — the latter 403s every request from a cloud IP.
// See the note in scripts/lib/espn.mjs.
const SITE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl'

const args = process.argv.slice(2)
const SEASON = Number(args[args.indexOf('--season') + 1]) || COMMITTED_SEASON + 1

// The complete release: 32 teams × 17 games = 272, published all at once in May.
// (Verified: the committed 2026 season carries exactly 272 regular-season games.)
// A small slack absorbs a format tweak without reporting a real release as partial;
// an 18-game season would only grow past the floor.
const INITIAL_RELEASE_FLOOR = 260

// ESPN season types: 1 preseason, 2 regular, 3 postseason. On the SCOREBOARD payload
// this lives only in ev.season.type — ev.seasonType does not exist here (verified
// against the live 2026 scoreboard on 2026-08-14), and competitions[0].type.id is the
// GAME-FORMAT type. Reading the wrong field is how the NBA watch missed its first
// real release. The type filter also excludes August preseason games by itself.
const REGULAR = 2
const typeOf = (ev) => Number(ev.season?.type ?? 0)

// September through the first week of January. Walk month by month — a scoreboard
// range query caps around 1000 events, and monthly windows stay far below it.
const MONTHS = [
  [`${SEASON}0801`, `${SEASON}0831`],
  [`${SEASON}0901`, `${SEASON}0930`],
  [`${SEASON}1001`, `${SEASON}1031`],
  [`${SEASON}1101`, `${SEASON}1130`],
  [`${SEASON}1201`, `${SEASON}1231`],
  [`${SEASON + 1}0101`, `${SEASON + 1}0131`],
]

const games = new Map() // id → event, so an overlapping range can't double-count
for (const [from, to] of MONTHS) {
  const d = await getJson(`${SITE}/scoreboard?dates=${from}-${to}&limit=1000`)
  for (const ev of d.events || []) games.set(ev.id, ev)
}

const all = [...games.values()]
// Guard the season year too: a scoreboard query far past ESPN's data can echo
// CURRENT-season context rather than an empty answer (it does for soccer).
const regular = all
  .filter((ev) => typeOf(ev) === REGULAR && Number(ev.season?.year) === SEASON)
  .sort((a, b) => (a.date < b.date ? -1 : 1))
const preseason = all.filter((ev) => typeOf(ev) === 1)

const label = String(SEASON)
const released = regular.length > 0
const partial = released && regular.length < INITIAL_RELEASE_FLOOR

// Consumed by the workflow via $GITHUB_OUTPUT, so keep these keys stable and single-line.
console.log(`released=${released}`)
console.log(`season=${label}`)
console.log(`year=${SEASON}`)
console.log(`count=${regular.length}`)
console.log(`partial=${partial}`)

if (!released) {
  console.log(`summary=Not yet — no ${label} regular-season games posted (${preseason.length} preseason).`)
} else {
  const first = regular[0]
  const last = regular[regular.length - 1]
  const when = (ev) => ev.date.slice(0, 10)
  console.log(
    `summary=${label} schedule is OUT: ${regular.length} regular-season games` +
      `${partial ? ` (PARTIAL — a complete release is ~272)` : ''}, ` +
      `kicking off ${when(first)} ${first.name}, through ${when(last)}.`
  )
}
