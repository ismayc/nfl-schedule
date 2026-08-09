import { describe, it, expect } from 'vitest'
import { scenarioClinched, MAX_COUPLED_GAMES } from '../src/utils/raceScenarios.js'

// The engine reads records from the ROWS (w/t/gp) and uses the game list only for
// the remaining schedule and the pairwise head-to-head ledger — so fixtures build
// both by hand. Abbrs are arbitrary; the caller owns pool semantics.
let synId = 0
const game = (over) => ({
  id: `syn-${synId++}`,
  seasonType: 'regular',
  tip: '2026-12-20T18:00:00.000Z',
  home: 'BBB',
  away: 'CCC',
  ...over,
})

const row = (abbr, w, t, gp) => ({ abbr, w, t, gp })

describe('scenarioClinched — coupling the bounds cannot see', () => {
  // Canonical shape: the team leads by one full win over two chasers who still play
  // EACH OTHER. Independent bounds say both could tie the floor (worst case 3rd);
  // the schedule says one of them must drop points.
  const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 0, 13), row('CCC', 9, 0, 13)]
  const totals = { AAA: 14, BBB: 14, CCC: 14 }
  const games = [game({ home: 'BBB', away: 'CCC' })]

  it('proves the clinch the independent bounds miss', () => {
    // Whoever wins B@C only TIES the floor (20 half-points), and a lone tied rival
    // with no head-to-head series banked is charged — but never both at once, so
    // at most ONE rival can ever be at the floor: top-2 is safe.
    expect(scenarioClinched('AAA', rows, totals, games, 2)).toBe(true)
  })

  it('still concedes the tighter cut the tie threat can reach', () => {
    // For cut 1 the single unbanked tied rival is charged — not clinched.
    expect(scenarioClinched('AAA', rows, totals, games, 1)).toBe(false)
  })

  it('returns null over the coupled-games budget and keeps a positive default', () => {
    expect(scenarioClinched('AAA', rows, totals, games, 2, { maxCoupled: 0 })).toBe(null)
    expect(MAX_COUPLED_GAMES).toBeGreaterThan(0)
  })

  it('short-circuits when enough rivals are already past the floor', () => {
    const caught = [row('AAA', 8, 0, 13), row('BBB', 10, 0, 13), row('CCC', 9, 0, 13)]
    expect(scenarioClinched('AAA', caught, totals, games, 1)).toBe(false)
  })
})

describe('scenarioClinched — ties are a third outcome, not a rounding', () => {
  it('sees that a TIED coupled game can lift both chasers to the floor at once', () => {
    // Both chasers sit one HALF-point short (9-3-1 = 19 vs the team's 10-3 = 20)
    // with their meeting still to play. Win/loss branches leave one rival strictly
    // ahead-or-short — but the TIE branch parks both exactly on the floor, a
    // two-rival tied group, which is charged. A win/loss-only enumeration would
    // call this a clinch; the three-way branching correctly refuses.
    const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 1, 13), row('CCC', 9, 1, 13)]
    const totals = { AAA: 14, BBB: 14, CCC: 14 }
    const games = [game({ home: 'BBB', away: 'CCC' })]
    expect(scenarioClinched('AAA', rows, totals, games, 2)).toBe(false)
  })
})

describe('scenarioClinched — floor ties and the head-to-head ledger', () => {
  const totals = { AAA: 14, BBB: 14, CCC: 14, DDD: 14, ZZZ: 14 }

  it('discounts a lone tied rival whose series the team strictly won', () => {
    // B can only reach exactly the floor (its one remaining game is uncoupled, vs a
    // club outside the pool), and the team swept the completed season series.
    const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 0, 13)]
    const games = [
      game({ home: 'AAA', away: 'BBB', score: [24, 20] }),
      game({ home: 'BBB', away: 'AAA', score: [10, 17] }),
      game({ home: 'BBB', away: 'ZZZ' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, games, 1)).toBe(true)
  })

  it('charges a lone tied rival when the season series was split', () => {
    const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 0, 13)]
    const games = [
      game({ home: 'AAA', away: 'BBB', score: [24, 20] }),
      game({ home: 'BBB', away: 'AAA', score: [17, 10] }),
      game({ home: 'BBB', away: 'ZZZ' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, games, 1)).toBe(false)
  })

  it('a tied MEETING decides nothing: one win plus one tie still banks, ties alone do not', () => {
    const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 0, 13)]
    const winPlusTie = [
      game({ home: 'AAA', away: 'BBB', score: [24, 20] }),
      game({ home: 'BBB', away: 'AAA', score: [14, 14] }),
      game({ home: 'BBB', away: 'ZZZ' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, winPlusTie, 1)).toBe(true)
    const tiesOnly = [
      game({ home: 'AAA', away: 'BBB', score: [20, 20] }),
      game({ home: 'BBB', away: 'AAA', score: [14, 14] }),
      game({ home: 'BBB', away: 'ZZZ' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, tiesOnly, 1)).toBe(false)
  })

  it('an unplayed pair game counts as a loss — a live series never banks', () => {
    // The team leads the meeting 1-0, but the rematch is still scheduled: the
    // adversary hands it to the rival, so the series reads split.
    const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 0, 12)]
    const games = [
      game({ home: 'AAA', away: 'BBB', score: [24, 20] }),
      game({ home: 'BBB', away: 'AAA' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, games, 1)).toBe(false)
  })

  it('a postponed rematch does not reopen a banked series', () => {
    const rows = [row('AAA', 10, 0, 13), row('BBB', 9, 0, 13)]
    const games = [
      game({ home: 'AAA', away: 'BBB', score: [24, 20] }),
      game({ home: 'BBB', away: 'AAA', postponed: true }),
      game({ home: 'BBB', away: 'ZZZ' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, games, 1)).toBe(true)
  })

  it('charges every rival in a three-plus-way floor tie, banked or not', () => {
    // B, C and D can all reach exactly the floor together (independent uncoupled
    // games), and the team beat each of them — but a 3+-club group opens with
    // steps the enumeration cannot see, so all three are charged.
    const rows = [
      row('AAA', 10, 0, 13),
      row('BBB', 9, 0, 13),
      row('CCC', 9, 0, 13),
      row('DDD', 9, 0, 13),
    ]
    const games = [
      game({ home: 'AAA', away: 'BBB', score: [24, 20] }),
      game({ home: 'AAA', away: 'CCC', score: [24, 20] }),
      game({ home: 'AAA', away: 'DDD', score: [24, 20] }),
      game({ home: 'BBB', away: 'ZZZ' }),
      game({ home: 'CCC', away: 'ZZZ' }),
      game({ home: 'DDD', away: 'ZZZ' }),
    ]
    expect(scenarioClinched('AAA', rows, totals, games, 3)).toBe(false)
    // With one more slot the charge no longer reaches the cut.
    expect(scenarioClinched('AAA', rows, totals, games, 4)).toBe(true)
  })

  it('ignores rivals who cannot reach the floor even winning out', () => {
    const rows = [row('AAA', 10, 0, 13), row('BBB', 2, 0, 13)]
    expect(scenarioClinched('AAA', rows, totals, [game({ home: 'BBB', away: 'ZZZ' })], 1)).toBe(
      true
    )
  })
})
