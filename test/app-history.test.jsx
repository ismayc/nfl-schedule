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
    const chip = screen.getByRole('button', { name: /past days/ })
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
