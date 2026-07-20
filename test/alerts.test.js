import { describe, it, expect } from 'vitest'
import { detectEvents, eventKey, EVENT_KINDS } from '../src/services/alerts.js'

const g = (over = {}) => ({
  id: 'g1',
  home: 'MIN',
  away: 'SEA',
  seasonType: 'regular',
  tip: '2026-07-20T23:00:00.000Z',
  ...over,
})

const kinds = (evts) => evts.map((e) => e.kind)

describe('EVENT_KINDS', () => {
  it('names the four NFL moment kinds', () => {
    expect(EVENT_KINDS).toEqual(['kickoff', 'lead-change', 'nailbiter', 'final'])
  })
})

describe('detectEvents', () => {
  it('reports nothing on first load, when there is no previous snapshot', () => {
    // Otherwise every in-progress game would announce itself on page open.
    expect(detectEvents(null, [g({ live: true, score: [21, 14], period: 3 })])).toEqual([])
  })

  it('reports nothing when nothing changed', () => {
    const snap = [g({ live: true, score: [21, 14], period: 3 })]
    expect(detectEvents(snap, snap)).toEqual([])
  })

  it('detects a kickoff', () => {
    const before = [g({ live: false })]
    const after = [g({ live: true, score: [0, 0], period: 1 })]
    expect(kinds(detectEvents(before, after))).toEqual(['kickoff'])
  })

  it('detects a final', () => {
    const before = [g({ live: true, score: [24, 21], period: 4 })]
    const after = [g({ live: false, score: [27, 21] })]
    const [e] = detectEvents(before, after)
    expect(e.kind).toBe('final')
    expect(e.leader).toBe('MIN')
    expect(e.margin).toBe(6)
  })

  it('does not fire a final when the game ends without a score', () => {
    // was live, now not live, but no score to report — nothing notable.
    const before = [g({ live: true, score: [24, 21], period: 4 })]
    const after = [g({ live: false })]
    expect(detectEvents(before, after)).toEqual([])
  })

  it('reports nothing for a game that is not live and did not just end', () => {
    const before = [g({ live: false })]
    const after = [g({ live: false })]
    expect(detectEvents(before, after)).toEqual([])
  })

  it('detects a lead change', () => {
    const before = [g({ live: true, score: [21, 20], period: 3 })]
    const after = [g({ live: true, score: [21, 24], period: 3 })]
    const [e] = detectEvents(before, after)
    expect(e.kind).toBe('lead-change')
    expect(e.leader).toBe('SEA')
  })

  it('does not treat a tie, or coming out of one, as a lead change', () => {
    const led = g({ live: true, score: [21, 14], period: 3 })
    const tied = g({ live: true, score: [21, 21], period: 3 })
    // Falling into a tie is not a lead change...
    expect(detectEvents([led], [tied])).toEqual([])
    // ...nor is breaking one by the team that was already ahead.
    expect(kinds(detectEvents([tied], [g({ live: true, score: [28, 21], period: 3 })]))).toEqual([])
  })

  it('is not a lead change when one snapshot has no score to compare', () => {
    // A live game with no score yields a null leader on one side, so no flip is seen.
    const before = [g({ live: true, period: 3 })]
    const after = [g({ live: true, score: [21, 14], period: 3 })]
    expect(detectEvents(before, after)).toEqual([])

    const before2 = [g({ live: true, score: [21, 14], period: 3 })]
    const after2 = [g({ live: true, period: 3 })]
    expect(detectEvents(before2, after2)).toEqual([])
  })

  it('does not fire on an ordinary score that keeps the same leader', () => {
    // The whole point: scoring is not itself notable.
    const before = [g({ live: true, score: [21, 14], period: 3 })]
    const after = [g({ live: true, score: [28, 14], period: 3 })]
    expect(detectEvents(before, after)).toEqual([])
  })

  describe('nailbiters', () => {
    it('fires on entering a close fourth quarter', () => {
      const before = [g({ live: true, score: [21, 10], period: 3 })]
      const after = [g({ live: true, score: [24, 21], period: 4 })]
      const [e] = detectEvents(before, after)
      expect(e.kind).toBe('nailbiter')
      expect(e.leader).toBe('MIN')
    })

    it('treats a one-score, eight-point margin as close', () => {
      const before = [g({ live: true, score: [21, 10], period: 3 })]
      const after = [g({ live: true, score: [24, 16], period: 4 })] // margin 8
      expect(kinds(detectEvents(before, after))).toEqual(['nailbiter'])
    })

    it('fires once, not on every poll while it holds', () => {
      const close = g({ live: true, score: [24, 21], period: 4 })
      const stillClose = g({ live: true, score: [24, 23], period: 4 })
      expect(detectEvents([close], [stillClose])).toEqual([])
    })

    it('ignores a close margin before the fourth quarter', () => {
      const before = [g({ live: true, score: [14, 13], period: 2 })]
      const after = [g({ live: true, score: [17, 14], period: 3 })]
      expect(detectEvents(before, after)).toEqual([])
    })

    it('ignores a blowout in the fourth', () => {
      const before = [g({ live: true, score: [28, 7], period: 3 })]
      const after = [g({ live: true, score: [35, 10], period: 4 })] // margin 25 > 8
      expect(detectEvents(before, after)).toEqual([])
    })

    it('is not a nailbiter for a live late game that has no score yet', () => {
      // marginOf returns null with no score, so the close-margin test is never met.
      const before = [g({ live: true, period: 4 })]
      const after = [g({ live: true, period: 4 })]
      expect(detectEvents(before, after)).toEqual([])
    })

    it('is not a nailbiter for a live game with no period reported', () => {
      // A missing period defaults to 0, which is before regulation ends.
      const before = [g({ live: true, score: [21, 14] })]
      const after = [g({ live: true, score: [24, 21] })]
      expect(detectEvents(before, after)).toEqual([])
    })

    it('fires in overtime, past regulation', () => {
      // period 5 (OT) counts as late; the prior snapshot was not close, so entering
      // a one-score OT is a fresh nailbiter.
      const before = [g({ live: true, score: [24, 7], period: 3 })]
      const after = [g({ live: true, score: [27, 24], period: 5 })]
      expect(kinds(detectEvents(before, after))).toContain('nailbiter')
    })
  })

  it('collapses a walk-off into a single final, not three events', () => {
    // Lead flips AND the game ends AND it was close — one moment.
    const before = [g({ live: true, score: [24, 27], period: 4 })]
    const after = [g({ live: false, score: [30, 27] })]
    expect(kinds(detectEvents(before, after))).toEqual(['final'])
  })

  it('skips postponed games', () => {
    const before = [g({ live: true, score: [21, 20], period: 3 })]
    const after = [g({ live: true, score: [21, 24], period: 3, postponed: true })]
    expect(detectEvents(before, after)).toEqual([])
  })

  it('skips canceled games', () => {
    const before = [g({ live: true, score: [21, 20], period: 3 })]
    const after = [g({ live: true, score: [21, 24], period: 3, canceled: true })]
    expect(detectEvents(before, after)).toEqual([])
  })

  it('ignores games absent from the previous snapshot', () => {
    expect(detectEvents([], [g({ live: true, score: [0, 0] })])).toEqual([])
  })

  describe('following', () => {
    const before = [
      g({ id: 'a', home: 'MIN', away: 'SEA', live: true, score: [21, 20], period: 3 }),
      g({ id: 'b', home: 'NYG', away: 'ATL', live: true, score: [21, 20], period: 3 }),
    ]
    const after = [
      g({ id: 'a', home: 'MIN', away: 'SEA', live: true, score: [21, 24], period: 3 }),
      g({ id: 'b', home: 'NYG', away: 'ATL', live: true, score: [21, 24], period: 3 }),
    ]

    it('reports every game when not filtering', () => {
      expect(detectEvents(before, after)).toHaveLength(2)
    })

    it('reports only followed teams when filtering', () => {
      const evts = detectEvents(before, after, { teams: new Set(['NYG']) })
      expect(evts).toHaveLength(1)
      expect(evts[0].id).toBe('b')
    })

    it('matches a followed team on either side of the game', () => {
      expect(detectEvents(before, after, { teams: new Set(['SEA']) })).toHaveLength(1)
    })

    it('drops every game when the followed set matches neither side', () => {
      expect(detectEvents(before, after, { teams: new Set(['XXX']) })).toEqual([])
    })

    it('does not filter when the followed set is empty', () => {
      expect(detectEvents(before, after, { teams: new Set() })).toHaveLength(2)
    })
  })
})

describe('eventKey', () => {
  it('is stable for the same moment', () => {
    const e = { id: 'g1', kind: 'lead-change', leader: 'SEA' }
    expect(eventKey(e)).toBe(eventKey({ ...e }))
  })

  it('distinguishes successive lead changes in the same game', () => {
    expect(eventKey({ id: 'g1', kind: 'lead-change', leader: 'SEA' })).not.toBe(
      eventKey({ id: 'g1', kind: 'lead-change', leader: 'MIN' })
    )
  })

  it('folds the leader into a nailbiter key', () => {
    expect(eventKey({ id: 'g1', kind: 'nailbiter', leader: 'SEA' })).not.toBe(
      eventKey({ id: 'g1', kind: 'nailbiter', leader: 'MIN' })
    )
  })

  it('distinguishes kinds within one game and ignores the leader for kickoff/final', () => {
    expect(eventKey({ id: 'g1', kind: 'final', leader: 'MIN' })).not.toBe(
      eventKey({ id: 'g1', kind: 'kickoff' })
    )
    expect(eventKey({ id: 'g1', kind: 'final', leader: 'MIN' })).toBe('g1:final:')
  })
})
