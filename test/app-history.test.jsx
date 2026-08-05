import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The committed 2026 snapshot is entirely upcoming, so the "season is over" short-circuit,
// the past-days chip, and a team's completed-results form are all unreachable against it.
// Mock the schedule with a tiny finished season to exercise those branches.
vi.mock('../src/data/schedule.js', () => ({
  GAMES: [
    { id: 'h1', tip: '2025-09-08T00:20:00.000Z', seasonType: 'regular', week: 1, home: 'KC', away: 'DEN', venue: 'Arrowhead', city: 'Kansas City', state: 'MO', broadcast: ['NBC'], score: [24, 17] },
    { id: 'h2', tip: '2025-09-15T00:20:00.000Z', seasonType: 'regular', week: 2, home: 'LAC', away: 'KC', venue: 'SoFi', city: 'Inglewood', state: 'CA', broadcast: ['FOX'], score: [10, 20] },
  ],
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { HISTORY } from '../src/data/history.js'
import { TEAM_BY_ABBR } from '../src/data/teams.js'

const teamNameOf = (a) => TEAM_BY_ABBR[a]?.name ?? a

const renderApp = () => render(
  <FollowProvider>
    <App />
  </FollowProvider>
)
const mount = async () => {
  const utils = renderApp()
  await act(async () => {})
  return utils
}
const search = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App — a completed season', () => {
  it('does not poll once every game is final', async () => {
    await mount()
    // seasonOver short-circuits the polling effect before any fetch.
    expect(fetch).not.toHaveBeenCalled()
    // With no successful poll there is no "Updated" timestamp.
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })

  it('reveals past days on demand', async () => {
    await mount()
    // Both games are in the past, so nothing shows until the chip is clicked.
    expect(document.querySelectorAll('.day').length).toBe(0)
    const chip = screen.getByRole('button', { name: /Earlier games/ })
    expect(within(chip).getByText(/^\d+$/).textContent).not.toBe('0')
    await userEvent.click(chip)
    await waitFor(() => expect(search().get('past')).toBe('1'))
    expect(document.querySelectorAll('.day').length).toBeGreaterThan(0)
  })

  it('opens a game from a team panel form chip', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    // Open the KC panel (KC has two completed results → a Last 5 form).
    const kcBtn = [...document.querySelectorAll('.team-btn')].find((b) => /Chiefs/.test(b.textContent))
    await userEvent.click(kcBtn)
    const panel = screen.getByRole('dialog')
    // Clicking a form chip closes the panel and opens the game detail.
    await userEvent.click(panel.querySelector('.tp-chip'))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })
})

describe('a team opened from the History view', () => {
  // Regression: the panel was built from the live board wherever it was opened
  // from, so a team clicked in the History view showed this season's record and
  // this season's leading players. The season has to travel with the click.
  it('describes the archived season, not the live one', async () => {
    const season = HISTORY[0]
    const rows = Object.values(season.standings).flat()
    window.history.replaceState(null, '', `/?view=history&season=${season.year}`)
    await mount()

    const chip = document.querySelector('.standings .hy-team')
    expect(chip).toBeTruthy()
    const target = rows.find((r) => chip.textContent.includes(teamNameOf(r.abbr))) || rows[0]
    await userEvent.click(chip)

    const panel = await screen.findByRole('dialog')
    const record = target.t ? `${target.w}–${target.l}–${target.t}` : `${target.w}–${target.l}`
    expect(panel.querySelector('.tp-sub')).toHaveTextContent(record)
    expect(panel.querySelector('.tp-sub')).toHaveTextContent(`seed ${target.seed}`)
  })
})

describe('a team opened from the archived bracket', () => {
  it('carries the season the bracket belongs to', async () => {
    // The bracket reports a team by abbreviation alone, so it needs the season
    // stamped on separately from the standings table above it.
    const season = HISTORY[0]
    const rows = Object.values(season.standings).flat()
    window.history.replaceState(null, '', `/?view=history&season=${season.year}`)
    await mount()

    const btn = document.querySelector('.bx-team')
    expect(btn).toBeTruthy()
    const target = rows.find((r) => btn.textContent.includes(teamNameOf(r.abbr)))
    await userEvent.click(btn)

    const panel = await screen.findByRole('dialog')
    if (target) {
      const record = target.t ? `${target.w}–${target.l}–${target.t}` : `${target.w}–${target.l}`
      expect(panel.querySelector('.tp-sub')).toHaveTextContent(record)
    }
  })
})
