// Live overlay.
//
// The committed schedule already carries every completed result, so this only has to
// cover games in progress or finished since the last data refresh. Keyless and
// CORS-open — no backend, no .env. The endpoint path is the only league-specific bit.
import { LEAGUE } from '../config/league.js'

const SCOREBOARD = `https://site.api.espn.com/apis/site/v2/sports/${LEAGUE.espnPath}/scoreboard`

const yyyymmdd = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`

function normalizeEvent(ev) {
  const c = ev.competitions?.[0]
  if (!c) return null
  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  if (!home || !away) return null

  const st = c.status?.type || {}
  const num = (v) => (v == null ? null : Number(v.value ?? v))
  const hs = num(home.score)
  const as = num(away.score)
  const hasScore = Number.isFinite(hs) && Number.isFinite(as)

  return {
    id: ev.id,
    live: st.state === 'in',
    final: !!st.completed,
    postponed: st.name === 'STATUS_POSTPONED' || undefined,
    canceled: st.name === 'STATUS_CANCELED' || undefined,
    // "1st 8:24", "Halftime", "Final/OT" — NFL's shortDetail. Shown as a coarse label,
    // not a running clock, per PLAYBOOK §3: a high-frequency score behind a 30s poll is
    // stale within seconds, so we show the quarter, not the seconds.
    statusLabel: st.shortDetail || st.detail || null,
    period: c.status?.period,
    clock: c.status?.displayClock,
    score: hasScore && (st.state === 'in' || st.completed) ? [hs, as] : undefined,
    // Regulation is 4 quarters; anything beyond is overtime.
    ot: c.status?.period > 4 ? c.status.period - 4 : undefined,
  }
}

// The scoreboard is a rolling window; ask for an explicit ±1-day range so a refresh
// after midnight UTC still picks up last night's finals, and a late kickoff resolves
// for a viewer a day ahead. Promise.allSettled so one bad date never blanks the overlay.
export async function fetchLive({ signal, now = new Date() } = {}) {
  const days = [-1, 0, 1].map((d) => {
    const x = new Date(now)
    x.setUTCDate(x.getUTCDate() + d)
    return yyyymmdd(x)
  })

  const results = await Promise.allSettled(
    days.map(async (d) => {
      const res = await fetch(`${SCOREBOARD}?dates=${d}`, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
  )

  const byId = new Map()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const ev of r.value.events || []) {
      const norm = normalizeEvent(ev)
      if (norm) byId.set(norm.id, norm)
    }
  }
  return byId
}

// Overlay live state onto the committed schedule. Live data wins for the games it
// covers; every other game keeps its committed result. The merge copies only DEFINED
// values (PLAYBOOK §1), so a feed omitting a field can never blank one the snapshot holds.
export function applyLive(games, live) {
  if (!live?.size) return games
  return games.map((g) => {
    const l = live.get(g.id)
    if (!l) return g
    const { id, final, ...rest } = l
    const merged = { ...g }
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) merged[k] = v
    }
    return merged
  })
}

export const liveCount = (games) => games.filter((g) => g.live).length
