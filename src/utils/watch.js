import { GAMES } from '../data/schedule.js'

// The streaming services and TV packages a viewer can tell us they have, so the
// schedule can flag which games they can actually watch — and filter to them.
//
// A game's `broadcast` is a flat list of national network names (FOX, CBS, NBC,
// ESPN, ABC, Prime Video, NFL Net, Netflix). Streaming exclusives (Prime Video,
// Peacock, Paramount+, Netflix) are matched by their own name and/or the linear
// network they simulcast. A live-TV *bundle* (YouTube TV, Hulu + Live TV, Fubo,
// Sling, cable) never appears in that list — it carries a game whenever the game
// airs on a national network the bundle carries, so each bundle is defined by the
// networks it carries. Bundle carriage differs by bundle and, in reality, by market
// and over time; the mappings here are the national defaults and are approximate.
//
// Sunday-afternoon CBS/FOX games are distributed REGIONALLY (which one your market
// gets depends on where you live — ESPN publishes no market/DMA data), so a match
// there means "on your local CBS/FOX if your market carries this game." See
// isRegional() below.
//
// A market-specific feed (an RSN or local station) can't be folded into a bundle's
// mapping — carriage depends on where you live. Any such name in the data becomes a
// pickable entry instead; see LOCAL_CATALOG below.

// National network names, by the exact string ESPN emits in `broadcast`.
const FOX = 'FOX'
const CBS = 'CBS'
const NBC = 'NBC'
const ESPN = 'ESPN'
const ABC = 'ABC'
const PRIME = 'Prime Video'
const NFLNET = 'NFL Net'
const NETFLIX = 'Netflix'

// The four free over-the-air broadcast networks — what an antenna picks up.
const LOCALS = [FOX, CBS, NBC, ABC]

// carries(...names) → a matcher that's true when a game's broadcast list names any
// of them.
const carries = (...names) => {
  const set = new Set(names)
  return (broadcast) => broadcast.some((n) => set.has(n))
}

// Ordered streaming-first, then live-TV bundles. This is also the display order for
// badges and the picker. `kind` only labels the picker ('Streaming' vs 'Live TV').
export const SERVICE_CATALOG = [
  { key: 'prime', label: 'Prime Video', kind: 'stream', match: carries(PRIME) },
  { key: 'peacock', label: 'Peacock', kind: 'stream', match: carries('Peacock', NBC) },
  { key: 'paramount', label: 'Paramount+', kind: 'stream', match: carries('Paramount+', CBS) },
  { key: 'espn', label: 'ESPN', kind: 'stream', match: carries('ESPN+', ESPN) },
  { key: 'netflix', label: 'Netflix', kind: 'stream', match: carries(NETFLIX) },
  { key: 'nflplus', label: 'NFL+', kind: 'stream', match: carries('NFL+', NFLNET) },
  {
    key: 'sundayticket',
    label: 'NFL Sunday Ticket',
    kind: 'stream',
    // Sunday Ticket is the OUT-OF-MARKET package: it carries the regional
    // Sunday-afternoon CBS/FOX slates. A national CBS/FOX telecast (Thanksgiving,
    // Christmas) is one feed every market already gets — not a Sunday Ticket game.
    match: (broadcast, game) => !!game && isRegional(game),
  },
  { key: 'antenna', label: 'Antenna (local TV)', kind: 'bundle', match: carries(...LOCALS) },
  { key: 'youtubetv', label: 'YouTube TV', kind: 'bundle', match: carries(FOX, CBS, NBC, ESPN, ABC, NFLNET) },
  { key: 'hulu', label: 'Hulu + Live TV', kind: 'bundle', match: carries(FOX, CBS, NBC, ESPN, ABC, NFLNET) },
  { key: 'fubo', label: 'Fubo', kind: 'bundle', match: carries(FOX, CBS, NBC, ESPN, ABC, NFLNET) },
  { key: 'sling', label: 'Sling TV', kind: 'bundle', match: carries(NBC, ESPN, NFLNET) },
  { key: 'cable', label: 'Cable / Satellite', kind: 'bundle', match: carries(FOX, CBS, NBC, ESPN, ABC, NFLNET) },
]

// Every name the national catalog above already accounts for — a broadcast entry
// outside this set lands in the local-channel picker. The NFL's slate is entirely
// national today, so this catalog is normally EMPTY and the picker's local section
// hides itself — it exists so a market feed ESPN starts naming shows up on its own.
const NATIONAL_NAMES = new Set([
  FOX,
  CBS,
  NBC,
  ESPN,
  ABC,
  PRIME,
  NFLNET,
  NETFLIX,
  'ESPN+',
  'Peacock',
  'Paramount+',
  'NFL+',
])

// The distinct local/regional feeds a season's games name, as picker entries. Each
// feed is attributed to the one team present in EVERY game it airs (a market feed
// carries its team home and away) — `team` is that abbr, or null if no single team
// survives the intersection. Sorted by team then name so the picker reads as a
// per-market list. Pure so tests can feed fixture games; the app-facing
// LOCAL_CATALOG below derives from the committed schedule, so it tracks whatever
// ESPN currently emits.
export function localChannelCatalog(games) {
  const teamsByName = new Map()
  for (const g of games) {
    for (const b of g.broadcast || []) {
      if (NATIONAL_NAMES.has(b)) continue
      const prev = teamsByName.get(b)
      const pair = [g.home, g.away]
      teamsByName.set(b, new Set(prev ? pair.filter((t) => prev.has(t)) : pair))
    }
  }
  return [...teamsByName.entries()]
    .map(([name, teams]) => ({
      key: `local:${name}`,
      label: name,
      kind: 'local',
      team: teams.size === 1 ? [...teams][0] : null,
      match: carries(name),
    }))
    .sort(
      (a, b) =>
        (a.team || '\uffff').localeCompare(b.team || '\uffff') ||
        a.label.localeCompare(b.label)
    )
}

export const LOCAL_CATALOG = localChannelCatalog(GAMES)

const FULL_CATALOG = [...SERVICE_CATALOG, ...LOCAL_CATALOG]

export const SERVICE_BY_KEY = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.key, s]))

// Broadcast entries not already shown as a personalized 📺 badge, so a game on
// "Prime Video" (with Prime selected) renders one "📺 Prime Video" badge rather than
// the redundant "Prime Video · 📺 Prime Video". Bundle badges (e.g. YouTube TV) don't
// match a broadcast name, so their underlying network (FOX, CBS, …) is left in place.
export function broadcastNotBadged(broadcast, watched) {
  if (!broadcast?.length) return []
  const shown = new Set((watched || []).map((s) => s.label))
  return broadcast.filter((b) => !shown.has(b))
}

// The viewer's selected services (by key) that carry this game, in catalog order.
// Returns [] when nothing is selected or the broadcast is unknown — so a viewer who
// hasn't chosen services sees no personalized badge (the raw network list in the
// card meta still shows where the game is on). `game` feeds the matchers that need
// more than the network list (Sunday Ticket's regional-window test).
export function watchableServices(broadcast, selectedKeys, game) {
  if (!broadcast?.length || !selectedKeys?.length) return []
  const selected = new Set(selectedKeys)
  return FULL_CATALOG.filter((s) => selected.has(s.key) && s.match(broadcast, game))
}

// Whether a game is a REGIONAL Sunday-afternoon broadcast rather than a single
// national telecast. ESPN gives no market/DMA data, so the honest signal is the
// window: a Sunday game (roughly the 1pm & 4pm ET slates) carried solely on CBS or
// FOX is regionally distributed — which of those games your TV market gets depends on
// where you are. Every other window (Sun/Mon/Thu night, Prime/ESPN/ABC/NBC/Netflix/
// NFL Net, Thanksgiving, international mornings) is one national telecast.
const REGIONAL_NETS = new Set([CBS, FOX])
// Hoisted: an Intl.DateTimeFormat is expensive to construct, and this now runs per
// game inside the watch filter, not just once per rendered card.
const REGIONAL_WINDOW_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  hour12: false,
})
export function isRegional(game) {
  const b = game.broadcast || []
  if (b.length !== 1 || !REGIONAL_NETS.has(b[0])) return false
  const parts = REGIONAL_WINDOW_FMT.formatToParts(new Date(game.tip))
  const weekday = parts.find((p) => p.type === 'weekday')?.value
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24
  return weekday === 'Sun' && hour >= 12 && hour < 19
}
