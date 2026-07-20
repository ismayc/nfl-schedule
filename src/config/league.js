// The single source of NFL identity, vocabulary, and structural rules.
//
// Everything a component or util would otherwise hardcode inline — the league name,
// the noun for a period, the storage prefix, the .ics domain, the close-game margin,
// the playoff shape — lives here. The sibling apps scatter these across ~10 files
// (see docs/PLAYBOOK.md §10, debt #2); the NFL build keeps them in one place so a
// future league is a config edit, not a find-and-replace.
//
// Conference/division *membership* is ESPN-derived and lives in the generated
// src/data/teams.js. This file owns the *rules and display*, not the roster.
import { SEASON, CONFERENCE_BY_ABBR, DIVISION_BY_ABBR } from '../data/teams.js'

export const LEAGUE = {
  id: 'nfl',
  name: 'NFL',
  title: 'The NFL Schedule',
  tagline: 'Every game in your timezone',
  season: SEASON,
  espnPath: 'football/nfl',
  storageKey: 'nfl', // → 'nfl:theme', 'nfl:alerts'
  // UI-chrome accent only. Per PLAYBOOK §9, the accent never encodes data.
  themeColor: '#0b1220',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  gameNoun: 'game',
  periodNoun: 'quarter',
  periodShort: 'Q',
  regulationPeriods: 4,
  overtimeLabel: 'OT',
  homeAwaySep: '@',
  kickoffLabel: 'Kickoff', // NFL's "tipoff"

  // ── Time / locale ───────────────────────────────────────────────────────────
  locale: 'en-US',
  hour12: true,
  weekStartsMonday: false, // US sport: Sun–Sat (NFL weeks run Thu→Mon)
  // "probably still in progress" window for the live overlay. NFL games run ~3–3.5h,
  // vs the WNBA's 2.25h — getting this wrong leaves a finished game showing "live".
  gameLengthMs: 3.5 * 60 * 60 * 1000,

  // ── Standings ───────────────────────────────────────────────────────────────
  // W-L-T: a tie counts as half a win. The NFL is the only league in the family
  // that records ties, so this is its defining structural quirk.
  standingsModel: 'winlosstie',
  closeMargin: 8, // "one score" in football (a TD + 2pt conversion)

  // ── Calendar export ─────────────────────────────────────────────────────────
  ics: {
    durationIso: 'PT3H30M',
    prodId: '-//the-nfl-schedule//EN',
    domain: 'the-nfl-schedule',
  },
}

// Conference display names, in bracket/table order (AFC then NFC).
export const CONFERENCES = {
  AFC: 'American Football Conference',
  NFC: 'National Football Conference',
}
export const CONFERENCE_KEYS = ['AFC', 'NFC']

// Divisions read "AFC East" etc.; this is the intra-conference ordering.
export const DIVISION_ORDER = ['East', 'North', 'South', 'West']

// Re-export the ESPN-derived membership so callers have one import point.
export { CONFERENCE_BY_ABBR, DIVISION_BY_ABBR }

// ── Playoff structure ─────────────────────────────────────────────────────────
// Single elimination, seven seeds per conference. Seeds 1–4 are the four division
// winners (seeded by record); 5–7 are wild cards. The #1 seed gets a first-round
// bye, and the bracket RE-SEEDS every round (the highest remaining seed always hosts
// the lowest) — both are the opposite of the WNBA's fixed best-of-N series bracket,
// so none of that geometry carries over. See PLAYBOOK §4: getting seeding wrong
// yields a plausible-looking, entirely wrong bracket.
export const PLAYOFF = {
  seedsPerConference: 7,
  divisionWinnerSeeds: 4,
  byeSeeds: [1],
  reseed: true,
  // First-round matchups by seed (2v7, 3v6, 4v5); the 1 seed sits out.
  wildCardPairs: [
    [2, 7],
    [3, 6],
    [4, 5],
  ],
  rounds: [
    { key: 'WC', name: 'Wild Card', short: 'Wild Card' },
    { key: 'DIV', name: 'Divisional Round', short: 'Divisional' },
    { key: 'CONF', name: 'Conference Championship', short: 'Conf' },
    { key: 'SB', name: 'Super Bowl', short: 'Super Bowl' },
  ],
}
