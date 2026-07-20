#!/usr/bin/env node
// Checks a REAL in-progress game against the assumptions src/services/espn.js makes.
//
// Why this exists (PLAYBOOK §6): every field the live overlay reads was INFERRED from
// completed and scheduled games, because no game was in progress while the overlay was
// written. The unit tests mock ESPN using those same inferences, so they cannot catch a
// wrong one — they agree with the assumption by construction. This is the only check that
// compares the assumption to reality. Run it while a game is actually being played:
//
//   node scripts/verify-live.mjs
//
// Node built-ins only, so it runs on a bare checkout.

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

// Each assumption the normalizer in src/services/espn.js depends on.
const CHECKS = [
  { name: "status.type.state is 'in' while playing", get: (c) => c.status?.type?.state, ok: (v) => v === 'in' },
  { name: 'status.type.completed is false while playing', get: (c) => c.status?.type?.completed, ok: (v) => v === false },
  { name: 'status.period is a number 1-4 (or 5 in OT)', get: (c) => c.status?.period, ok: (v) => Number.isFinite(v) && v >= 1 },
  { name: 'status.displayClock is present', get: (c) => c.status?.displayClock, ok: (v) => typeof v === 'string' && v.length > 0 },
  { name: 'status.type.shortDetail reads like "1st 8:24" / "Halftime"', get: (c) => c.status?.type?.shortDetail, ok: (v) => typeof v === 'string' && v.length > 0 },
  {
    name: 'both competitors carry a numeric score mid-game',
    get: (c) => c.competitors?.map((t) => t.score?.value ?? t.score),
    ok: (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(Number(n))),
  },
  { name: 'homeAway identifies both sides', get: (c) => c.competitors?.map((t) => t.homeAway).sort().join(','), ok: (v) => v === 'away,home' },
]

const res = await fetch(SCOREBOARD)
if (!res.ok) {
  console.error(`scoreboard HTTP ${res.status}`)
  process.exit(2)
}
const { events = [] } = await res.json()

const live = events.filter((e) => e.competitions?.[0]?.status?.type?.state === 'in')

if (!live.length) {
  console.log(`No game in progress right now (${events.length} on the current card).`)
  for (const e of events) {
    const st = e.competitions[0].status.type
    console.log(`  ${e.name} — ${st.state} · ${st.shortDetail}`)
  }
  console.log('\nRun this again during a game; nothing was verified.')
  process.exit(0)
}

let failed = 0
for (const ev of live) {
  const c = ev.competitions[0]
  console.log(`\n${ev.name}`)
  console.log(`  raw status: ${JSON.stringify(c.status)}`)
  for (const check of CHECKS) {
    const v = check.get(c)
    const pass = check.ok(v)
    if (!pass) failed++
    console.log(`  ${pass ? '✅' : '❌'} ${check.name}  →  ${JSON.stringify(v)}`)
  }
}

console.log(
  failed
    ? `\n❌ ${failed} assumption(s) wrong — src/services/espn.js needs updating, and the mocks in test/espn.test.js encode the same mistake.`
    : '\n✅ Every assumption the live overlay makes holds against a real in-progress game.'
)
process.exit(failed ? 1 : 0)
