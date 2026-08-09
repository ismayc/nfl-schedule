// Late-season clinch scenarios — bounded exact enumeration over the remaining
// schedule. The half-point ranges in standings.js treat rivals independently, so
// they can miss a clinch the SCHEDULE itself guarantees: two chasers who still play
// each other cannot both win out — one of them must drop points. This engine
// enumerates the remaining games among the chasers that could still matter and
// asks, outcome by outcome, whether enough rivals can actually finish ahead.
//
// Scope and honesty:
// - CLINCH side only (the division title and the playoff-berth check). The ✕ /
//   elimination flags stay purely arithmetic in standings.js so they never rest on
//   an assumption.
// - Everything is counted in HALF-POINTS (win = 2, tie = 1), because an NFL game
//   can end tied and pct = (w + t/2) / gp. That also means every enumerated game
//   branches THREE ways — home win, away win, tie — not two: a tie can lift both
//   chasers to the team's floor at once, an outcome a win/loss enumeration would
//   miss and wrongly call a clinch.
// - A ONE-rival tie at the team's floor is resolved by head-to-head, fully known
//   inside a scenario — it is step 1 of the two-club chain in BOTH the division and
//   wild-card procedures. A tie of TWO OR MORE rivals forms a 3+-club group, and
//   the NFL's multi-club procedures open with the one-club-per-division elimination
//   and the head-to-head sweep — both depending on games outside the enumeration —
//   so every rival in such a group is charged AGAINST the team. Conservative,
//   never wrong. (Same posture as the NBA sibling, whose multi-team chain also
//   opens with a step the enumeration cannot see.)
// - The engine only runs when the coupled schedule is small enough to enumerate
//   (budget gate) — exactly the late-season window where it is useful. Over budget
//   it returns null and the caller keeps the arithmetic verdict.

const isRemaining = (g) =>
  g.seasonType === 'regular' && !g.postponed && !g.canceled && !g.score

const isPlayed = (g) =>
  g.seasonType === 'regular' && !g.postponed && !g.canceled && !!g.score

// 3^11 coupled-game outcomes ≈ 177k leaf evaluations — unnoticeable in the browser.
// Three-way branching prices each game at 3 leaves (the NBA sibling's 2^18 budget
// assumed two), and 11 contested games comfortably covers the NFL's late-season
// window: cross-division pairs meet once a season, so coupled counts stay small.
export const MAX_COUPLED_GAMES = 11

// Half-points: the unit that survives ties. A finished 17-game slate orders by pct
// exactly as it orders by half-points, so comparisons here match the standings sort.
const hpOf = (r) => 2 * r.w + r.t

/**
 * Is `teamAbbr` guaranteed to finish with fewer than `cut` of the OTHER clubs in
 * `rows` at or above it, checked by enumerating the remaining coupled schedule?
 * Returns:
 *   true  — clinched: no enumerated outcome puts `cut` rivals at or above the team
 *   false — some outcome still catches the team
 *   null  — the coupled schedule is too large to enumerate (caller keeps its verdict)
 *
 * `rows` define the rival pool — a division (cut 1) or the conference clubs still
 * eligible to block a wild-card slot (cut 3) — carrying { abbr, w, t, gp };
 * `totals` is scheduledGames(games).
 */
export function scenarioClinched(teamAbbr, rows, totals, games, cut, opts = {}) {
  const maxCoupled = opts.maxCoupled ?? MAX_COUPLED_GAMES
  const team = rows.find((r) => r.abbr === teamAbbr)
  const floor = hpOf(team) // the team loses out — the adversary controls its games too
  const remaining = games.filter(isRemaining)

  // Rivals already past the floor are ahead in every scenario (points never come
  // off). Chasers are the rest that could still reach the floor by winning out;
  // anyone else can never catch the team's worst case and is irrelevant.
  let ahead0 = 0
  const chasers = new Set()
  for (const r of rows) {
    if (r.abbr === teamAbbr) continue
    const hp = hpOf(r)
    if (hp > floor) ahead0++
    else if (hp + 2 * ((totals[r.abbr] ?? 0) - r.gp) >= floor) chasers.add(r.abbr)
  }
  if (ahead0 >= cut) return false // already caught, no enumeration needed

  // Contested games: both sides are chasers, so points for one come off the other —
  // the coupling the independent bounds cannot see. Every other remaining game is
  // handed to the chaser (adversary's choice), including games vs the team.
  const coupled = remaining.filter((g) => chasers.has(g.home) && chasers.has(g.away))
  if (coupled.length > maxCoupled) return null

  // Adversary-optimal base: every chaser wins all of its uncoupled games — a win
  // (2) always beats a tie (1), so the adversary never wants a tie here.
  const pts = new Map()
  for (const abbr of chasers) {
    const r = rows.find((x) => x.abbr === abbr)
    const uncoupled = remaining.filter(
      (g) =>
        (g.home === abbr || g.away === abbr) &&
        !(chasers.has(g.home) && chasers.has(g.away))
    ).length
    pts.set(abbr, hpOf(r) + 2 * uncoupled)
  }

  // Pairwise series ledger between the team and each chaser, for the two-club
  // chain's step 1: played games (a tied game is a half each), plus the team's
  // remaining games as losses.
  const pairVs = new Map() // chaser abbr → { team: half-points, rival: half-points }
  for (const g of games) {
    const opp =
      g.home === teamAbbr && chasers.has(g.away)
        ? g.away
        : g.away === teamAbbr && chasers.has(g.home)
          ? g.home
          : null
    if (!opp) continue
    const e = pairVs.get(opp) ?? { team: 0, rival: 0 }
    if (isPlayed(g)) {
      const [hs, as] = g.score
      if (hs === as) {
        e.team += 1
        e.rival += 1
      } else {
        const winner = hs > as ? g.home : g.away
        e[winner === teamAbbr ? 'team' : 'rival'] += 2
      }
    } else if (isRemaining(g)) {
      e.rival += 2 // the team loses out — its side of the pair game is a loss
    }
    pairVs.set(opp, e)
  }

  const caughtAtLeaf = () => {
    let ahead = ahead0
    const tied = []
    for (const abbr of chasers) {
      const hp = pts.get(abbr)
      if (hp > floor) ahead++
      else if (hp === floor) tied.push(abbr)
    }
    if (ahead >= cut) return true
    if (!tied.length || ahead + tied.length < cut) return false
    if (tied.length === 1) {
      // Two-club tie: step 1 is head-to-head in both official chains, and the
      // pair's whole series is known here. The rival counts ahead unless the team
      // strictly won it (a tied meeting decides nothing).
      const e = pairVs.get(tied[0])
      const safe = e && e.team > e.rival
      return ahead + (safe ? 0 : 1) >= cut
    }
    // Three-plus-club tie: the multi-club procedures open with one-club-per-division
    // and the head-to-head sweep, which the enumeration cannot see — charge every
    // tied rival against the team.
    return ahead + tied.length >= cut
  }

  const catches = (depth) => {
    if (depth === coupled.length) return caughtAtLeaf()
    const g = coupled[depth]
    // Three real outcomes: home win, away win, tie (a half-point to each side).
    for (const [dh, da] of [
      [2, 0],
      [0, 2],
      [1, 1],
    ]) {
      pts.set(g.home, pts.get(g.home) + dh)
      pts.set(g.away, pts.get(g.away) + da)
      const caught = catches(depth + 1)
      pts.set(g.home, pts.get(g.home) - dh)
      pts.set(g.away, pts.get(g.away) - da)
      if (caught) return true
    }
    return false
  }

  return !catches(0)
}
