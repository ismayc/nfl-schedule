import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// A two-game season, so the assertion is about the WIRING (App -> scheduleGames ->
// NextGame) and not about whatever the nightly refresh has left in the committed
// schedule. Everything else the data module exports is kept.
vi.mock('../src/data/schedule.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    GAMES: [
      {
        id: 'unwatchable',
        tip: '2026-09-10T00:20:00.000Z',
        seasonType: 'regular',
        week: 1,
        home: 'SEA',
        away: 'NE',
        venue: 'Lumen Field',
        city: 'Seattle',
        state: 'WA',
        broadcast: ['NFL Network'],
      },
      {
        id: 'watchable',
        tip: '2026-09-13T17:00:00.000Z',
        seasonType: 'regular',
        week: 1,
        home: 'KC',
        away: 'BUF',
        venue: 'Arrowhead Stadium',
        city: 'Kansas City',
        state: 'MO',
        broadcast: ['Peacock'],
      },
    ],
  }
})

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

// Before both kickoffs, so each game is genuinely upcoming and the banner has a
// choice to make.
const NOW = new Date('2026-09-09T20:00:00.000Z')

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

const banner = () => document.querySelector('.nextgame')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  // Straight to the schedule: the banner lives there, and a two-game fixture is not a
  // field the other views are built to render.
  window.history.replaceState(null, '', '/?view=schedule')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const chooseServices = (keys) => {
  localStorage.setItem('nfl:services', JSON.stringify(keys))
  localStorage.setItem('nfl:watchOnly', '1')
}

describe('the Next game banner and the services filter', () => {
  it('counts down to the true next game when no services filter is on', async () => {
    await mount()
    // Scoped to the banner: both sides are also named on the cards below, so an
    // unscoped query matches twice.
    expect(banner().textContent).toContain('Seahawks')
    expect(banner().textContent).not.toContain('Chiefs')
  })

  it('skips a game the viewer cannot watch and counts down to the next one they can', async () => {
    // Peacock only -- the earlier game is on NFL Network, which no chosen service carries.
    chooseServices(['peacock'])
    await mount()

    // The banner advertises the LATER game, because it is the next one actually
    // watchable. A banner fed the unfiltered season would still be showing the first
    // one here -- which the schedule below no longer lists either, so "Jump to it"
    // would have nowhere to land.
    expect(banner()).not.toBeNull()
    expect(banner().textContent).toContain('Chiefs')
    expect(banner().textContent).not.toContain('Seahawks')
  })

  it('leaves the banner alone when the watch filter is on but no service is chosen', async () => {
    // Deliberate carve-out: clearing every service must not empty the schedule, so the
    // filter is a no-op and the true next game is back.
    chooseServices([])
    await mount()
    expect(banner().textContent).toContain('Seahawks')
  })

  it('offers no game at all when nothing on the schedule is watchable', async () => {
    // Netflix carries neither NFL Network nor Peacock.
    chooseServices(['netflix'])
    await mount()

    expect(document.querySelector('.nextgame.done')).not.toBeNull()
    expect(screen.getByText(/see you next season/)).toBeInTheDocument()
  })
})
