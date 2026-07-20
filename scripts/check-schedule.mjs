#!/usr/bin/env node
// Compares the committed schedule against ESPN's live feed and reports drift.
//
// Run in CI to answer one question: is src/data/schedule.js still correct? It never
// writes anything — the refresh workflow regenerates and opens a PR. Keeping detection
// separate from generation means a failing check is readable in the log rather than
// buried in a diff.
//
// Node built-ins + the shared relative lib only, so CI runs it without npm ci.
//
//   node scripts/check-schedule.mjs [--season 2026] [--quiet]

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE, getJson } from './lib/espn.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESPN_PATH = 'football/nfl'

const args = process.argv.slice(2)
const SEASON = Number(args[args.indexOf('--season') + 1]) || 2026
const QUIET = args.includes('--quiet')

// Read the committed data without a bundler. The generated file is ES module source with
// one record per line and a trailing comma — valid JS, invalid JSON — so the trailing
// comma is stripped before parsing.
async function loadCommitted() {
  const src = await readFile(join(ROOT, 'src/data/schedule.js'), 'utf8')
  const start = src.indexOf('[', src.indexOf('export const GAMES'))
  const end = src.indexOf('\n]', start)
  if (start < 0 || end < 0) throw new Error('could not locate the GAMES array')
  const body = src.slice(start, end + 2)
  return JSON.parse(body.replace(/,(\s*])/g, '$1'))
}

async function fetchLive() {
  const teamsDoc = await getJson(`${SITE}/${ESPN_PATH}/teams`)
  const abbrs = teamsDoc.sports[0].leagues[0].teams.map((t) => t.team.abbreviation)

  const byId = new Map()
  for (const abbr of abbrs) {
    for (const type of [2, 3]) {
      const d = await getJson(`${SITE}/${ESPN_PATH}/teams/${abbr}/schedule?season=${SEASON}&seasontype=${type}`)
      for (const ev of d.events || []) {
        const c = ev.competitions?.[0]
        if (!c) continue
        const home = c.competitors.find((t) => t.homeAway === 'home')
        const away = c.competitors.find((t) => t.homeAway === 'away')
        if (!home || !away) continue
        const st = c.status?.type || {}
        const num = (v) => Number(v?.value ?? v)
        byId.set(ev.id, {
          id: ev.id,
          tip: new Date(ev.date).toISOString(),
          home: home.team.abbreviation,
          away: away.team.abbreviation,
          score: st.completed ? [num(home.score), num(away.score)] : undefined,
          postponed: st.name === 'STATUS_POSTPONED' || undefined,
        })
      }
    }
  }
  return byId
}

const sameScore = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

async function main() {
  const committed = await loadCommitted()
  const live = await fetchLive()
  const byId = new Map(committed.map((g) => [g.id, g]))

  const added = []
  const removed = []
  const moved = []
  const rescored = []

  for (const [id, l] of live) {
    const c = byId.get(id)
    if (!c) {
      added.push(l)
      continue
    }
    if (c.tip !== l.tip) moved.push({ id, from: c.tip, to: l.tip })
    if (!sameScore(c.score, l.score)) rescored.push({ id, from: c.score, to: l.score })
  }
  for (const [id, c] of byId) if (!live.has(id)) removed.push(c)

  const total = added.length + removed.length + moved.length + rescored.length

  if (!QUIET || total) {
    console.log(`Committed: ${committed.length} games · Live: ${live.size} games`)
    const show = (label, rows, fmt) => {
      if (!rows.length) return
      console.log(`\n${label} (${rows.length}):`)
      for (const r of rows.slice(0, 20)) console.log(`  ${fmt(r)}`)
      if (rows.length > 20) console.log(`  …and ${rows.length - 20} more`)
    }
    show('NEW games', added, (g) => `${g.id} ${g.tip} ${g.away} @ ${g.home}`)
    show('REMOVED games', removed, (g) => `${g.id} ${g.tip} ${g.away} @ ${g.home}`)
    show('MOVED kickoffs', moved, (m) => `${m.id} ${m.from} → ${m.to}`)
    show('NEW/CHANGED results', rescored, (r) => `${r.id} ${JSON.stringify(r.from)} → ${JSON.stringify(r.to)}`)
  }

  if (total === 0) {
    console.log('\n✅ Committed schedule matches the live feed.')
    return
  }

  console.log(`\n⚠️  ${total} difference(s) — run "npm run fetch:schedule" to refresh.`)
  process.exit(1)
}

main().catch((err) => {
  console.error(`check-schedule failed: ${err.message}`)
  process.exit(2)
})
