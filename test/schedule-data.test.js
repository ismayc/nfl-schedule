// Data-integrity tests for the LIVE committed schedule.
//
// Almost every other suite now runs against a frozen board (season-2025.js for a
// completed season, preseason-2026.js for an unplayed one), which is what keeps them
// from breaking the day the season starts. The cost of that is that the refresh
// workflow's gate no longer sees the regenerated schedule at all: a malformed
// src/data/schedule.js could sail through and get committed to main.
//
// This file is that gate. It asserts the properties a correct NFL schedule has in
// every state the season passes through, so it holds on opening day and in February
// alike. Nothing here may assume how much has been played.

import { describe, it, expect } from 'vitest'
import { GAMES, SEASON_TYPES } from '../src/data/schedule.js'
import { ALL_ABBRS, SEASON } from '../src/data/teams.js'

const regular = GAMES.filter((g) => g.seasonType === 'regular')
const postseason = GAMES.filter((g) => g.seasonType === 'postseason')

describe('season shape', () => {
  // 32 teams playing 17 games each, two teams to a game.
  it('carries all 272 regular-season games', () => {
    expect(regular).toHaveLength(272)
  })

  it('numbers the regular season 1 to 18', () => {
    const weeks = [...new Set(regular.map((g) => g.week))].sort((a, b) => a - b)
    expect(weeks).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  // 17 games across 18 weeks is one bye each, and a team that appears twice in a
  // week (or not at all in 18 of them) means the merge dropped or duplicated a game.
  it('gives every team 17 games and exactly one bye', () => {
    for (const abbr of ALL_ABBRS) {
      const played = regular.filter((g) => g.home === abbr || g.away === abbr)
      expect(played, abbr).toHaveLength(17)
      const weeks = played.map((g) => g.week)
      expect(new Set(weeks).size, abbr).toBe(17)
    }
  })

  it('gives every game two different, real teams', () => {
    for (const g of GAMES) {
      expect(ALL_ABBRS, `${g.id} home`).toContain(g.home)
      expect(ALL_ABBRS, `${g.id} away`).toContain(g.away)
      expect(g.home, g.id).not.toBe(g.away)
    }
  })

  it('files every game under a season type the app knows', () => {
    for (const g of GAMES) expect(SEASON_TYPES).toContain(g.seasonType)
  })

  it('gives every game a unique id and a real kickoff instant', () => {
    const ids = GAMES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of GAMES) {
      expect(Number.isNaN(new Date(g.tip).getTime()), g.id).toBe(false)
      // ESPN emits UTC and the builder keeps it that way; a local offset here would
      // render into the wrong day for viewers west of the venue.
      expect(g.tip, g.id).toMatch(/Z$/)
    }
  })

  // The whole season falls inside its own league year: September through February.
  it('keeps every kickoff inside the season it claims', () => {
    for (const g of GAMES) {
      const t = new Date(g.tip)
      expect(t >= new Date(`${SEASON}-08-01T00:00:00Z`), g.id).toBe(true)
      expect(t <= new Date(`${SEASON + 1}-03-01T00:00:00Z`), g.id).toBe(true)
    }
  })
})

describe('results, as they land', () => {
  // These are the assertions the refresh actually exercises. They say nothing about
  // HOW MANY games are played, which is the mistake that took the FIBA viewer's suite
  // down on its opening day.
  const scored = GAMES.filter((g) => g.score)

  it('writes a score as two finite numbers, or not at all', () => {
    for (const g of scored) {
      expect(g.score, g.id).toHaveLength(2)
      for (const n of g.score) expect(Number.isFinite(n), g.id).toBe(true)
    }
  })

  // Unlike basketball, an NFL regular-season game CAN end level, so a tie is legal
  // here. A postseason game cannot: it plays on until someone wins.
  it('never records a tied postseason game', () => {
    for (const g of postseason) {
      if (g.score) expect(g.score[0], g.id).not.toBe(g.score[1])
    }
  })

  it('only marks overtime on a game that has a score', () => {
    for (const g of GAMES) {
      if (g.ot) expect(Boolean(g.score), g.id).toBe(true)
    }
  })

  // A game that never kicked off has no result to report, and a dead slot left with a
  // score would be counted into the standings twice alongside its makeup game.
  it('leaves a postponed or canceled game unscored', () => {
    for (const g of GAMES) {
      if (g.postponed || g.canceled) expect(g.score, g.id).toBeUndefined()
    }
  })
})

describe('the postseason, once it exists', () => {
  // Empty until January, so every assertion here is vacuous for most of the year and
  // becomes load-bearing exactly when the bracket starts being built from these rows.
  const ROUNDS = ['WC', 'DIV', 'CONF', 'SB']

  // Deliberately tolerant of a MISSING round: the builder reads it from ESPN's
  // headline, and a game ESPN has published but not yet captioned would otherwise
  // red the refresh over something this repo cannot fix. A WRONG round is a
  // different matter, because the bracket places games by it.
  it('gives a postseason game a round the bracket can place, or none yet', () => {
    for (const g of postseason) {
      if (g.round !== undefined) expect(ROUNDS, g.id).toContain(g.round)
      // The week axis is the regular season's; a postseason game must not carry one.
      expect(g.week, g.id).toBeUndefined()
    }
  })

  // Once the bracket is complete there is no headline left to be waiting on, so an
  // unlabeled game at that point is a parsing failure, not a slow feed.
  it('labels all 13 once the whole postseason is published', () => {
    if (postseason.length < 13) return
    for (const g of postseason) expect(ROUNDS, g.id).toContain(g.round)
  })

  it('never plays more postseason games than the format has', () => {
    // 6 wild-card + 4 divisional + 2 conference + 1 Super Bowl.
    expect(postseason.length).toBeLessThanOrEqual(13)
    const count = (r) => postseason.filter((g) => g.round === r).length
    expect(count('WC')).toBeLessThanOrEqual(6)
    expect(count('DIV')).toBeLessThanOrEqual(4)
    expect(count('CONF')).toBeLessThanOrEqual(2)
    expect(count('SB')).toBeLessThanOrEqual(1)
  })
})
