// Standings, seeding, and playoff-race math — all pure functions over the merged game
// list, so they can be unit-tested with synthetic arrays and no DOM.
//
// Two things make this the NFL model rather than the WNBA one:
//   1. TIES. A tie counts as half a win: pct = (w + 0.5·t) / gp. The NFL is the only
//      league in the family that records them; miscounting a tie as a loss (what the
//      WNBA code would do) silently corrupts every derived seed.
//   2. SEEDING BY DIVISION. The four division winners take seeds 1–4 by record; the next
//      three teams by conference record are wild cards (5–7). This is the opposite of the
//      WNBA's top-8-league-wide, and getting it wrong yields a plausible, wrong bracket
//      (PLAYBOOK §4).
import { TEAMS, TEAM_BY_ABBR, CONFERENCE_BY_ABBR, DIVISION_BY_ABBR } from '../data/teams.js'
import { PLAYOFF, DIVISION_ORDER, CONFERENCE_KEYS } from '../config/league.js'

export const DIVISIONS = CONFERENCE_KEYS.flatMap((c) => DIVISION_ORDER.map((d) => `${c} ${d}`))

// A game counts toward the standings only if it is a completed regular-season game.
// Postponed shells and the postseason are excluded — that is what makes derived records
// match ESPN's official ones exactly (the verification in PLAYBOOK §2).
export const countsForStandings = (g) =>
  g.seasonType === 'regular' && !!g.score && !g.postponed && !g.canceled

const wlt = () => ({ w: 0, l: 0, t: 0 })

const blankRecord = (abbr) => ({
  abbr,
  team: TEAM_BY_ABBR[abbr],
  conference: CONFERENCE_BY_ABBR[abbr],
  division: DIVISION_BY_ABBR[abbr],
  ...wlt(),
  pf: 0,
  pa: 0,
  home: wlt(),
  road: wlt(),
  div: wlt(), // record vs own-division opponents
  conf: wlt(), // record vs own-conference opponents (incl. division games)
  last5: [],
  streak: 0,
  results: [],
})

// A tie is a real outcome, not a rounding of a win or loss.
const RESULT = { WIN: 'w', LOSS: 'l', TIE: 't' }
const outcomeFor = (mine, theirs) => (mine === theirs ? RESULT.TIE : mine > theirs ? RESULT.WIN : RESULT.LOSS)

export function computeStandings(games) {
  const table = Object.fromEntries(TEAMS.map((t) => [t.abbr, blankRecord(t.abbr)]))

  const played = games.filter(countsForStandings).sort((a, b) => a.tip.localeCompare(b.tip))

  for (const g of played) {
    const [hs, as] = g.score
    for (const [abbr, side, mine, theirs, opp] of [
      [g.home, 'home', hs, as, g.away],
      [g.away, 'road', as, hs, g.home],
    ]) {
      const row = table[abbr]
      if (!row) continue
      const res = outcomeFor(mine, theirs)
      row[res]++
      row[side][res]++
      row.pf += mine
      row.pa += theirs
      if (DIVISION_BY_ABBR[opp] === row.division) row.div[res]++
      if (CONFERENCE_BY_ABBR[opp] === row.conference) row.conf[res]++
      row.results.push({ id: g.id, res, opp, side, pf: mine, pa: theirs, tip: g.tip })
    }
  }

  for (const row of Object.values(table)) {
    row.gp = row.w + row.l + row.t
    row.pct = row.gp ? (row.w + row.t / 2) / row.gp : 0
    row.diff = row.pf - row.pa
    row.ppg = row.gp ? row.pf / row.gp : 0
    row.oppPpg = row.gp ? row.pa / row.gp : 0
    row.netPpg = row.ppg - row.oppPpg
    row.last5 = row.results.slice(-5).map((r) => r.res)
    row.streak = streakOf(row.results)
  }

  return table
}

// Positive = win streak, negative = loss streak; a tie (like the NFL's own convention)
// ends any streak and reads as 0.
function streakOf(results) {
  if (!results.length) return 0
  const last = results[results.length - 1]
  if (last.res === RESULT.TIE) return 0
  let n = 0
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].res !== last.res) break
    n++
  }
  return last.res === RESULT.WIN ? n : -n
}

const pctOf = (r) => (r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0)

// Head-to-head record between two teams (ties count as half), or null if they haven't met.
export function headToHead(games, a, b) {
  const rec = wlt()
  for (const g of games) {
    if (!countsForStandings(g)) continue
    const pair = [g.home, g.away]
    if (!pair.includes(a) || !pair.includes(b)) continue
    const [hs, as] = g.score
    const aScore = g.home === a ? hs : as
    const bScore = g.home === a ? as : hs
    const res = outcomeFor(aScore, bScore)
    rec[res]++
  }
  return rec.w || rec.l || rec.t ? rec : null
}

// ── Tiebreakers ────────────────────────────────────────────────────────────────
// A faithful-enough NFL two-club tiebreaker, computed from the game list. Step order
// differs by scope: same-division ties weigh division record before conference record;
// cross-division (wild-card) ties go straight to conference record. Both then fall to
// strength-of-victory, strength-of-schedule, and net points.
//
// KNOWN LIMIT: the official "common games" step and the 3+-team reduction procedure are
// NOT modelled — a simple pairwise comparator can't express them correctly, and a naive
// attempt mis-crowned a division. Verified against ESPN's published 2025 seeds
// (test/fixtures): this reproduces the correct playoff FIELD, every DIVISION WINNER, and
// 12 of 14 seed positions; the only miss is the order of two identical-record wild cards
// who both make the field (SF/LAR, 12-5, in 2025). See FRAMEWORK-NOTES.md. Records
// themselves are derived exactly (PLAYBOOK §2), so this affects only intra-tie seed order.
const oppsOf = (row) => row.results.map((r) => r.opp)
const beatenBy = (row) => row.results.filter((r) => r.res === RESULT.WIN).map((r) => r.opp)

// Combined win pct of a set of teams (their full-season records), for SOV/SOS.
function combinedPct(abbrs, table) {
  const rec = wlt()
  for (const o of abbrs) {
    const r = table[o]
    if (!r) continue
    rec.w += r.w
    rec.l += r.l
    rec.t += r.t
  }
  return pctOf(rec)
}

export function compareTeams(a, b, games, { table = computeStandings(games), sameDivision = false } = {}) {
  if (b.pct !== a.pct) return b.pct - a.pct

  // 1. Head-to-head (record between the two; a split is no decision).
  const h2h = headToHead(games, a.abbr, b.abbr)
  if (h2h) {
    const av = h2h.w + h2h.t / 2
    const bv = h2h.l + h2h.t / 2
    if (av !== bv) return bv - av
  }

  const cmp = (x, y) => (y !== x ? y - x : 0)
  const divStep = () => cmp(pctOf(a.div), pctOf(b.div))
  const confStep = () => cmp(pctOf(a.conf), pctOf(b.conf))
  const sovStep = () => cmp(combinedPct(beatenBy(a), table), combinedPct(beatenBy(b), table))
  const sosStep = () => cmp(combinedPct(oppsOf(a), table), combinedPct(oppsOf(b), table))
  const diffStep = () => cmp(a.diff, b.diff)
  const pfStep = () => cmp(a.pf, b.pf)

  const chain = sameDivision
    ? [divStep, confStep, sovStep, sosStep, diffStep, pfStep]
    : [confStep, sovStep, sosStep, diffStep, pfStep]

  for (const step of chain) {
    const d = step()
    if (d) return d
  }
  // Deterministic last resort — the actual NFL rule here is a literal coin toss.
  return a.abbr.localeCompare(b.abbr)
}

// Rows of one division, ranked. The top row is the division winner.
export function divisionStandings(games, table = computeStandings(games)) {
  const out = {}
  for (const div of DIVISIONS) {
    const rows = Object.values(table).filter((r) => r.division === div)
    rows.sort((a, b) => compareTeams(a, b, games, { table, sameDivision: true }))
    out[div] = rows.map((r, i) => ({ ...r, divRank: i + 1, isDivisionWinner: i === 0 }))
  }
  return out
}

// The playoff seeding for one conference: 1–4 are the division winners (ranked among
// themselves), 5–7 the next three by conference tiebreaker (wild cards).
function seedConference(confKey, games, table) {
  const divs = divisionStandings(games, table)
  const winners = DIVISION_ORDER.map((d) => divs[`${confKey} ${d}`][0]).filter(Boolean)
  winners.sort((a, b) => compareTeams(a, b, games, { table }))

  const winnerAbbrs = new Set(winners.map((w) => w.abbr))
  const rest = Object.values(table)
    .filter((r) => r.conference === confKey && !winnerAbbrs.has(r.abbr))
    .sort((a, b) => compareTeams(a, b, games, { table }))

  const ordered = [...winners, ...rest]
  return ordered.map((r, i) => ({
    ...r,
    seed: i + 1,
    conference: confKey,
    isDivisionWinner: winnerAbbrs.has(r.abbr),
    seedType: winnerAbbrs.has(r.abbr) ? 'division' : 'wildcard',
    inField: i < PLAYOFF.seedsPerConference,
  }))
}

// { AFC: [rows seeded 1..16], NFC: [...] }. inField marks the top 7 of each.
export function conferenceSeeds(games) {
  const table = computeStandings(games)
  return Object.fromEntries(CONFERENCE_KEYS.map((c) => [c, seedConference(c, games, table)]))
}

// Total regular-season games each team plays, from the schedule itself (17 today, but
// derive it — makeups and format changes move the number). Games-behind isn't an NFL
// metric, so we track remaining games for the clinch math instead.
export function scheduledGames(games) {
  const total = {}
  for (const g of games) {
    if (g.seasonType !== 'regular' || g.canceled) continue
    total[g.home] = (total[g.home] || 0) + 1
    total[g.away] = (total[g.away] || 0) + 1
  }
  return total
}

// A best-effort playoff picture per conference. Clinch/elimination for the NFL is a
// notoriously hairy calculation (division winners are IN regardless of a wild card's
// record); this uses the simple bound — a team clinches a top-7 spot when even losing
// out keeps it ahead of the current 8th seed's best case, and is eliminated when winning
// out can't reach the 7th seed. Labelled approximate, and only meaningful once games are
// played (the committed 2026 snapshot is empty until September).
export function playoffPicture(games) {
  const seeds = conferenceSeeds(games)
  const totals = scheduledGames(games)
  const out = {}
  for (const conf of CONFERENCE_KEYS) {
    const rows = seeds[conf]
    const cut = rows[PLAYOFF.seedsPerConference - 1] // 7th seed
    const firstOut = rows[PLAYOFF.seedsPerConference] // 8th seed
    out[conf] = rows.map((row) => {
      const remaining = (totals[row.abbr] ?? 0) - row.gp
      const bestCasePoints = row.w + remaining // treat wins-only; ties are rare
      const clinched =
        firstOut && row.gp > 0
          ? row.w > firstOut.w + ((totals[firstOut.abbr] ?? 0) - firstOut.gp)
          : false
      const eliminated = cut && row.gp > 0 ? bestCasePoints < cut.w : false
      return { ...row, remaining, clinched, eliminated }
    })
  }
  return out
}
