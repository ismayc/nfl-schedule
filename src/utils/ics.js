// iCalendar (RFC 5545) export.
//
// Games carry an absolute instant, so every event is emitted in UTC with a trailing Z
// and the calendar app renders it in the subscriber's own zone. No VTIMEZONE needed.
// Duration, product id, and UID domain come from the league config.
import { TEAM_BY_ABBR } from '../data/teams.js'
import { LEAGUE, PLAYOFF } from '../config/league.js'

const DURATION = LEAGUE.ics.durationIso
const PRODID = LEAGUE.ics.prodId
const DOMAIN = LEAGUE.ics.domain
const ROUND_NAME = Object.fromEntries(PLAYOFF.rounds.map((r) => [r.key, r.name]))

// Backslash, semicolon, and comma are RFC 5545 delimiters and must be escaped;
// newlines become the literal two-character sequence \n.
export const escapeText = (s = '') =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')

export const toIcsDate = (iso) =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// RFC 5545 caps a line at 75 octets; continuations start with a single space. Measured
// in UTF-8 bytes, not characters, so accented names don't break it.
export function fold(line) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const out = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    out.push(new TextDecoder().decode(bytes.slice(start, end)))
    start = end
    limit = 74
  }
  return out.join('\r\n ')
}

function vevent(game, { now }) {
  const home = TEAM_BY_ABBR[game.home]
  const away = TEAM_BY_ABBR[game.away]

  const title = `${away?.displayName || game.away} at ${home?.displayName || game.home}`
  const summary = game.score ? `${title} (${game.score[1]}–${game.score[0]})` : title

  const where = [game.venue, game.city, game.state].filter(Boolean).join(', ')
  const desc = [
    game.week ? `Week ${game.week}` : null,
    game.broadcast?.length ? `Watch: ${game.broadcast.join(', ')}` : null,
    game.round ? ROUND_NAME[game.round] || game.round : null,
    game.note || null,
  ]
    .filter(Boolean)
    .join('\n')

  const lines = [
    'BEGIN:VEVENT',
    // Stable UID so re-importing updates events rather than duplicating them.
    `UID:${game.id}@${DOMAIN}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(game.tip)}`,
    `DURATION:${DURATION}`,
    `SUMMARY:${escapeText(summary)}`,
  ]
  if (where) lines.push(`LOCATION:${escapeText(where)}`)
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`)
  if (game.postponed || game.canceled) lines.push('STATUS:CANCELLED')
  lines.push('END:VEVENT')
  return lines
}

export function buildIcs(games, { name = LEAGUE.name, now = new Date().toISOString() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...games.flatMap((g) => vevent(g, { now })),
    'END:VCALENDAR',
  ]
  // CRLF line endings are required by the spec, and some clients reject LF-only.
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(games, { filename = `${LEAGUE.id}.ics`, name } = {}) {
  const blob = new Blob([buildIcs(games, { name })], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Turn an http(s) feed URL into a webcal:// subscription URL — what a calendar app
// expects when *registering a live subscription* (an https link only downloads a
// one-time snapshot). Non-http schemes pass through unchanged.
export const webcalUrl = (httpsUrl) => httpsUrl.replace(/^https?:/, 'webcal:')

// A "subscribe in Google Calendar" deep link. Google's `cid` must be a RAW webcal://
// URL — an https:// or percent-encoded one is rejected with "check the URL". Our feed
// uses "," (not "&") to separate teams, so the query string survives inside `cid`.
export const googleCalendarUrl = (httpsUrl) =>
  `https://www.google.com/calendar/render?cid=${webcalUrl(httpsUrl)}`
