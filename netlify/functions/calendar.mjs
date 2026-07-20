// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
//
// Unlike the in-app "download" (a one-time snapshot), a subscribed calendar re-fetches
// this endpoint periodically, so newly-final scores show up on their own. Each request
// serves the committed season and best-effort overlays the live ESPN scoreboard on top
// — the same merge the app does — falling back to the committed snapshot if ESPN is down.
//
// This file lives OUTSIDE scripts/, so the "Node built-ins only" refresh-workflow guard
// does not apply: it may import from src/. It reuses the exact same buildIcs/applyLive/
// fetchLive the browser uses, so the subscription and the app can never drift apart.
//
// Netlify Functions v2 (ESM default export). Query: ?teams=KC,DEN filters to those teams.
import { GAMES } from '../../src/data/schedule.js'
import { SEASON } from '../../src/data/teams.js'
import { LEAGUE } from '../../src/config/league.js'
import { buildIcs } from '../../src/utils/ics.js'
import { fetchLive, applyLive } from '../../src/services/espn.js'

export default async (req) => {
  const params = new URL(req.url).searchParams
  const teamsParam = params.get('teams') || ''

  // Best-effort live overlay. A feed hiccup must never fail the whole calendar, so any
  // error here silently falls back to the committed schedule.
  let games = GAMES
  try {
    const live = await fetchLive()
    games = applyLive(GAMES, live)
  } catch {
    /* ESPN unreachable — the committed snapshot still makes a valid calendar */
  }

  let name = `${LEAGUE.name} ${SEASON}`
  if (teamsParam) {
    const want = new Set(
      teamsParam
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    )
    games = games.filter((g) => want.has(g.home) || want.has(g.away))
    name = `${LEAGUE.name} ${SEASON} — My Teams`
  }

  const body = buildIcs(games, { name })

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${LEAGUE.id}-${SEASON}.ics"`,
      // Subscribers poll on their own cadence; 30 min keeps scores fresh without
      // hammering ESPN through Netlify's edge cache.
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
