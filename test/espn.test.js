import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLive, applyLive, liveCount } from '../src/services/espn.js'

// Minimal shape of an ESPN scoreboard event, with only the fields the normalizer reads.
const event = ({
  id = '1',
  state = 'in',
  completed = false,
  name,
  shortDetail = '3rd 8:24',
  period = 3,
  clock = '8:24',
  home = 21,
  away = 17,
} = {}) => ({
  id,
  competitions: [
    {
      status: { period, displayClock: clock, type: { state, completed, name, shortDetail } },
      competitors: [
        { homeAway: 'home', score: { value: home } },
        { homeAway: 'away', score: { value: away } },
      ],
    },
  ],
})

const scoreboard = (events) => ({ ok: true, json: async () => ({ events }) })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchLive', () => {
  const NOW = new Date('2026-07-20T12:00:00Z')

  it('asks for yesterday, today, and tomorrow', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    await fetchLive({ now: NOW })

    const dates = fetch.mock.calls.map((c) => new URL(c[0]).searchParams.get('dates'))
    expect(dates).toEqual(['20260719', '20260720', '20260721'])
  })

  it('rolls over year boundaries correctly', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    await fetchLive({ now: new Date('2026-01-01T00:00:00Z') })

    const dates = fetch.mock.calls.map((c) => new URL(c[0]).searchParams.get('dates'))
    expect(dates).toEqual(['20251231', '20260101', '20260102'])
  })

  it('returns games keyed by id', async () => {
    fetch.mockResolvedValue(scoreboard([event({ id: '42' })]))
    const live = await fetchLive({ now: NOW })
    expect(live.get('42')).toMatchObject({ id: '42', live: true })
  })

  it('merges the three-day window keyed by id, all requests ok', async () => {
    fetch
      .mockResolvedValueOnce(scoreboard([event({ id: 'a' })]))
      .mockResolvedValueOnce(scoreboard([event({ id: 'b' })]))
      .mockResolvedValueOnce(scoreboard([event({ id: 'c' })]))
    const live = await fetchLive({ now: NOW })
    expect([...live.keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('survives one day HTTP-erroring — the others still land', async () => {
    // A rolling window means a single bad date shouldn't blank the whole overlay.
    fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(scoreboard([event({ id: 'a' })]))
      .mockResolvedValueOnce(scoreboard([event({ id: 'b' })]))
    const live = await fetchLive({ now: NOW })
    expect([...live.keys()].sort()).toEqual(['a', 'b'])
  })

  it('survives one day rejecting — the others still land', async () => {
    fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(scoreboard([event({ id: 'a' })]))
      .mockResolvedValueOnce(scoreboard([event({ id: 'b' })]))
    const live = await fetchLive({ now: NOW })
    expect([...live.keys()].sort()).toEqual(['a', 'b'])
  })

  it('returns an empty map when every request fails', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await expect(fetchLive({ now: NOW })).resolves.toEqual(new Map())
  })

  it('returns an empty map when the window has no events', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    await expect(fetchLive({ now: NOW })).resolves.toEqual(new Map())
  })

  it('tolerates a day whose payload has no events array', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await expect(fetchLive({ now: NOW })).resolves.toEqual(new Map())
  })

  it('passes the abort signal through', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    const signal = new AbortController().signal
    await fetchLive({ now: NOW, signal })
    for (const call of fetch.mock.calls) expect(call[1]).toMatchObject({ signal })
  })

  it('defaults now to the current date without throwing', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    await expect(fetchLive()).resolves.toEqual(new Map())
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('skips malformed events rather than throwing', async () => {
    fetch.mockResolvedValue(
      scoreboard([
        { id: 'no-competition' },
        { id: 'one-sided', competitions: [{ competitors: [{ homeAway: 'home' }] }] },
        event({ id: 'good' }),
      ])
    )
    const live = await fetchLive({ now: NOW })
    expect([...live.keys()]).toEqual(['good'])
  })

  describe('normalizing status', () => {
    const one = async (over) => {
      fetch.mockResolvedValue(scoreboard([event(over)]))
      return (await fetchLive({ now: NOW })).get('1')
    }

    it('marks an in-progress game live with a running score', async () => {
      expect(await one({ state: 'in', home: 21, away: 17 })).toMatchObject({
        live: true,
        final: false,
        score: [21, 17],
        period: 3,
        statusLabel: '3rd 8:24',
        clock: '8:24',
      })
    })

    it('marks a completed game not-live but scored and final', async () => {
      const g = await one({ state: 'post', completed: true, shortDetail: 'Final' })
      expect(g.live).toBe(false)
      expect(g.final).toBe(true)
      expect(g.score).toEqual([21, 17])
    })

    it('withholds a score for a game that has not started', async () => {
      // ESPN reports 0-0 before kickoff; surfacing that would render a fake 0-0 result.
      const g = await one({ state: 'pre', completed: false, home: 0, away: 0, period: 0 })
      expect(g.live).toBe(false)
      expect(g.score).toBeUndefined()
    })

    it('withholds a score when the competitors carry no score at all', async () => {
      fetch.mockResolvedValue(
        scoreboard([
          {
            id: '1',
            competitions: [
              {
                status: { period: 1, type: { state: 'in' } },
                competitors: [{ homeAway: 'home' }, { homeAway: 'away' }],
              },
            ],
          },
        ])
      )
      const g = (await fetchLive({ now: NOW })).get('1')
      expect(g.score).toBeUndefined()
    })

    it('falls back to detail when there is no shortDetail', async () => {
      fetch.mockResolvedValue(
        scoreboard([
          {
            id: '1',
            competitions: [
              {
                status: { period: 2, type: { state: 'in', detail: 'Q2 detail' } },
                competitors: [
                  { homeAway: 'home', score: { value: 7 } },
                  { homeAway: 'away', score: { value: 3 } },
                ],
              },
            ],
          },
        ])
      )
      expect((await fetchLive({ now: NOW })).get('1').statusLabel).toBe('Q2 detail')
    })

    it('has a null status label when neither shortDetail nor detail is present', async () => {
      fetch.mockResolvedValue(
        scoreboard([
          {
            id: '1',
            competitions: [
              {
                status: { period: 2, type: { state: 'in' } },
                competitors: [
                  { homeAway: 'home', score: { value: 7 } },
                  { homeAway: 'away', score: { value: 3 } },
                ],
              },
            ],
          },
        ])
      )
      expect((await fetchLive({ now: NOW })).get('1').statusLabel).toBeNull()
    })

    it('tolerates a competition with no status object', async () => {
      fetch.mockResolvedValue(
        scoreboard([
          {
            id: '1',
            competitions: [
              {
                competitors: [
                  { homeAway: 'home', score: { value: 7 } },
                  { homeAway: 'away', score: { value: 3 } },
                ],
              },
            ],
          },
        ])
      )
      const g = (await fetchLive({ now: NOW })).get('1')
      expect(g.live).toBe(false)
      expect(g.final).toBe(false)
      expect(g.score).toBeUndefined()
      expect(g.ot).toBeUndefined()
    })

    it('flags postponed and canceled games', async () => {
      expect(await one({ state: 'post', name: 'STATUS_POSTPONED' })).toMatchObject({
        postponed: true,
      })
      expect(await one({ state: 'post', name: 'STATUS_CANCELED' })).toMatchObject({
        canceled: true,
      })
    })

    it('leaves postponed and canceled undefined for an ordinary game', async () => {
      const g = await one({ state: 'in' })
      expect(g.postponed).toBeUndefined()
      expect(g.canceled).toBeUndefined()
    })

    it('derives overtime periods past the fourth quarter', async () => {
      expect((await one({ period: 4 })).ot).toBeUndefined()
      expect((await one({ period: 5 })).ot).toBe(1)
      expect((await one({ period: 6 })).ot).toBe(2)
    })

    it('accepts a bare numeric score as well as {value}', async () => {
      fetch.mockResolvedValue(
        scoreboard([
          {
            id: 'x',
            competitions: [
              {
                status: { period: 2, type: { state: 'in' } },
                competitors: [
                  { homeAway: 'home', score: 24 },
                  { homeAway: 'away', score: 20 },
                ],
              },
            ],
          },
        ])
      )
      expect((await fetchLive({ now: NOW })).get('x').score).toEqual([24, 20])
    })
  })
})

describe('applyLive', () => {
  const committed = [
    { id: '1', home: 'MIN', away: 'SEA', tip: '2026-07-20T23:00:00.000Z' },
    { id: '2', home: 'NYG', away: 'ATL', tip: '2026-07-20T23:00:00.000Z', score: [30, 20] },
  ]

  it('returns the original list untouched when there is nothing live', () => {
    expect(applyLive(committed, null)).toBe(committed)
    expect(applyLive(committed, new Map())).toBe(committed)
  })

  it('leaves games the overlay does not mention alone', () => {
    const live = new Map([['1', { id: '1', live: true, score: [10, 8] }]])
    expect(applyLive(committed, live)[1]).toBe(committed[1])
  })

  it('overlays live score and status onto a committed game', () => {
    const live = new Map([
      ['1', { id: '1', live: true, score: [14, 7], period: 2, statusLabel: '2nd 1:10' }],
    ])
    expect(applyLive(committed, live)[0]).toMatchObject({
      id: '1',
      home: 'MIN', // committed fields survive
      live: true,
      score: [14, 7],
      statusLabel: '2nd 1:10',
    })
  })

  it('lets a fresher live result overwrite a committed score', () => {
    const live = new Map([['2', { id: '2', live: false, score: [31, 20] }]])
    expect(applyLive(committed, live)[1].score).toEqual([31, 20])
  })

  it('never lets a null or undefined field erase committed data', () => {
    // The overlay reports statusLabel: null for games it knows nothing about; that
    // must not blank a value the committed snapshot already has.
    const withLabel = [{ ...committed[1], statusLabel: 'Final' }]
    const live = new Map([['2', { id: '2', live: false, statusLabel: null, score: undefined }]])
    const [merged] = applyLive(withLabel, live)
    expect(merged.statusLabel).toBe('Final')
    expect(merged.score).toEqual([30, 20])
  })

  it('drops the internal `final` flag rather than leaking it into game objects', () => {
    const live = new Map([['1', { id: '1', live: false, final: true, score: [24, 20] }]])
    expect(applyLive(committed, live)[0]).not.toHaveProperty('final')
  })

  it('does not mutate the games it is given', () => {
    const live = new Map([['1', { id: '1', live: true, score: [14, 7] }]])
    applyLive(committed, live)
    expect(committed[0]).not.toHaveProperty('score')
  })
})

describe('liveCount', () => {
  it('counts only games flagged live', () => {
    expect(liveCount([{ live: true }, { live: false }, {}, { live: true }])).toBe(2)
    expect(liveCount([])).toBe(0)
  })
})
