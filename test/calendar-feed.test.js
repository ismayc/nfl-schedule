// The Netlify calendar function: the auto-updating webcal:// subscription.
//
// This file had no tests at all, and it is outside `coverage.include` (which is
// `src/**`), so nothing anywhere exercised the endpoint a subscriber actually
// hits. The app's own ICS builder is well covered; what was not covered is the
// wiring around it, which is where the interesting failure lives: if the live
// overlay throws and the fallback is wrong, every subscriber gets an error
// instead of a calendar.
//
// The function takes only `req.url`, so a plain object is a sufficient request.

import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from '../netlify/functions/calendar.mjs'
import { GAMES } from '../src/data/schedule.js'

const req = (qs = '') => ({ url: `https://the-nfl-schedule.netlify.app/calendar.ics${qs}` })

// Derived from committed data, never hardcoded: a refresh rewrites the schedule
// and a pinned abbreviation would rot with it.
const someTeam = GAMES[0].home

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the calendar function', () => {
  it('serves a calendar even when ESPN is unreachable', async () => {
    // The live overlay is best-effort by design. A feed outage must degrade to
    // the committed snapshot, never to an error response.
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const res = await handler(req())
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect((body.match(/BEGIN:VEVENT/g) || []).length).toBeGreaterThan(0)
  })

  it('overlays the live feed when ESPN answers', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))
    const res = await handler(req())
    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalled()
    expect((await res.text()).startsWith('BEGIN:VCALENDAR')).toBe(true)
  })

  it('filters to the requested teams', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const all = (await (await handler(req())).text()).match(/BEGIN:VEVENT/g).length
    const body = await (await handler(req(`?teams=${someTeam}`))).text()
    const some = (body.match(/BEGIN:VEVENT/g) || []).length
    expect(some).toBeGreaterThan(0)
    expect(some).toBeLessThan(all)
    expect(body).toMatch(/My Teams/)
  })

  it('serves it as a calendar, cacheable and cross-origin readable', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const res = await handler(req())
    expect(res.headers.get('content-type')).toMatch(/text\/calendar/)
    expect(res.headers.get('cache-control')).toMatch(/max-age=\d+/)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
