import { describe, it, expect } from 'vitest'
import {
  timeTbd,
  gameDayKey,
  gameTime,
  gameCountdown,
  liveState,
  whenBucket,
} from '../src/utils/time.js'
import { buildIcs } from '../src/utils/ics.js'

// A GAME WITH NO ANNOUNCED START TIME.
//
// ESPN sets `timeValid: false` and ships midnight US Eastern on the day of the game in
// place of the time. Read as a real instant it prints a time nobody announced, on the
// previous day anywhere west of Eastern, and makes the game look played hours before it
// is. The WNBA sibling shipped all three on 2026-10-03 — a semifinal offered at "9:00 PM"
// the evening before it was played. See sports-viewer-meta/docs/LINEAGES.md §6.
//
// Phoenix is the zone it was caught in: UTC-7 all year, so 04:00Z is 9pm the day before.
const PHX = 'America/Phoenix'
const TBD = { id: 'tbd-1', tip: '2026-10-11T04:00:00.000Z', timeTbd: true, home: "KC", away: "BUF" }
const REAL = { id: 'real-1', tip: '2026-10-11T23:00:00.000Z', home: "KC", away: "BUF" }

describe('a start time ESPN has not announced', () => {
  it('belongs to the day ESPN meant, not the day its midnight lands on locally', () => {
    expect(gameDayKey(TBD, PHX)).toBe('2026-10-11')
    expect(gameDayKey({ ...TBD, timeTbd: false }, PHX)).toBe('2026-10-10') // the bug
  })

  it('shows no clock and no countdown to a time nobody set', () => {
    expect(timeTbd(TBD)).toBe(true)
    expect(gameTime(TBD, PHX)).toBe('Time TBD')
    expect(gameCountdown(TBD, Date.parse('2026-10-10T20:00:00Z'))).toBeNull()
  })

  it('is not "live" at 1am and not "past" by breakfast', () => {
    for (const t of ['2026-10-11T05:00:00Z', '2026-10-11T12:00:00Z', '2026-10-11T18:00:00Z']) {
      expect(liveState(TBD, Date.parse(t)), t).toBe('upcoming')
      expect(whenBucket(TBD, Date.parse(t)), t).toBe('upcoming')
    }
  })

  it('still yields to a real score or a live feed', () => {
    expect(liveState({ ...TBD, score: [88, 84] })).toBe('final')
    expect(liveState({ ...TBD, live: true })).toBe('live')
  })

  it('leaves a real start entirely alone', () => {
    expect(gameTime(REAL, PHX)).toBe('4:00 PM')
    expect(gameDayKey(REAL, PHX)).toBe('2026-10-11')
    expect(liveState(REAL, Date.parse('2026-10-11T23:30:00Z'))).toBe('likely-live')
  })

  it('exports as an all-day calendar event, not a confident midnight', () => {
    const ics = buildIcs([TBD], { now: '2026-10-03T12:00:00.000Z' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261011')
    expect(ics).not.toContain('DTSTART:20261011T040000Z')
    expect(buildIcs([REAL], { now: '2026-10-03T12:00:00.000Z' })).toContain('DTSTART:20261011T230000Z')
  })
})
