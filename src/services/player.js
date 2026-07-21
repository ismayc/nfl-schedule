// Per-player bio for the leaderboard / roster pop-out, fetched when it opens
// (keyless, CORS-open — the same pattern as the game-detail summary). The season
// stat line the modal shows first is already committed in PLAYERS, so this only
// enriches it with the things the season table doesn't carry — jersey, height,
// college, and birthplace country. A failure degrades to stats-only.

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl'
// birthPlace (city/state/country) is not on the site overview — only on the core
// athlete record — so the country line takes a second keyless request.
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes'

// Deterministic headshot URL — no request needed. The <img> hides itself on a 404.
export const headshotUrl = (id) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`

function parseBio(data, core) {
  const a = data?.athlete
  const bp = core?.birthPlace || a?.birthPlace || null
  if (!a && !bp) return null
  return {
    jersey: a?.jersey || null,
    pos: a?.position?.abbreviation || null,
    height: a?.displayHeight || null,
    weight: a?.displayWeight || null,
    age: typeof a?.age === 'number' ? a.age : null,
    college: a?.college?.name || null,
    country: bp?.country || null,
    team: a?.team?.displayName || null,
    experience: typeof a?.experience?.years === 'number' ? a.experience.years : null,
  }
}

// Returns { bio } — null when unavailable — or null if the request fails (offline),
// so the modal keeps its committed season stats.
export async function fetchPlayer(id, { signal } = {}) {
  let overview = null
  let core = null
  try {
    ;[overview, core] = await Promise.all([
      fetch(`${WEB}/athletes/${id}`, { signal }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${CORE}/${id}`, { signal }).then((r) => (r.ok ? r.json() : null)),
    ])
  } catch {
    return null
  }
  return { bio: parseBio(overview, core) }
}
