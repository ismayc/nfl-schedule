// Query-string state.
//
// There's no router — `view` is a useState string — so the URL is kept in sync by hand.
// Only non-default values are written, which keeps a shared link readable:
//
//   ?view=standings&tz=America/Chicago&team=KC&week=7
//
// Writes use history.replaceState so changing a filter doesn't stack back-button entries.
//
// VIEWS lives here as the single source of truth and App.jsx imports it — the sibling
// apps declared the nav list twice and drifted (PLAYBOOK §10, debt #3).

export const VIEWS = [
  { id: 'schedule', label: '📋 Schedule' },
  { id: 'week', label: '📆 Week' },
  { id: 'standings', label: '📊 Standings' },
  { id: 'playoffs', label: '🏆 Playoffs' },
  { id: 'stats', label: '📈 Stats' },
]

const VALID_VIEWS = VIEWS.map((v) => v.id)

export const DEFAULTS = {
  view: 'schedule',
  tz: null, // no default — falls back to the detected zone
  team: '',
  week: null, // Week view's selected week; null = current/first upcoming
  hide: false,
  mine: false,
  past: false,
}

export function readState(search = window.location.search) {
  const p = new URLSearchParams(search)
  const view = p.get('view')
  const tz = p.get('tz')
  const week = Number(p.get('week'))

  return {
    // An unknown view in a stale link should land on the schedule, not a blank page.
    view: VALID_VIEWS.includes(view) ? view : DEFAULTS.view,
    // Validated against the platform rather than a hard-coded list, so any IANA zone
    // in a shared link works.
    tz: isValidZone(tz) ? tz : null,
    team: p.get('team') || DEFAULTS.team,
    // A one-shot deep link (the family hub sends these): open straight onto this
    // game's detail. Read-only — writeState never emits it, so the first state
    // write returns the URL to plain shareable filter state.
    game: p.get('game') || '',
    week: Number.isInteger(week) && week >= 1 && week <= 18 ? week : null,
    hide: p.get('hide') === '1',
    mine: p.get('mine') === '1',
    past: p.get('past') === '1',
  }
}

export function isValidZone(tz) {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function toSearch(state, detectedTz) {
  const p = new URLSearchParams()
  if (state.view && state.view !== DEFAULTS.view) p.set('view', state.view)
  // Only pin the timezone when it differs from what this device would pick anyway.
  if (state.tz && state.tz !== detectedTz) p.set('tz', state.tz)
  if (state.team) p.set('team', state.team)
  // The week is only meaningful in the Week view.
  if (state.view === 'week' && state.week) p.set('week', String(state.week))
  if (state.hide) p.set('hide', '1')
  if (state.mine) p.set('mine', '1')
  if (state.past) p.set('past', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function writeState(state, detectedTz) {
  if (typeof window === 'undefined') return
  const next = `${window.location.pathname}${toSearch(state, detectedTz)}${window.location.hash}`
  window.history.replaceState(null, '', next)
}
