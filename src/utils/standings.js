// Standings, seeding, and playoff-race math — all pure functions over the merged game
// list, so they can be unit-tested with synthetic arrays and no DOM.
//
// Two things make this the NFL model rather than the WNBA one:
//   1. TIES. A tie counts as half a win: pct = (w + 0.5·t) / gp. The NFL is the only
//      league in the family that records them; miscounting a tie as a loss (what the
//      WNBA code would do) silently corrupts every derived seed.
//   2. SEEDING BY DIVISION. The four division winners take seeds 1–4 by record; the next
//      three teams by the official wild-card tie-breaking procedures are wild cards
//      (5–7). This is the opposite of the WNBA's top-8-league-wide, and getting it wrong
//      yields a plausible, wrong bracket (PLAYBOOK §4).
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
// The OFFICIAL NFL tie-breaking procedures (verified 2026-08-08 against NFL.com's
// published Tie-Breaking Procedures page), implemented over tie GROUPS — clubs with
// equal overall pct — not as a bare pairwise sort. The procedures a pairwise comparator
// cannot express (common games, the 3+-club reduction with its restart rule, the
// one-club-per-division wild-card rule, per-slot repetition) live in the group engine
// below; `compareTeams` remains the exact two-club chain. Verified against ESPN's
// published 2025 seeds (test/fixtures): all 14 field positions now match, including the
// SF/LAR wild-card order the old pruned chain missed.
//
// One step is NOT computable from the committed data: "best net touchdowns in all
// games" — schedule rows carry final scores only, no touchdown counts — so that step is
// a documented skip in every chain. The final "coin toss" is implemented as
// deterministic alphabetical order, our stand-in for the official coin toss.
const oppsOf = (row) => row.results.map((r) => r.opp)
const beatenBy = (row) => row.results.filter((r) => r.res === RESULT.WIN).map((r) => r.opp)

// Combined win pct of a set of teams (their full-season records), for SOV/SOS. The list
// may repeat an opponent — official SOV counts a twice-beaten club's record twice, and
// SOS is per game played — so duplicates are deliberately kept.
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

// Record (W-L-T) and net points in a row's games against a set of opponents.
function recordVs(row, opps) {
  const set = new Set(opps)
  const rec = { ...wlt(), net: 0, gp: 0 }
  for (const r of row.results) {
    if (!set.has(r.opp)) continue
    rec[r.res]++
    rec.net += r.pf - r.pa
    rec.gp++
  }
  return rec
}

// Opponents every tied club has played — the official "common games" set. A tied club
// is never its own opponent, so the tied clubs themselves fall out of the intersection.
function commonOpponents(group) {
  const sets = group.map((r) => new Set(oppsOf(r)))
  return [...sets[0]].filter((o) => sets.every((s) => s.has(o)))
}

// A tiebreaker step is { value(row, group, ctx) } — HIGHER value wins, null means the
// step cannot decide for this club (the whole step is then skipped, per the official
// "if not applicable, proceed" convention) — or { apply(group, ctx) } for the two steps
// that aren't per-club values (the wild-card H2H sweep, the coin toss).

// Division steps 1 (two-club: head-to-head) and 1 (three+: H2H pct in games AMONG the
// tied clubs — percentage, not sweep). For two clubs the "games among the tied" ARE the
// head-to-head games, so one value function serves both chain sizes. If any tied club
// has no games within the group (possible only in synthetic data — division mates
// always meet), the step cannot rank them all and is skipped.
const h2hAmongTied = {
  value: (r, group) => {
    const rec = recordVs(r, group.filter((o) => o !== r).map((o) => o.abbr))
    return rec.gp ? pctOf(rec) : null
  },
}

// Division step 2: best W-L-T pct within the division.
const divisionPct = { value: (r) => pctOf(r.div) }

// Division step 4 / wild-card step 2: best W-L-T pct within the conference.
const conferencePct = { value: (r) => pctOf(r.conf) }

// Division step 3 (no minimum — division pairs always share ≥4 common opponents, so the
// official text carries no gate) and wild-card step 3 (official MINIMUM OF FOUR common
// games; fewer → the step is skipped). Compared by percentage, not raw record.
const commonGames = (min) => ({
  value: (r, group) => {
    const rec = recordVs(r, commonOpponents(group))
    return rec.gp >= min ? pctOf(rec) : null
  },
})

// Division step 5 / wild-card step 4: strength of victory — combined pct of every
// opponent the club DEFEATED, counted per victory.
const strengthOfVictory = { value: (r, _g, ctx) => combinedPct(beatenBy(r), ctx.table) }

// Division step 6 / wild-card step 5: strength of schedule — combined pct of ALL
// opponents played, per game.
const strengthOfSchedule = { value: (r, _g, ctx) => combinedPct(oppsOf(r), ctx.table) }

// Division steps 7–8 / wild-card steps 6–7: best combined ranking in points scored and
// points allowed, among the club's conference (16 clubs) or the whole league (32).
// Competition ranking: 1 + clubs strictly better; tied clubs share the better rank.
// Lowest sum wins, so the value is negated. The table always carries all 32 clubs
// (blankRecord seeds every team), so both pools are complete even in synthetic seasons.
const combinedRank = (scope) => ({
  value: (r, _g, ctx) => {
    const pool = Object.values(ctx.table).filter((x) => scope === 'league' || x.conference === r.conference)
    const scoredRank = 1 + pool.filter((x) => x.pf > r.pf).length
    const allowedRank = 1 + pool.filter((x) => x.pa < r.pa).length
    return -(scoredRank + allowedRank)
  },
})

// Division step 9: best net points in COMMON games (the division chain's counterpart of
// the wild-card chain's net-points-in-conference step). No common games → no decision.
const netPointsCommon = {
  value: (r, group) => {
    const rec = recordVs(r, commonOpponents(group))
    return rec.gp ? rec.net : null
  },
}

// Wild-card step 8: best net points in CONFERENCE games (note: conference games here,
// unlike the division chain's common games).
const netPointsConference = {
  value: (r) => r.results.filter((x) => CONFERENCE_BY_ABBR[x.opp] === r.conference).reduce((n, x) => n + x.pf - x.pa, 0),
}

// Division step 10 / wild-card step 9: best net points in all games.
const netPointsAll = { value: (r) => r.diff }

// Division step 11 / wild-card step 10: best net touchdowns in all games — NOT
// COMPUTABLE from the committed data (schedule rows carry final scores only, never
// touchdown counts), so the step is recorded but can never decide.
const netTouchdowns = { value: () => null }

// Division step 12 / wild-card step 11: coin toss. Deterministic alphabetical order is
// our stand-in for the official coin toss — same trade every viewer in the family makes
// for unknowable league randomness. Always resolves, so every chain terminates here.
const coinToss = {
  apply: (group) => [[...group].sort((a, b) => a.abbr.localeCompare(b.abbr))[0]],
}

// Wild-card step 2 (three+ clubs): head-to-head SWEEP only — it applies only if one
// club beat every other tied club (advance it) or lost to every other (eliminate it).
// A split, a tie, or an unplayed pairing leaves the step undecided.
const beatAllMeetings = (h) => !!h && h.l + h.t === 0
const lostAllMeetings = (h) => !!h && h.w + h.t === 0
const h2hSweep = {
  apply: (group, ctx) => {
    const sweeper = group.find((r) =>
      group.every((o) => o === r || beatAllMeetings(headToHead(ctx.games, r.abbr, o.abbr)))
    )
    if (sweeper) return [sweeper]
    return group.filter(
      (r) => !group.every((o) => o === r || lostAllMeetings(headToHead(ctx.games, r.abbr, o.abbr)))
    )
  },
}

// The official chains, in their published step order (overall pct is the gate that
// forms the tie group, so it is not a step here). netTouchdowns is the documented skip;
// the engine appends the coin toss itself.
const DIVISION_STEPS = [
  h2hAmongTied, // 1
  divisionPct, // 2
  commonGames(1), // 3 (no four-game minimum in the division chain)
  conferencePct, // 4
  strengthOfVictory, // 5
  strengthOfSchedule, // 6
  combinedRank('conference'), // 7
  combinedRank('league'), // 8
  netPointsCommon, // 9
  netPointsAll, // 10
  netTouchdowns, // 11
]
const WILDCARD_TWO_STEPS = [
  h2hAmongTied, // 1 (only if they played — an unmet pairing skips)
  conferencePct, // 2
  commonGames(4), // 3 (official minimum of four common games)
  strengthOfVictory, // 4
  strengthOfSchedule, // 5
  combinedRank('conference'), // 6
  combinedRank('league'), // 7
  netPointsConference, // 8
  netPointsAll, // 9
  netTouchdowns, // 10
]
const WILDCARD_MULTI_STEPS = [
  h2hSweep, // 2 in the official numbering (1 is the one-club-per-division elimination)
  conferencePct, // 3
  commonGames(4), // 4
  strengthOfVictory, // 5
  strengthOfSchedule, // 6
  combinedRank('conference'), // 7
  combinedRank('league'), // 8
  netPointsConference, // 9
  netPointsAll, // 10
  netTouchdowns, // 11
]

// Apply one step to the surviving group: keep the club(s) with the best value. A step
// any club cannot answer (null) is skipped whole — official steps rank every tied club
// or none.
function applyStep(step, group, ctx) {
  if (step.apply) return step.apply(group, ctx)
  const vals = group.map((r) => step.value(r, group, ctx))
  if (vals.some((v) => v == null)) return group
  const best = Math.max(...vals)
  return group.filter((_, i) => vals[i] === best)
}

// Resolve a tie group of equal-pct clubs to its single winner, honoring the official
// RESTART RULE: when clubs are eliminated at any step, two remaining clubs restart at
// step 1 of the TWO-club chain; three remaining (from four+) restart at step 2 of the
// multi-club chain. The coin toss terminates every chain, so the loop always returns.
function resolveOne(group, twoSteps, multiSteps, ctx) {
  let steps = [...(group.length === 2 ? twoSteps : multiSteps), coinToss]
  let survivors = group
  let i = 0
  for (;;) {
    const next = applyStep(steps[i], survivors, ctx)
    if (next.length === 1) return next[0]
    if (next.length < survivors.length) {
      survivors = next
      if (next.length === 2) {
        steps = [...twoSteps, coinToss]
        i = 0
      } else {
        i = 1
      }
      continue
    }
    i++
  }
}

// The exact two-club comparator, kept for direct (pairwise) use: division chain when
// sameDivision, cross-division wild-card chain otherwise. Group resolution above goes
// through resolveOne directly; this is the same machinery on a group of two.
export function compareTeams(a, b, games, { table = computeStandings(games), sameDivision = false } = {}) {
  if (b.pct !== a.pct) return b.pct - a.pct
  const ctx = { games, table }
  const winner = sameDivision
    ? resolveOne([a, b], DIVISION_STEPS, DIVISION_STEPS, ctx)
    : resolveOne([a, b], WILDCARD_TWO_STEPS, WILDCARD_MULTI_STEPS, ctx)
  return winner === a ? -1 : 1
}

// Partition rows (already sorted by pct, descending) into runs of equal pct — the tie
// groups the official procedures operate on.
function pctGroups(rows) {
  const groups = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last[0].pct === r.pct) last.push(r)
    else groups.push([r])
  }
  return groups
}

// Order one division tie group fully. Official principle: once a club is awarded a
// position, the remaining clubs restart the applicable procedure from step 1 — so each
// position is a fresh resolveOne over the clubs still tied.
function orderDivisionGroup(group, ctx) {
  const out = []
  let pool = group
  while (pool.length > 1) {
    const top = resolveOne(pool, DIVISION_STEPS, DIVISION_STEPS, ctx)
    out.push(top)
    pool = pool.filter((r) => r !== top)
  }
  out.push(pool[0])
  return out
}

// Rows of one division, ranked by the official division procedures. The top row is the
// division winner.
export function divisionStandings(games, table = computeStandings(games)) {
  const ctx = { games, table }
  const out = {}
  for (const div of DIVISIONS) {
    const rows = Object.values(table).filter((r) => r.division === div)
    rows.sort((a, b) => b.pct - a.pct)
    const ordered = pctGroups(rows).flatMap((g) => (g.length === 1 ? g : orderDivisionGroup(g, ctx)))
    out[div] = ordered.map((r, i) => ({ ...r, divRank: i + 1, isDivisionWinner: i === 0 }))
  }
  return out
}

// Wild-card step 1: eliminate all but the highest-ranked club in EACH division — by the
// FROZEN division order (official: a division's internal order is fixed by its own
// tiebreaker once, and every later application of the procedure reuses it). This also
// covers a two-club same-division tie, where the official rule applies the division
// tiebreaker outright: the frozen order IS that tiebreaker's result.
function onePerDivision(group, frozenRank) {
  const bestByDiv = {}
  for (const r of group) {
    const cur = bestByDiv[r.division]
    if (!cur || frozenRank[r.abbr] < frozenRank[cur.abbr]) bestByDiv[r.division] = r
  }
  return group.filter((r) => bestByDiv[r.division] === r)
}

// Winner of one wild-card (cross-division) tie group: one club per division first, then
// the two-club or three+-club wild-card chain among the division representatives.
function wildCardWinner(group, frozenRank, ctx) {
  const reps = onePerDivision(group, frozenRank)
  if (reps.length === 1) return reps[0]
  return resolveOne(reps, WILDCARD_TWO_STEPS, WILDCARD_MULTI_STEPS, ctx)
}

// Order clubs by the official repeated-selection procedure: the WHOLE procedure —
// including the one-club-per-division elimination, minus already-seeded clubs — repeats
// from scratch for every successive slot. (Officially defined for the three wild cards;
// we keep selecting to order the rest of the conference table the same way.)
function orderBySelection(rows, frozenRank, ctx) {
  const out = []
  let pool = [...rows]
  while (pool.length) {
    const topPct = Math.max(...pool.map((r) => r.pct))
    const tied = pool.filter((r) => r.pct === topPct)
    const pick = tied.length === 1 ? tied[0] : wildCardWinner(tied, frozenRank, ctx)
    out.push(pick)
    pool = pool.filter((r) => r !== pick)
  }
  return out
}

// The playoff seeding for one conference: 1–4 are the division winners (ranked among
// themselves — ties among division winners are broken with the WILD-CARD procedures,
// per the official seeding rule), 5–7 the wild cards in the order the repeated
// selection produced. A division winner always outranks every wild card.
function seedConference(confKey, games, table) {
  const ctx = { games, table }
  const divs = divisionStandings(games, table)

  // Freeze each division's internal order now; every one-club-per-division elimination
  // below reuses it (official frozen-order rule).
  const frozenRank = {}
  for (const d of DIVISION_ORDER) for (const r of divs[`${confKey} ${d}`]) frozenRank[r.abbr] = r.divRank

  const winners = DIVISION_ORDER.map((d) => divs[`${confKey} ${d}`][0]).filter(Boolean)
  const seededWinners = orderBySelection(winners, frozenRank, ctx)

  const winnerAbbrs = new Set(seededWinners.map((w) => w.abbr))
  const rest = Object.values(table).filter((r) => r.conference === confKey && !winnerAbbrs.has(r.abbr))
  const orderedRest = orderBySelection(rest, frozenRank, ctx)

  const ordered = [...seededWinners, ...orderedRest]
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
