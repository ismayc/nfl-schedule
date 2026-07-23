#!/usr/bin/env node
// Regenerates src/data/{teams,schedule,leaders}.js from ESPN's public feeds and
// mirrors each team's logo into public/logos/, so the app ships zero external
// requests (offline + PWA friendly).
//
// Node built-ins + the shared relative lib only — no `npm ci` needed, so CI can run
// this on a bare checkout. (PLAYBOOK §8 / house rule.)
//
//   node scripts/fetch-schedule.mjs [--season 2026] [--no-logos]

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SITE, CORE, WEB, getJson, fetchTeams, broadcastNames, monthRange, banner } from './lib/espn.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESPN_PATH = 'football/nfl'
const args = process.argv.slice(2)
const SEASON = Number(args[args.indexOf('--season') + 1]) || new Date().getFullYear()
const WITH_LOGOS = !args.includes('--no-logos')

// ESPN seasonType ids: 1=preseason (skipped — its weeks 1–4 collide with the regular
// season's week numbers), 2=regular, 3=postseason.
const SEASON_TYPE = { 2: 'regular', 3: 'postseason' }

// Postseason round lives in an unstructured headline: "AFC Wild Card", "NFC Divisional
// Playoffs", "AFC Championship", "Super Bowl LX  ". Parse it to a round key so the
// bracket can place a single game without guessing from dates. Order matters —
// "Championship" must be tested before a bare "Super Bowl" fallthrough.
const ROUND_PATTERNS = [
  [/wild\s*card/i, 'WC'],
  [/divisional/i, 'DIV'],
  [/(afc|nfc|conference)\s+championship/i, 'CONF'],
  [/super\s*bowl/i, 'SB'],
]

function parseRound(notes) {
  const headline = (notes || []).map((n) => n.headline).find(Boolean)
  if (!headline) return {}
  const round = ROUND_PATTERNS.find(([re]) => re.test(headline))?.[1]
  return { round, note: headline }
}

function normalizeEvent(ev) {
  const c = ev.competitions?.[0]
  if (!c) return null

  const seasonType = SEASON_TYPE[ev.seasonType?.id ?? c.type?.id]
  if (!seasonType) return null // drops preseason

  const home = c.competitors?.find((t) => t.homeAway === 'home')
  const away = c.competitors?.find((t) => t.homeAway === 'away')
  if (!home || !away) return null

  const st = c.status?.type || {}
  // A score is written ONLY for a completed game (PLAYBOOK §1). In-progress scores are
  // transient and belong to the live overlay, never the committed snapshot.
  const score = st.completed
    ? [Number(home.score?.value ?? home.score), Number(away.score?.value ?? away.score)]
    : undefined
  // Regulation is 4 quarters; anything beyond is overtime.
  const otPeriods = c.status?.period > 4 ? c.status.period - 4 : undefined

  const venue = c.venue || {}
  const broadcast = broadcastNames(c)
  const round = seasonType === 'postseason' ? parseRound(c.notes) : {}

  return {
    id: ev.id,
    // ESPN emits UTC; kept as an absolute instant so it renders into any IANA zone.
    tip: new Date(ev.date).toISOString(),
    seasonType,
    // The week is NFL's primary axis, a first-class field (other leagues don't carry it).
    week: seasonType === 'regular' ? (ev.week?.number ?? c.week?.number ?? null) : undefined,
    home: home.team.abbreviation,
    away: away.team.abbreviation,
    venue: venue.fullName || null,
    city: venue.address?.city || null,
    state: venue.address?.state || null,
    neutral: c.neutralSite || undefined,
    broadcast: broadcast.length ? broadcast : undefined,
    score,
    ot: otPeriods,
    // A postponed game keeps its original slot AND gets a makeup event, so both are in
    // the feed. Flagging lets standings skip the dead one.
    postponed: st.name === 'STATUS_POSTPONED' || undefined,
    canceled: st.name === 'STATUS_CANCELED' || undefined,
    ...round,
  }
}

export async function fetchSchedule(teams, season = SEASON) {
  const byId = new Map()
  const results = await Promise.all(
    teams.map(async (t) => {
      const evs = []
      for (const type of [2, 3]) {
        const d = await getJson(`${SITE}/${ESPN_PATH}/teams/${t.abbr}/schedule?season=${season}&seasontype=${type}`)
        evs.push(...(d.events || []))
      }
      return evs
    })
  )
  for (const ev of results.flat()) {
    const game = normalizeEvent(ev)
    if (game) byId.set(game.id, game)
  }
  return [...byId.values()].sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))
}

// Conference + division membership. The teams feed carries neither (PLAYBOOK §2, trap 1),
// so pull it from the standings tree. NFL needs the DIVISION level, which requires
// `level=3` — the default tree only nests conference → 16 teams.
async function fetchGroups() {
  const conf = {}
  const div = {}
  try {
    const tree = await getJson(`${CORE}/${ESPN_PATH}/standings?season=${SEASON}&level=3`)
    const walk = (node, confKey = null) => {
      const label = node.abbreviation || node.name
      const isConf = /^(AFC|NFC)$/.test(label || '')
      const nextConf = isConf ? label : confKey
      if (node.standings?.entries?.length) {
        for (const e of node.standings.entries) {
          const abbr = e.team.abbreviation
          conf[abbr] = nextConf
          div[abbr] = node.name // "AFC East"
        }
      }
      for (const child of node.children || []) walk(child, nextConf)
    }
    walk(tree)
  } catch (err) {
    console.warn(`  (standings level=3 unavailable — conference/division left empty: ${err.message})`)
  }
  return { conf, div }
}

// Per-game line scores + top performers live only on the scoreboard, not the
// team-schedule feed. The scoreboard accepts a date RANGE, so a month per request
// covers the season in a handful of calls. (Empty for an unplayed 2026 season — no-op.)
const GAME_LEADER_CATS = ['passingYards', 'rushingYards', 'receivingYards']

async function enrichWithBoxScores(games) {
  const months = [...new Set(games.filter((g) => g.score).map((g) => g.tip.slice(0, 7)))].sort()
  const byId = new Map()
  for (const ym of months) {
    const d = await getJson(`${SITE}/${ESPN_PATH}/scoreboard?dates=${monthRange(ym)}&limit=400`)
    for (const ev of d.events || []) {
      const c = ev.competitions?.[0]
      if (!c) continue
      const home = c.competitors?.find((t) => t.homeAway === 'home')
      const away = c.competitors?.find((t) => t.homeAway === 'away')
      if (!home || !away) continue
      const line = (t) => (t.linescores || []).map((l) => Number(l.value))
      const hl = line(home)
      const al = line(away)
      const stars = (c.competitors || [])
        .flatMap((t) =>
          (t.leaders || [])
            .filter((l) => GAME_LEADER_CATS.includes(l.name))
            .map((l) => {
              const top = l.leaders?.[0]
              if (!top) return null
              return {
                cat: l.name,
                v: top.displayValue,
                who: top.athlete?.shortName || top.athlete?.displayName,
                team: t.team.abbreviation,
              }
            })
        )
        .filter(Boolean)
      byId.set(ev.id, {
        line: hl.length || al.length ? { home: hl, away: al } : undefined,
        stars: stars.length ? stars : undefined,
      })
    }
  }
  let n = 0
  for (const g of games) {
    const extra = byId.get(g.id)
    if (!extra) continue
    if (extra.line) {
      g.line = extra.line
      n++
    }
    if (extra.stars) g.stars = extra.stars
  }
  return n
}

// Curated season stat lines for every qualified player, in one request. Keys are
// namespaced by category because names collide across them: passing `interceptions`
// (thrown) vs defensive `interceptions` (caught). Named literally — the feed exposes no
// composite "efficiency" beyond ESPN's own QBR/passer rating, so we invent none (PLAYBOOK §4).
const SELECT = {
  general: { gamesPlayed: 'gp' },
  passing: {
    passingYards: 'passYds', passingTouchdowns: 'passTD', interceptions: 'passInt',
    completionPct: 'cmpPct', passingYardsPerGame: 'passYpg', QBRating: 'rating',
    completions: 'cmp', passingAttempts: 'passAtt',
  },
  rushing: {
    rushingYards: 'rushYds', rushingTouchdowns: 'rushTD',
    rushingYardsPerGame: 'rushYpg', yardsPerRushAttempt: 'rushAvg', rushingAttempts: 'car',
  },
  receiving: {
    receivingYards: 'recYds', receptions: 'rec', receivingTouchdowns: 'recTD',
    receivingYardsPerGame: 'recYpg', receivingTargets: 'tgts',
  },
  scoring: { totalPoints: 'points', totalTouchdowns: 'td' },
  defensive: { totalTackles: 'tackles', sacks: 'sacks', tacklesForLoss: 'tfl', passesDefended: 'pd' },
  defensiveinterceptions: { interceptions: 'defInt' },
  kicking: { fieldGoalsMade: 'fgm', fieldGoalPct: 'fgPct' },
}

const round = (v, p = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(p)) : null

// Integers vs 1-decimal by key suffix/meaning.
const precisionFor = (key) =>
  /Pct$|rating|Avg$|Ypg$/.test(key) || key === 'cmpPct' ? 1 : 0

async function fetchLeaders() {
  const d = await getJson(
    `${WEB}/${ESPN_PATH}/statistics/byathlete?region=us&lang=en&season=${SEASON}&seasontype=2&limit=300`
  )
  // The category name→index mapping is defined once at the top level; each athlete's
  // per-category `values` array aligns to it index-for-index.
  const catNames = Object.fromEntries((d.categories || []).map((c) => [c.name, c.names || []]))

  return (d.athletes || [])
    .map(({ athlete: a, categories }) => {
      const stats = {}
      for (const cat of categories || []) {
        const pick = SELECT[cat.name]
        const names = catNames[cat.name]
        if (!pick || !names) continue
        for (const [src, out] of Object.entries(pick)) {
          const i = names.indexOf(src)
          if (i === -1) continue
          stats[out] = round(cat.values?.[i], precisionFor(out))
        }
      }
      return {
        id: a.id,
        name: a.displayName,
        short: a.shortName,
        team: a.teamShortName,
        pos: a.position?.abbreviation || null,
        ...stats,
      }
    })
    .filter((p) => p.team && p.gp)
    // Neutral, deterministic order; the Stats view re-ranks per category.
    .sort((a, b) => (b.gp ?? 0) - (a.gp ?? 0) || a.name.localeCompare(b.name))
}

// Logos never render larger than ~64px, so pull them through ESPN's combiner at 160px
// (~8KB vs ~43KB). Light + dark variants; CSS picks one by theme, no re-request.
const LOGO_PX = 160
const resized = (url) =>
  `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(url).pathname)}&w=${LOGO_PX}&h=${LOGO_PX}`

async function mirrorLogos(teams) {
  await mkdir(join(ROOT, 'public/logos'), { recursive: true })
  let n = 0
  let bytes = 0
  const grab = async (url, file) => {
    const res = await fetch(resized(url))
    if (!res.ok) throw new Error(`logo ${file}: HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  const put = async (file, buf) => {
    await writeFile(join(ROOT, 'public/logos', file), buf)
    n++
    bytes += buf.length
  }
  await Promise.all(
    teams.map(async (t) => {
      if (!t.logo) return
      const light = await grab(t.logo, `${t.slug}.png`)
      await put(`${t.slug}.png`, light)
      // Fall back to the light logo when a team has no ESPN "dark" variant (e.g. an
      // expansion or relocated team): the dark theme renders `${slug}-dark.png`, so a
      // missing file shows an invisible logo. A full-colour ball reads fine on dark.
      const dark = t.logoDark ? await grab(t.logoDark, `${t.slug}-dark.png`) : light
      await put(`${t.slug}-dark.png`, dark)
    })
  )
  return { n, kb: Math.round(bytes / 1024) }
}

async function main() {
  console.log(`Fetching ${SEASON} NFL teams…`)
  const teams = await fetchTeams(ESPN_PATH)
  console.log(`  ${teams.length} teams`)

  console.log('Fetching conference/division membership…')
  const { conf, div } = await fetchGroups()
  const ungrouped = teams.filter((t) => !conf[t.abbr])
  if (ungrouped.length) console.warn(`  ⚠ ungrouped: ${ungrouped.map((t) => t.abbr).join(', ')}`)
  else console.log(`  all ${teams.length} teams placed in ${new Set(Object.values(div)).size} divisions`)

  console.log('Fetching schedules…')
  const games = await fetchSchedule(teams)
  const counts = games.reduce((a, g) => ({ ...a, [g.seasonType]: (a[g.seasonType] || 0) + 1 }), {})
  console.log(`  ${games.length} games`, counts)

  // Enriches `games` in place — must run before schedule.js is written.
  console.log('Fetching line scores…')
  console.log(`  ${await enrichWithBoxScores(games)} games with quarter breakdowns`)

  const teamData = teams.map(({ logo, logoDark, ...t }) => t)

  await writeFile(
    join(ROOT, 'src/data/teams.js'),
    banner(`${SITE}/${ESPN_PATH}/teams + standings?level=3`) +
      `export const SEASON = ${SEASON}\n\n` +
      `export const TEAMS = ${JSON.stringify(teamData, null, 2)}\n\n` +
      `export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))\n\n` +
      `export const ALL_ABBRS = TEAMS.map((t) => t.abbr)\n\n` +
      `// Conference/division membership, pulled from the standings tree (the teams feed\n` +
      `// carries neither). Seeding and grouping derive from these.\n` +
      `export const CONFERENCE_BY_ABBR = ${JSON.stringify(conf, null, 2)}\n\n` +
      `export const DIVISION_BY_ABBR = ${JSON.stringify(div, null, 2)}\n`
  )

  await writeFile(
    join(ROOT, 'src/data/schedule.js'),
    banner(`${SITE}/${ESPN_PATH}/teams/{abbr}/schedule?season=${SEASON}&seasontype=2,3`) +
      `export const GAMES = [\n` +
      games.map((g) => `  ${JSON.stringify(g)},`).join('\n') +
      `\n]\n\n` +
      `export const SEASON_TYPES = ['regular', 'postseason']\n`
  )

  console.log('Fetching player stats…')
  const leaders = await fetchLeaders()
  console.log(`  ${leaders.length} qualified players`)

  await writeFile(
    join(ROOT, 'src/data/leaders.js'),
    banner(`${WEB}/${ESPN_PATH}/statistics/byathlete?season=${SEASON}&seasontype=2`) +
      `// Season stat lines for every qualified player, so leaderboards are a build-time\n` +
      `// concern rather than a runtime fetch. Empty until the season is under way.\n` +
      `export const PLAYERS = [\n` +
      leaders.map((p) => `  ${JSON.stringify(p)},`).join('\n') +
      `\n]\n`
  )

  if (WITH_LOGOS) {
    console.log('Mirroring logos…')
    const { n, kb } = await mirrorLogos(teams)
    console.log(`  ${n} files, ${kb} KB → public/logos/`)
  }

  console.log('Done.')
}

// Only run the generator when invoked directly (node scripts/fetch-schedule.mjs) — the
// test fixture builder imports fetchSchedule/normalizeEvent without triggering a write.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nfetch-schedule failed:\n${err.message}`)
    process.exit(1)
  })
}

export { normalizeEvent }
