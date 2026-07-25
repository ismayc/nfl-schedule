// Scoped free-text search over NFL games. A query like `team: Chiefs city: Denver`
// parses into field tokens plus any leftover free text. Plain queries ("Chiefs",
// "Arrowhead", "NBC") still do a broad substring match, so nothing has to be scoped.
// Scoped fields: team, city, venue, broadcast (aliases tv/network/watch).
//
// Kept pure and data-only (no React, no DOM) so it's fully unit-testable: parseQuery
// turns a string into { free, tokens }, and matchesSearch(game, parsed) is the
// predicate the schedule filters on.

import { TEAM_BY_ABBR } from '../data/teams.js'

// Accepted field names (and synonyms) -> canonical field.
const FIELD_ALIASES = {
  team: 'team', teams: 'team', t: 'team',
  city: 'city',
  venue: 'venue', arena: 'venue', stadium: 'venue',
  broadcast: 'broadcast', tv: 'broadcast', network: 'broadcast', watch: 'broadcast',
}

export function parseQuery(input) {
  const q = (input || '').trim()
  const re = /(\w+):\s*/g
  const marks = []
  let m
  while ((m = re.exec(q))) {
    marks.push({ key: m[1].toLowerCase(), start: m.index, valStart: m.index + m[0].length })
  }

  if (marks.length === 0) return { free: q, tokens: [] }

  const tokens = []
  let free = q.slice(0, marks[0].start).trim()
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : q.length
    const value = q.slice(marks[i].valStart, end).trim()
    const field = FIELD_ALIASES[marks[i].key]
    if (field && value) tokens.push({ field, value })
    else if (value) free = `${free} ${value}`.trim() // unknown field -> free text
  }
  return { free, tokens }
}

// Everything searchable about a side: its abbreviation, city/location, nickname,
// and full display name, so `team: chiefs`, `team: kansas`, and `team: KC` all hit.
function teamText(abbr) {
  const t = TEAM_BY_ABBR[abbr]
  if (!t) return (abbr || '').toLowerCase()
  return `${t.abbr} ${t.location} ${t.name} ${t.displayName}`.toLowerCase()
}

function teamMatches(abbr, v) {
  return teamText(abbr).includes(v)
}

// A game's broadcast is a flat list of network names; join it so a token
// matches any single network on the game ("NBC", "ESPN", "Prime Video").
function broadcastText(game) {
  return (game.broadcast || []).join(' ').toLowerCase()
}

function tokenMatch(game, { field, value }) {
  const v = value.toLowerCase()
  if (field === 'team') return teamMatches(game.home, v) || teamMatches(game.away, v)
  if (field === 'city') return (game.city || '').toLowerCase().includes(v)
  if (field === 'broadcast') return broadcastText(game).includes(v)
  return (game.venue || '').toLowerCase().includes(v) // field === 'venue'
}

export function matchesSearch(game, parsed) {
  for (const t of parsed.tokens) {
    if (!tokenMatch(game, t)) return false
  }
  if (parsed.free) {
    const hay = `${teamText(game.home)} ${teamText(game.away)} ${(game.city || '').toLowerCase()} ${(
      game.venue || ''
    ).toLowerCase()} ${broadcastText(game)}`
    if (!hay.includes(parsed.free.toLowerCase())) return false
  }
  return true
}
