// Timezone + formatting core.
//
// Every game's `tip` is an absolute instant (UTC ISO string), so rendering into any
// IANA zone is a pure formatting concern — no date math, no DST edge cases.
//
// Locale, clock, and the "probably still live" window all come from the league config
// (PLAYBOOK §5: these are the single most-copied piece of wrongness across the family —
// the WNBA build hard-coded en-US / 2.25h, which is wrong for anyone else).
import { LEAGUE } from '../config/league.js'

const FALLBACK_TZ = 'America/New_York'

export const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ
  } catch {
    return FALLBACK_TZ
  }
}

// The zones worth one tap. NFL markets are US-wide; London/Munich host regular-season
// games and the international audience follows year round.
export const TIMEZONES = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Berlin', label: 'Central Europe' },
  { id: 'UTC', label: 'UTC' },
]

export function timezoneOptions(current) {
  const known = TIMEZONES.some((t) => t.id === current)
  return known
    ? TIMEZONES
    : [{ id: current, label: current.split('/').pop().replace(/_/g, ' ') }, ...TIMEZONES]
}

const fmt = (tz, opts) => new Intl.DateTimeFormat(LEAGUE.locale, { timeZone: tz, ...opts })

export function formatTime(iso, tz) {
  return fmt(tz, { hour: 'numeric', minute: '2-digit', hour12: LEAGUE.hour12 }).format(new Date(iso))
}

export function formatDate(iso, tz, opts = {}) {
  return fmt(tz, { weekday: 'short', month: 'short', day: 'numeric', ...opts }).format(new Date(iso))
}

export function formatZoneAbbr(iso, tz) {
  const parts = fmt(tz, { timeZoneName: 'short' }).formatToParts(new Date(iso))
  return parts.find((p) => p.type === 'timeZoneName')?.value || ''
}

// Stable YYYY-MM-DD key for the calendar day a game falls on *in the viewer's zone*.
// A 10pm Pacific kickoff is "today" out west and "tomorrow" on the east coast, and the
// schedule must group by what the viewer actually sees.
export function dayKey(iso, tz) {
  const p = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const get = (t) => p.find((x) => x.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const todayKey = (tz, now = new Date()) => dayKey(now.toISOString(), tz)

export function dayLabel(key, tz, now = new Date()) {
  const today = todayKey(tz, now)
  if (key === today) return 'Today'
  const d = new Date(`${key}T12:00:00Z`)
  const shift = (n) => {
    const x = new Date(d)
    x.setUTCDate(x.getUTCDate() + n)
    return dayKey(x.toISOString(), 'UTC')
  }
  if (shift(-1) === today) return 'Tomorrow'
  if (shift(1) === today) return 'Yesterday'
  return new Intl.DateTimeFormat(LEAGUE.locale, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

export function liveState(game, now = Date.now()) {
  if (game.postponed || game.canceled) return 'void'
  if (game.live) return 'live'
  if (game.score) return 'final'
  const start = new Date(game.tip).getTime()
  if (now < start) return 'upcoming'
  return now < start + LEAGUE.gameLengthMs ? 'likely-live' : 'past'
}

export function countdown(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}
