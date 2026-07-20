// Shared fetch helpers for the data scripts.
//
// Both prior builds copy-pasted getJson/arg into every script, because the
// "no node_modules imports" CI rule was read as "no shared module at all". It isn't —
// the guard allows relative imports. This file satisfies it and removes the drift.
//
// Node built-ins only.

export const SITE = 'https://site.api.espn.com/apis/site/v2/sports'
export const CORE = 'https://site.api.espn.com/apis/v2/sports'
export const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports'

export const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

export async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
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

export async function fetchTeams(espnPath) {
  const d = await getJson(`${SITE}/${espnPath}/teams`)
  return d.sports[0].leagues[0].teams
    .map(({ team: t }) => ({
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
  const pages = await Promise.all(
    teams.map(async (t) => {
      const evs = []
      for (const type of seasonTypes) {
        const d = await getJson(
          `${SITE}/${espnPath}/teams/${t.abbr}/schedule?season=${season}&seasontype=${type}`
        )
        evs.push(...(d.events || []))
      }
      return evs
    })
  )
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
