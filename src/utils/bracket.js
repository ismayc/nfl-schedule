// The NFL postseason bracket — single elimination, seven seeds per conference.
//
// Nothing from the WNBA's bracket carries over: that one is best-of-N SERIES on a fixed
// 8-team, league-wide, non-reseeding tree. The NFL is single games, 7 seeds per
// conference, the #1 seed gets a bye, and every round RE-SEEDS (the highest remaining
// seed always hosts the lowest). Two conference brackets converge at the Super Bowl.
//
// Built from the committed postseason games when they exist; PROJECTED from the regular-
// season seeding when they don't (so the shape is visible before January, and fills in
// as games are played). Slots are TBD until both participants are decided.
import { CONFERENCE_KEYS, PLAYOFF } from '../config/league.js'
import { CONFERENCE_BY_ABBR } from '../data/teams.js'
import { conferenceSeeds, countsForStandings } from './standings.js'

const winnerOf = (m) => m?.winner

function toMatchup(g, seedOf) {
  return {
    round: g.round,
    id: g.id,
    tip: g.tip,
    home: g.home,
    away: g.away,
    score: g.score,
    // No ties in the postseason, so a score decides it outright.
    winner: g.score ? (g.score[0] > g.score[1] ? g.home : g.away) : undefined,
    neutral: g.neutral,
    live: g.live,
    statusLabel: g.statusLabel,
    seedHome: seedOf[g.home],
    seedAway: seedOf[g.away],
    played: !!g.score,
  }
}

const findGame = (roundGames, a, b) =>
  roundGames.find((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a))

// One matchup: the actual game if we have it, otherwise a projected pairing with the
// higher seed (lower number) hosting. Either participant may be null (TBD).
function matchup(round, teamA, teamB, roundGames, seedOf) {
  const g = teamA && teamB ? findGame(roundGames, teamA, teamB) : null
  if (g) return toMatchup(g, seedOf)

  let home = teamA
  let away = teamB
  if (teamA && teamB && (seedOf[teamB] ?? 99) < (seedOf[teamA] ?? 99)) {
    home = teamB
    away = teamA
  }
  return {
    round,
    home,
    away,
    seedHome: home ? seedOf[home] : undefined,
    seedAway: away ? seedOf[away] : undefined,
    score: undefined,
    winner: undefined,
    projected: true,
    played: false,
  }
}

function buildConference(confKey, field, confGames, seedOf) {
  const bySeed = Object.fromEntries(field.map((r) => [r.seed, r.abbr]))
  const inRound = (k) => confGames.filter((g) => g.round === k)
  const byeTeam = bySeed[1]

  // Wild Card: 2v7, 3v6, 4v5 (the #1 seed sits out). Build from the ACTUAL games when
  // they exist (ordered by host seed), projecting from seeds only before they're played.
  // Doing it game-first keeps the display correct even where our seeding approximation
  // orders two identical-record wild cards differently than the league did.
  const wcGames = inRound('WC')
  const WC = wcGames.length
    ? wcGames
        .map((g) => matchup('WC', g.home, g.away, wcGames, seedOf))
        .sort((a, b) => (a.seedHome ?? 99) - (b.seedHome ?? 99))
    : PLAYOFF.wildCardPairs.map(([hi, lo]) => matchup('WC', bySeed[hi], bySeed[lo], [], seedOf))

  // Divisional: the bye team plus the three Wild Card winners, RE-SEEDED so the top
  // remaining seed hosts the bottom one.
  const divGames = inRound('DIV')
  let DIV
  if (divGames.length) {
    DIV = divGames.map((g) => matchup('DIV', g.home, g.away, divGames, seedOf))
  } else {
    const advancers = [byeTeam, ...WC.map(winnerOf)].filter(Boolean)
    if (advancers.length === 4) {
      const s = [...advancers].sort((a, b) => seedOf[a] - seedOf[b])
      DIV = [matchup('DIV', s[0], s[3], [], seedOf), matchup('DIV', s[1], s[2], [], seedOf)]
    } else {
      DIV = [matchup('DIV', byeTeam, null, [], seedOf), matchup('DIV', null, null, [], seedOf)]
    }
  }

  // Conference Championship: the two Divisional winners.
  const confChampGames = inRound('CONF')
  let CONF
  if (confChampGames.length) {
    const g = confChampGames[0]
    CONF = matchup('CONF', g.home, g.away, confChampGames, seedOf)
  } else {
    const finalists = DIV.map(winnerOf).filter(Boolean)
    CONF =
      finalists.length === 2
        ? matchup('CONF', finalists[0], finalists[1], [], seedOf)
        : { round: 'CONF', home: null, away: null, projected: true, played: false }
  }

  return { conference: confKey, seeds: field, byeTeam, WC, DIV, CONF, champion: winnerOf(CONF) }
}

export function buildBracket(games) {
  const seeds = conferenceSeeds(games)
  const seedOf = {}
  for (const conf of CONFERENCE_KEYS) for (const r of seeds[conf]) seedOf[r.abbr] = r.seed

  const postseason = games.filter((g) => g.seasonType === 'postseason')

  const conferences = {}
  for (const conf of CONFERENCE_KEYS) {
    const field = seeds[conf].filter((r) => r.inField)
    const confGames = postseason.filter(
      (g) => CONFERENCE_BY_ABBR[g.home] === conf && CONFERENCE_BY_ABBR[g.away] === conf
    )
    conferences[conf] = buildConference(conf, field, confGames, seedOf)
  }

  // Super Bowl: the one inter-conference game, at a neutral site.
  const sbGame = postseason.find(
    (g) => g.round === 'SB' || CONFERENCE_BY_ABBR[g.home] !== CONFERENCE_BY_ABBR[g.away]
  )
  const sb = sbGame
    ? { ...toMatchup(sbGame, seedOf), neutral: true }
    : {
        round: 'SB',
        neutral: true,
        home: conferences[CONFERENCE_KEYS[0]].champion || null,
        away: conferences[CONFERENCE_KEYS[1]].champion || null,
        winner: undefined,
        projected: true,
        played: false,
      }

  return {
    conferences,
    sb,
    champion: winnerOf(sb),
    seeds,
    // Seeds are only meaningful once games have been played; before Week 1 the whole
    // field is tied and the bracket is a placeholder.
    regularSeasonStarted: games.some(countsForStandings),
    hasPostseason: postseason.length > 0,
  }
}
