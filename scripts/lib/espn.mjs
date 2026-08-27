// Shared fetch helpers for the data scripts.
//
// Both prior builds copy-pasted getJson/arg into every script, because the
// "no node_modules imports" CI rule was read as "no shared module at all". It isn't —
// the guard allows relative imports. This file satisfies it and removes the drift.
//
// Node built-ins only.

import { getJson, mapLimit, CONCURRENCY } from './fetch.mjs'

export { sleep, backoffMs, CONCURRENCY, mapLimit, fetchRetry, getJson, getText } from './fetch.mjs'

// All three hosts are site.web.api, NOT site.api. ESPN's edge applies a
// datacenter-egress block to site.api only: from a GitHub runner — or any cloud IP —
// every site.api request answers 403, while the same path on site.web.api answers 200.
// It is not the per-runner-IP block the refresh workflows were originally written
// against; a fresh runner does not escape it, and neither does a proxy pointed at the
// same host. Diagnosed 2026-08-16, after a family-wide refresh outage; site.web.api
// serves these route families with identical payloads (verified route by route across
// both hosts). See docs/ESPN-403.md. Do NOT "restore" the site.api host.
export const SITE = 'https://site.web.api.espn.com/apis/site/v2/sports'
export const CORE = 'https://site.web.api.espn.com/apis/v2/sports'
export const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports'
// Distinct from CORE above, which is site.web.api's v2 (standings). This is ESPN's
// separate core service, the only feed that says which teams are actually IN a league,
// via conference membership (see fetchFranchiseIds). Not subject to the datacenter block
// that took site.api out: the Premier League sibling has fetched it from a runner all along.
export const SPORTS_CORE = 'https://sports.core.api.espn.com/v2/sports'

export const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

export const yyyymmdd = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate()
  ).padStart(2, '0')}`

/** Inclusive UTC month range, for the scoreboard's `dates=start-end` form. */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const p = String(m).padStart(2, '0')
  return `${y}${p}01-${y}${p}${last}`
}

// ESPN's team list for a season is NOT a franchise list. It also carries the exhibition
// clubs a league's teams are scheduled to play: the NBA sibling's 2026-27 list picked up
// "LON", the London Lions (id 134478), a British Basketball League side with a single
// preseason game on file. Left in, such an entry lands in teams.js with no logo and no
// colors, in no division, sitting in the team picker with zero games.
//
// A franchise is a team ESPN places in a CONFERENCE, which is what group membership
// records and what the exhibition clubs lack. It is the same signal fetchGroups already
// leans on when it warns about ungrouped teams, asked earlier and made decisive.
// Verified against the live feed: the NFL's two conferences yield exactly the 32
// committed franchises.
//
// `espnPath` is "football/nfl"; the core service wants "football/leagues/nfl".
export async function fetchFranchiseIds(espnPath, season) {
  const [sport, league] = espnPath.split('/')
  const groups = await getJson(
    `${SPORTS_CORE}/${sport}/leagues/${league}/seasons/${season}/types/2/groups?limit=50`
  )
  const ids = new Set()
  for (const item of groups.items || []) {
    // ESPN hands back `http://` refs; keep the transport encrypted.
    const group = await getJson(item.$ref.replace(/^http:/, 'https:'))
    const ref = group.teams?.$ref
    if (!ref) continue
    const url = new URL(ref.replace(/^http:/, 'https:'))
    url.searchParams.set('limit', '50')
    for (const t of (await getJson(url.href)).items || []) {
      ids.add(t.$ref.match(/\/teams\/(\d+)/)?.[1])
    }
  }
  return ids
}

// `season` is optional: omit it and the franchise filter is skipped, which is what the
// human-run fixture builder and history fetch want. The unattended refresh passes it.
export async function fetchTeams(espnPath, season) {
  const [d, franchises] = await Promise.all([
    getJson(`${SITE}/${espnPath}/teams`),
    season ? fetchFranchiseIds(espnPath, season) : new Set(),
  ])
  const listed = d.sports[0].leagues[0].teams.map(({ team: t }) => t)
  // An empty set means either no season was asked for, or the group feed is unusable.
  // Filtering on it would drop every team and report the wrong problem, so leave the
  // list alone; the caller's roster guard is the backstop.
  if (season && !franchises.size)
    console.warn('  ⚠ no conference membership available; not filtering')
  const teams = franchises.size ? listed.filter((t) => franchises.has(t.id)) : listed
  const dropped = listed.filter((t) => !teams.includes(t))
  if (dropped.length)
    console.log(`  ignored ${dropped.length} non-franchise: ${dropped.map((t) => t.abbreviation).join(' ')}`)
  return teams
    .map((t) => ({
      id: t.id,
      abbr: t.abbreviation,
      slug: (t.slug || t.abbreviation).toLowerCase(),
      name: t.name,
      location: t.location,
      displayName: t.displayName,
      color: t.color ? `#${t.color}` : null,
      altColor: t.alternateColor ? `#${t.alternateColor}` : null,
      logo: (t.logos || []).find((l) => l.rel.includes('default'))?.href || null,
      logoDark: (t.logos || []).find((l) => l.rel.includes('dark'))?.href || null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Both feed shapes: the schedule uses media.shortName, the scoreboard uses names[]. */
export const broadcastNames = (c) => [
  ...new Set(
    (c.broadcasts || [])
      .flatMap((b) => b.names || (b.media ? [b.media.shortName] : []))
      .filter(Boolean)
  ),
]

/**
 * Normalise one ESPN event. `classify` lets a league reclassify a game the feed
 * reports as ordinary — every league has at least one (a cup final, an exhibition).
 */
export function normalizeEvent(ev, { classify } = {}) {
  const c = ev.competitions?.[0]
  if (!c) return null
  const home = c.competitors?.find((t) => t.homeAway === 'home')
  const away = c.competitors?.find((t) => t.homeAway === 'away')
  if (!home || !away) return null

  const st = c.status?.type || {}
  const num = (v) => (v == null ? null : Number(v.value ?? v))
  const hs = num(home.score)
  const as = num(away.score)
  const venue = c.venue || {}
  const headline = (c.notes || []).map((n) => n.headline).find(Boolean)

  const game = {
    id: ev.id,
    // Always an absolute instant. Rendering into a zone is then pure formatting.
    tip: new Date(ev.date).toISOString(),
    home: home.team.abbreviation,
    away: away.team.abbreviation,
    venue: venue.fullName || null,
    city: venue.address?.city || null,
    state: venue.address?.state || null,
    neutral: c.neutralSite || undefined,
    week: ev.week?.number ?? c.week?.number,
    broadcast: broadcastNames(c).length ? broadcastNames(c) : undefined,
    // A score is written ONLY for a completed game. An in-progress score is transient
    // and belongs to the live overlay, never the committed snapshot.
    score: st.completed && Number.isFinite(hs) && Number.isFinite(as) ? [hs, as] : undefined,
    postponed: st.name === 'STATUS_POSTPONED' || undefined,
    canceled: st.name === 'STATUS_CANCELED' || undefined,
    note: headline || undefined,
  }
  return classify ? classify(game, c, ev) : game
}

/**
 * Whole season, by whichever strategy the league supports.
 *
 * Verified 2026-07-20 — this is NOT uniform across ESPN:
 *   'team-schedule'  NBA, NFL, WNBA. teams/{abbr}/schedule?season&seasontype
 *   'calendar-walk'  SOCCER. The per-team schedule endpoint returns HTTP 400 for
 *                    soccer entirely, so the scoreboard's published `calendar` has to
 *                    be walked in date windows instead.
 */
export async function fetchSeason(espnPath, teams, opts = {}) {
  const strategy = opts.strategy || 'team-schedule'
  return strategy === 'calendar-walk'
    ? fetchByCalendar(espnPath, opts)
    : fetchByTeamSchedule(espnPath, teams, opts)
}

/**
 * Walk the league's published calendar in windows.
 *
 * The scoreboard silently caps at ~50 events regardless of `limit`, so the window has
 * to stay small AND the caller must assert the expected total afterwards — a silent
 * short read looks exactly like a quiet season.
 */
export async function fetchByCalendar(espnPath, { windowDays = 10, classify } = {}) {
  const board = await getJson(`${SITE}/${espnPath}/scoreboard`)
  const calendar = (board.leagues?.[0]?.calendar || []).map((d) => String(d).slice(0, 10))
  if (!calendar.length) throw new Error(`${espnPath}: no calendar published`)

  const days = [...new Set(calendar)].sort()
  const byId = new Map()
  for (let i = 0; i < days.length; i += windowDays) {
    const from = days[i].replace(/-/g, '')
    const to = (days[Math.min(i + windowDays - 1, days.length - 1)]).replace(/-/g, '')
    const d = await getJson(`${SITE}/${espnPath}/scoreboard?dates=${from}-${to}&limit=400`)
    for (const ev of d.events || []) {
      const g = normalizeEvent(ev, { classify })
      if (g) byId.set(g.id, g)
    }
  }
  return [...byId.values()].sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))
}

async function fetchByTeamSchedule(espnPath, teams, { season, seasonTypes = [2, 3], classify } = {}) {
  const byId = new Map()
  const pages = await mapLimit(teams, CONCURRENCY, async (t) => {
    const evs = []
    for (const type of seasonTypes) {
      const d = await getJson(
        `${SITE}/${espnPath}/teams/${t.abbr}/schedule?season=${season}&seasontype=${type}`
      )
      evs.push(...(d.events || []))
    }
    return evs
  })
  for (const ev of pages.flat()) {
    const g = normalizeEvent(ev, { classify })
    if (g) byId.set(g.id, g)
  }
  return [...byId.values()].sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))
}

/** One source line per record keeps git diffs readable. */
export const serializeArray = (name, rows) =>
  `export const ${name} = [\n${rows.map((r) => `  ${JSON.stringify(r)},`).join('\n')}\n]\n`

export const banner = (source) =>
  `// GENERATED by scripts/ — do not edit by hand.\n// Source: ${source}\n\n`
